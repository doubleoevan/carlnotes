// film activity tests, with the render and the rebuild stubbed: each heartbeats every 30 seconds while it runs, clears
// that interval once it ends or fails, and passes the attempt's cancellation signal down. a render also stops once its
// podcast episode is removed, and says so if the worker's shutdown cut its attempt short
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as topicVideoRebuilds from "@carlnotes/pipeline/topicVideo/rebuildTopicVideo"
import * as topicVideoRenders from "@carlnotes/pipeline/topicVideo/renderTopicVideo"
import * as topicVideoFailures from "@carlnotes/pipeline/topicVideo/topicVideoFailures"
import * as topicVideoRows from "@carlnotes/pipeline/topicVideo/topicVideoRows"
import type { ApplicationFailure } from "@temporalio/activity"
import { MockActivityEnvironment } from "@temporalio/testing"
import { DefaultLogger } from "@temporalio/worker"
import {
	markTopicPodcastEpisodeVideoFailedActivity,
	rebuildTopicPodcastEpisodeVideoActivity,
	renderTopicPodcastEpisodeVideoActivity,
	saveTopicPodcastEpisodeVideoRenderingActivity,
} from "./renderTopicVideoActivities"

// the timer calls each test reads, which still reach the real timers, and the read of whether the render's podcast
// episode is still published, which a test changes to remove it
let setIntervalSpy: ReturnType<typeof spyOn>
let clearIntervalSpy: ReturnType<typeof spyOn>
let isPublishedSpy: ReturnType<typeof spyOn>
beforeEach(() => {
	setIntervalSpy = spyOn(globalThis, "setInterval")
	clearIntervalSpy = spyOn(globalThis, "clearInterval")
	isPublishedSpy = spyOn(topicVideoRows, "isPodcastEpisodePublished").mockResolvedValue(true)
})

// put the timers and every stub back after each test
afterEach(() => {
	mock.restore()
})

// the activity's heartbeat interval: the call it sets, and the timer that call returned
function toHeartbeatInterval(): { sendHeartbeat: () => void; heartbeatTimer: unknown } {
	const heartbeatCallIndex = setIntervalSpy.mock.calls.findIndex(([, delayMs]: unknown[]) => delayMs === 30_000)
	const [sendHeartbeat] = setIntervalSpy.mock.calls[heartbeatCallIndex] ?? []
	return { sendHeartbeat, heartbeatTimer: setIntervalSpy.mock.results[heartbeatCallIndex]?.value }
}

test("a render heartbeats on a 30-second interval, cleared once it ends, and gets the cancellation signal", async () => {
	// a render that lets two intervals pass before it ends, and the signal it was given
	const renderSignals: (AbortSignal | undefined)[] = []
	spyOn(topicVideoRenders, "renderTopicVideo").mockImplementation(async ({ signal }) => {
		renderSignals.push(signal)
		const { sendHeartbeat } = toHeartbeatInterval()
		sendHeartbeat()
		sendHeartbeat()
		return { outcome: "skipped", reason: "ready" }
	})

	// run the activity in a mock activity context, counting its heartbeats
	const activityEnvironment = new MockActivityEnvironment()
	let heartbeatCount = 0
	activityEnvironment.on("heartbeat", () => {
		heartbeatCount += 1
	})
	const renderResult = await activityEnvironment.run(renderTopicPodcastEpisodeVideoActivity, {
		podcastEpisodeId: "episode-1",
	})

	// the render's result, a heartbeat for each interval, and the interval cleared
	expect(renderResult).toEqual({ outcome: "skipped", reason: "ready" })
	expect(heartbeatCount).toBe(2)
	expect(clearIntervalSpy).toHaveBeenCalledWith(toHeartbeatInterval().heartbeatTimer)

	// the render's signal aborts once Temporal cancels the attempt
	expect(renderSignals[0]?.aborted).toBe(false)
	activityEnvironment.cancel()
	expect(renderSignals[0]?.aborted).toBe(true)
})

test("a render whose podcast episode was removed stops at its next heartbeat", async () => {
	// a render that runs until its signal aborts, as the encode does
	isPublishedSpy.mockResolvedValue(false)
	spyOn(topicVideoRenders, "renderTopicVideo").mockImplementation(async ({ signal }) => {
		toHeartbeatInterval().sendHeartbeat()
		await new Promise((resolve) => signal?.addEventListener("abort", resolve, { once: true }))
		return { outcome: "skipped", reason: "removed" }
	})

	// the heartbeat's check finds the removal and stops the render, which ends as skipped
	const activityEnvironment = new MockActivityEnvironment()
	const renderResult = await activityEnvironment.run(renderTopicPodcastEpisodeVideoActivity, {
		podcastEpisodeId: "episode-1",
	})
	expect(renderResult).toEqual({ outcome: "skipped", reason: "removed" })
	expect(isPublishedSpy).toHaveBeenCalledWith("episode-1")
})

