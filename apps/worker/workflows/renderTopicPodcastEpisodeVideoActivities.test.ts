// film activity tests, with the render and the rebuild stubbed: each heartbeats every 30 seconds while it runs, clears
// that interval once it ends or fails, and passes the attempt's cancellation signal down
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as topicPodcastEpisodeVideoRebuilds from "@carlnotes/pipeline/topicPodcastEpisodeVideo/rebuildTopicPodcastEpisodeVideo"
import * as topicPodcastEpisodeVideoRenders from "@carlnotes/pipeline/topicPodcastEpisodeVideo/renderTopicPodcastEpisodeVideo"
import { MockActivityEnvironment } from "@temporalio/testing"
import { DefaultLogger } from "@temporalio/worker"
import {
	rebuildTopicPodcastEpisodeVideoActivity,
	renderTopicPodcastEpisodeVideoActivity,
} from "./renderTopicPodcastEpisodeVideoActivities"

// the timer calls each test reads, which still reach the real timers
let setIntervalSpy: ReturnType<typeof spyOn>
let clearIntervalSpy: ReturnType<typeof spyOn>
beforeEach(() => {
	setIntervalSpy = spyOn(globalThis, "setInterval")
	clearIntervalSpy = spyOn(globalThis, "clearInterval")
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
	spyOn(topicPodcastEpisodeVideoRenders, "renderTopicPodcastEpisodeVideo").mockImplementation(async ({ signal }) => {
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

	// the render's signal is the attempt's, which aborts once Temporal cancels the attempt
	expect(renderSignals).toEqual([activityEnvironment.context.cancellationSignal])
	activityEnvironment.cancel()
	expect(renderSignals[0]?.aborted).toBe(true)
})

test("a rebuild that fails clears its heartbeat interval", async () => {
	// a rebuild that throws, and the signal it was given
	const rebuildSignals: (AbortSignal | undefined)[] = []
	spyOn(topicPodcastEpisodeVideoRebuilds, "rebuildTopicPodcastEpisodeVideo").mockImplementation(
		async (_podcastEpisodeId, signal) => {
			rebuildSignals.push(signal)
			throw new Error("ffmpeg exited with 137: ")
		},
	)

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
