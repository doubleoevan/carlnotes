// podcast episode film activities: the render, the rebuild, and the failure mark. they run in the worker process, not
// the sandbox. the render and the rebuild heartbeat on an interval and stop once Temporal cancels the attempt

import {
	type RebuildTopicPodcastEpisodeVideoResult,
	rebuildTopicPodcastEpisodeVideo,
} from "@carlnotes/pipeline/topicPodcastEpisodeVideo/rebuildTopicPodcastEpisodeVideo"
import {
	type RenderTopicPodcastEpisodeVideoResult,
	renderTopicPodcastEpisodeVideo,
} from "@carlnotes/pipeline/topicPodcastEpisodeVideo/renderTopicPodcastEpisodeVideo"
import { markTopicPodcastEpisodeVideoFailed } from "@carlnotes/pipeline/topicPodcastEpisodeVideo/topicPodcastEpisodeVideoRows"
import { Context } from "@temporalio/activity"

// how often a render or a rebuild heartbeats while it runs
const HEARTBEAT_INTERVAL_MS = 30_000

// the podcast episode, and whether the platform pays for its film, as the backfill does
export type RenderTopicPodcastEpisodeVideoActivityInput = { podcastEpisodeId: string; isPlatformBilled?: boolean }

/**
 * Renders a podcast episode's film, heartbeating every 30 seconds, and stops the render once the attempt is cancelled.
 */
export function renderTopicPodcastEpisodeVideoActivity({
	podcastEpisodeId,
	isPlatformBilled,
}: RenderTopicPodcastEpisodeVideoActivityInput): Promise<RenderTopicPodcastEpisodeVideoResult> {
	return runWithHeartbeat((signal) => renderTopicPodcastEpisodeVideo({ podcastEpisodeId, isPlatformBilled, signal }))
}

/**
 * Rebuilds a ready film for the image its podcast episode shows now, heartbeating every 30 seconds, and stops the
 * rebuild once the attempt is cancelled.
 */
export function rebuildTopicPodcastEpisodeVideoActivity(
	podcastEpisodeId: string,
): Promise<RebuildTopicPodcastEpisodeVideoResult> {
	return runWithHeartbeat((signal) => rebuildTopicPodcastEpisodeVideo(podcastEpisodeId, signal))
}

// run a film step with the activity's cancellation signal, heartbeating on an interval until the step ends
async function runWithHeartbeat<StepResult>(
	runStep: (signal: AbortSignal) => Promise<StepResult>,
): Promise<StepResult> {
	// heartbeat while the step runs, however long one ffmpeg run takes
	const activityContext = Context.current()
	const heartbeatInterval = setInterval(() => activityContext.heartbeat(), HEARTBEAT_INTERVAL_MS)
	try {
		return await runStep(activityContext.cancellationSignal)
	} finally {
		clearInterval(heartbeatInterval)
	}
}

// the podcast episode whose film failed, and the failure's reason
export type MarkTopicPodcastEpisodeVideoFailedInput = { podcastEpisodeId: string; reason: string }

/**
 * Marks a podcast episode's film failed after its last attempt.
 */
export function markTopicPodcastEpisodeVideoFailedActivity({
	podcastEpisodeId,
	reason,
}: MarkTopicPodcastEpisodeVideoFailedInput): Promise<void> {
	return markTopicPodcastEpisodeVideoFailed(podcastEpisodeId, reason)
}