// a deploy shuts the worker down in the middle of a render that runs for many minutes
test("an attempt that the worker's shutdown cut short fails with the shutdown type and its attempt number", async () => {
	// a render that the shutdown's cancellation stops, as an aborted encode does
	const activityEnvironment = new MockActivityEnvironment({ attempt: 2 }, { logger: new DefaultLogger("ERROR") })
	spyOn(topicVideoRenders, "renderTopicVideo").mockImplementation(async ({ signal }) => {
		activityEnvironment.cancel("WORKER_SHUTDOWN", { workerShutdown: true } as Parameters<
			typeof activityEnvironment.cancel
		>[1])
		signal?.throwIfAborted()
		return { outcome: "skipped", reason: "ready" }
	})

	// a workflow that schedules the render again gets a failure that Temporal does not retry, with the attempt it was
	const runRender = (isShutdownRescheduled: boolean): Promise<ApplicationFailure> =>
		activityEnvironment
			.run(renderTopicPodcastEpisodeVideoActivity, { podcastEpisodeId: "episode-1", isShutdownRescheduled })
			.then(
				() => {
					throw new Error("the render did not fail")
				},
				(error: ApplicationFailure) => error,
			)
	const shutdownFailure = await runRender(true)
	expect([shutdownFailure.type, shutdownFailure.nonRetryable, shutdownFailure.details]).toEqual([
		"WorkerShutdown",
		true,
		[2],
	])

	// a render from before the workflow scheduled it again keeps its cancellation, which Temporal counts and retries
	const cancellation = await runRender(false)
	expect(cancellation.type).not.toBe("WorkerShutdown")
})

test("a rebuild that fails clears its heartbeat interval", async () => {
	// a rebuild that throws, and the signal it was given
	const rebuildSignals: (AbortSignal | undefined)[] = []
	spyOn(topicVideoRebuilds, "rebuildTopicVideo").mockImplementation(async (_podcastEpisodeId, signal) => {
		rebuildSignals.push(signal)
		throw new Error("ffmpeg exited with 137: ")
	})

	// the activity throws the rebuild's error, with the failed activity's warning kept out of the test's output
	const activityEnvironment = new MockActivityEnvironment({}, { logger: new DefaultLogger("ERROR") })
	const failedRebuild = activityEnvironment.run(rebuildTopicPodcastEpisodeVideoActivity, "episode-1")
	await expect(failedRebuild).rejects.toThrow("ffmpeg exited with 137")

	// the interval was set and cleared, and the rebuild got the attempt's signal
	const { heartbeatTimer } = toHeartbeatInterval()
	expect(heartbeatTimer).toBeDefined()
	expect(clearIntervalSpy).toHaveBeenCalledWith(heartbeatTimer)
	expect(rebuildSignals).toEqual([activityEnvironment.context.cancellationSignal])
})

test("the queue-time row and the failure mark pass their podcast episode to the row writes", async () => {
	const saveRowSpy = spyOn(topicVideoRows, "saveQueuedTopicVideoRendering").mockResolvedValue(undefined)
	const markSpy = spyOn(topicVideoFailures, "markTopicVideoFailed").mockResolvedValue(undefined)
	const activityEnvironment = new MockActivityEnvironment()
	await activityEnvironment.run(saveTopicPodcastEpisodeVideoRenderingActivity, "episode-1")

	// a cancelled render's mark keeps its flag on the way to the row write
	const cancelledMark = { podcastEpisodeId: "episode-1", reason: "cancelled", isCancelled: true }
	await activityEnvironment.run(markTopicPodcastEpisodeVideoFailedActivity, cancelledMark)
	expect(saveRowSpy.mock.calls).toEqual([["episode-1"]])
	expect(markSpy.mock.calls).toEqual([[cancelledMark]])
})

// a render that the reaper started again is the first attempt of a new workflow, and must still reuse what was stored
test("a version 4 render that was started again runs as a retry, and a first attempt does not", async () => {
	// a render that records whether it runs as a retry
	const retryFlags: (boolean | undefined)[] = []
	spyOn(topicVideoRenders, "renderTopicVideo").mockImplementation(async ({ isRetry }) => {
		retryFlags.push(isRetry)
		return { outcome: "skipped", reason: "ready" }
	})

	// a first attempt, a restart at version 4, and a restart at version 3, which stores nothing to reuse
	const activityEnvironment = new MockActivityEnvironment()
	for (const renderInput of [
		{ renderVersion: 4 },
		{ renderVersion: 4, isRestart: true },
		{ isRestart: true },
	] as const) {
		await activityEnvironment.run(renderTopicPodcastEpisodeVideoActivity, {
			podcastEpisodeId: "episode-1",
			...renderInput,
		})
	}
	expect(retryFlags).toEqual([false, true, false])
})
