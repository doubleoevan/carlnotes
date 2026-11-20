import { afterEach, expect, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { HEARTBEAT_INTERVAL_MS } from "@carlnotes/pipeline/stageTimeouts"
import * as topicMemories from "@carlnotes/pipeline/updateTopicMemories"
import * as monitoring from "@carlnotes/server/monitoring"
import { MockActivityEnvironment } from "@temporalio/testing"
import { listTopicMemoryBackfillPage, updateTopicMemoriesActivity } from "./topicMemoriesActivities"

afterEach(restoreConnectionPool)

test("the activity returns a spend pause as its result and gives the update its wait deadline", async () => {
	const updateTopicMemories = spyOn(topicMemories, "updateTopicMemories").mockResolvedValue("paused")
	try {
		// run inside the activity context so the caller supplies its cancellation signal
		const environment = new MockActivityEnvironment()
		expect(await environment.run(updateTopicMemoriesActivity, "brew-1")).toBe("paused")
		expect(updateTopicMemories).toHaveBeenCalledWith("brew-1", expect.any(AbortSignal), {
			waitDeadlineAt: expect.any(Number),
			isPlatformBilled: false,
		})

		// the backfill's update is the platform's to pay for
		await environment.run(updateTopicMemoriesActivity, "brew-2", true)
		expect(updateTopicMemories.mock.calls[1]?.[2]).toMatchObject({ isPlatformBilled: true })
		// no model call waits to try again in the last half minute of the four-minute attempt
		const waitMs = (updateTopicMemories.mock.calls[0]?.[2]?.waitDeadlineAt ?? 0) - Date.now()
		expect(waitMs).toBeGreaterThan(205_000)
		expect(waitMs).toBeLessThanOrEqual(210_000)
	} finally {
		updateTopicMemories.mockRestore()
	}
})

test("Journal cancellation stops the activity and provider errors omit the original message", async () => {
	// cancellation reaches the pipeline and the provider's original error never crosses the activity boundary
	const updateTopicMemories = spyOn(topicMemories, "updateTopicMemories").mockImplementation((_, signal) => {
		return Promise.reject(signal.aborted ? signal.reason : new Error("provider returned credential data"))
	})
	try {
		const environment = new MockActivityEnvironment()
		const failure = await environment.run(updateTopicMemoriesActivity, "brew-1").catch((error: unknown) => error)
		expect(failure).toMatchObject({ message: "Journal topic memory update failed", type: "TopicMemoryUpdateFailed" })
		expect(JSON.stringify(failure, Object.getOwnPropertyNames(failure))).not.toContain("credential data")

		// cancelling the attempt aborts the exact signal sent to the pipeline
		environment.cancel()
		const signal = updateTopicMemories.mock.calls[0]?.[1]
		expect(signal?.aborted).toBe(true)
	} finally {
		updateTopicMemories.mockRestore()
	}
})

test("a rejected owner key is reported as a visible nonretryable Journal failure", async () => {
	// a typed pipeline error exposes only a safe message and the Scan identifier
	const failure = new topicMemories.TopicMemoryAuthenticationError()
	const update = spyOn(topicMemories, "updateTopicMemories").mockRejectedValue(failure)
	const report = spyOn(monitoring, "reportError").mockImplementation(() => {})
	try {
		const environment = new MockActivityEnvironment()
		await expect(environment.run(updateTopicMemoriesActivity, "brew-1")).rejects.toMatchObject({
			type: "TopicMemoryAuthenticationFailed",
			nonRetryable: true,
			message: failure.message,
		})
		expect(report).toHaveBeenCalledWith(failure, "worker", { scanId: "brew-1", operation: "topicMemories" })
	} finally {
		update.mockRestore()
		report.mockRestore()
	}
})

test("an update that fails its last attempt is reported by its class and codes alone", async () => {
	// a provider failure whose message holds what must never be logged
	const providerFailure = Object.assign(new Error("the prompt and the key sk-owner"), {
		name: "AI_APICallError",
		statusCode: 503,
		cause: Object.assign(new Error("socket closed for sk-owner"), { code: "ECONNRESET" }),
	})
	const update = spyOn(topicMemories, "updateTopicMemories").mockRejectedValue(providerFailure)
	const report = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const log = spyOn(console, "error").mockImplementation(() => {})
	try {
		// the first two attempts fail quietly, because Temporal runs the update again
		for (const attempt of [1, 2]) {
			const environment = new MockActivityEnvironment({ attempt })
			await expect(environment.run(updateTopicMemoriesActivity, "brew-1")).rejects.toMatchObject({
				type: "TopicMemoryUpdateFailed",
			})
		}
		expect(report).not.toHaveBeenCalled()

		// the third leaves the Scan with no topic memories
		const lastAttempt = new MockActivityEnvironment({ attempt: 3 })
		await expect(lastAttempt.run(updateTopicMemoriesActivity, "brew-1")).rejects.toMatchObject({
			type: "TopicMemoryUpdateFailed",
		})
		expect(report).toHaveBeenCalledTimes(1)
		const [reported, stage, extra] = report.mock.calls[0] ?? []
		expect(stage).toBe("worker")
		expect(extra).toEqual({
			scanId: "brew-1",
			operation: "topicMemories",
			errorName: "AI_APICallError",
			statusCode: "503",
			errorCode: "ECONNRESET",
		})
		expect(JSON.stringify([String(reported), extra, log.mock.calls])).not.toContain("sk-owner")
	} finally {
		update.mockRestore()
		report.mockRestore()
		log.mockRestore()
	}
})

test("an update that finds the Scan's lease held is tried again after a whole attempt's time", async () => {
	// another attempt of the same Scan is still running
	const update = spyOn(topicMemories, "updateTopicMemories").mockRejectedValue(
		new topicMemories.TopicMemoryLeaseHeldError(),
	)
	try {
		const environment = new MockActivityEnvironment()
		const failure = await environment.run(updateTopicMemoriesActivity, "brew-1").catch((error: unknown) => error)
		// Temporal waits five minutes, where the retry policy's own waits would spend every attempt in ninety seconds
		expect(failure).toMatchObject({
			type: "TopicMemoryUpdateLeaseHeld",
			nonRetryable: false,
			nextRetryDelay: 5 * 60 * 1000,
		})
	} finally {
		update.mockRestore()
	}
})

test("the update heartbeats on the shared interval and stops when it ends", async () => {
	// hold the update open until the captured heartbeat timer has fired once
	let fireHeartbeat = (): void => {}
	const timer = spyOn(globalThis, "setInterval").mockImplementation(((onInterval: () => void) => {
		fireHeartbeat = onInterval
		return 7
	}) as unknown as typeof setInterval)
	const clear = spyOn(globalThis, "clearInterval").mockImplementation(() => {})

	// an update that lets one interval pass before it ends
	const update = spyOn(topicMemories, "updateTopicMemories").mockImplementation(async () => {
		fireHeartbeat()
		return "updated"
	})
	try {
		// run the activity in a mock activity context, counting its heartbeats
		const environment = new MockActivityEnvironment()
		let heartbeatCount = 0
		environment.on("heartbeat", () => {
			heartbeatCount++
		})
		expect(await environment.run(updateTopicMemoriesActivity, "brew-1")).toBe("updated")
		// one heartbeat reached Temporal, on the interval that the heartbeat timeout is sized for
		expect(heartbeatCount).toBe(1)
		expect(timer.mock.calls[0]?.[1]).toBe(HEARTBEAT_INTERVAL_MS)
		expect(clear).toHaveBeenCalledWith(7)
	} finally {
		// put the timers and the update back
		timer.mockRestore()
		clear.mockRestore()
		update.mockRestore()
	}
})

test("backfill picks the last five succeeded brews before its cutoff and runs oldest first", async () => {
	// a Topic with no successful brew still advances the cursor
	const queries = stubConnectionPool(() => [
		...Array.from({ length: 5 }, (_, index) => ["topic-2", `brew-${index + 1}`]),
		["topic-3", null],
	])
	const before = "2026-11-15T12:00:00.000Z"
	expect(await listTopicMemoryBackfillPage({ before, afterTopicId: "topic-1" })).toEqual({
		scanIdsByTopic: [["brew-1", "brew-2", "brew-3", "brew-4", "brew-5"], []],
		afterTopicId: "topic-3",
	})
	expect(queries).toHaveLength(1)
	expect(queries[0]?.text).toContain("left join lateral")
	expect(queries[0]?.values).toEqual(["topic-1", 20, "succeeded", before, 5])

	// a Scan that its user stopped is left out, the five newest are chosen, and each Topic's run oldest first
	const queryText = queries[0]?.text ?? ""
	expect(queryText).toContain('"scans"."stopped_at" is null')
	expect(queryText).toContain('order by "scans"."started_at" desc, "scans"."id" desc limit')
	expect(queryText).toContain('order by "topic_page"."id", "latest_scans"."started_at", "latest_scans"."id"')
})
