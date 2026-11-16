import { afterEach, expect, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as topicMemories from "@carlnotes/pipeline/updateTopicMemories"
import * as monitoring from "@carlnotes/server/monitoring"
import { MockActivityEnvironment } from "@temporalio/testing"
import { listTopicMemoryBackfillPage, updateTopicMemoriesActivity } from "./topicMemoriesActivities"

afterEach(restoreConnectionPool)

test("the topic memory update propagates a spend pause without scheduling a retry", async () => {
	const updateTopicMemories = spyOn(topicMemories, "updateTopicMemories").mockResolvedValue("paused")
	try {
		// run inside the activity context so the caller supplies its cancellation signal
		const environment = new MockActivityEnvironment()
		expect(await environment.run(updateTopicMemoriesActivity, "brew-1")).toBe("paused")
		expect(updateTopicMemories).toHaveBeenCalledTimes(1)
		expect(updateTopicMemories).toHaveBeenCalledWith("brew-1", expect.any(AbortSignal))
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
		await expect(environment.run(updateTopicMemoriesActivity, "brew-1")).rejects.toThrow(
			"Journal topic memory update failed",
		)

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
})
