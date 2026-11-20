// podcast episode film activities: the row written once a render is queued, the render, the rebuild, and the failure
// mark. they run in the worker process, not the sandbox. the render and the rebuild heartbeat on an interval and stop
// once Temporal cancels the attempt. the activity names must not change, because a workflow under way replays them by
// name

import { WORKER_SHUTDOWN_FAILURE_TYPE } from "@carlnotes/contracts/scanFailure"
import { TOPIC_VIDEO_BACKFILL_TASK_QUEUE, type TopicVideoRenderVersion } from "@carlnotes/contracts/topicVideoWork"
import { type RebuildTopicVideoResult, rebuildTopicVideo } from "@carlnotes/pipeline/topicVideo/rebuildTopicVideo"
import { type RenderTopicVideoResult, renderTopicVideo } from "@carlnotes/pipeline/topicVideo/renderTopicVideo"
import {
	type MarkTopicVideoFailedOptions,
	markTopicVideoFailed,
} from "@carlnotes/pipeline/topicVideo/topicVideoFailures"
import { isPodcastEpisodePublished, saveQueuedTopicVideoRendering } from "@carlnotes/pipeline/topicVideo/topicVideoRows"
import { ApplicationFailure, Context } from "@temporalio/activity"
import { runWithHeartbeat } from "../activityHeartbeat"

/**
 * Writes a film's row as rendering once its render is queued, so the film shows as rendering while it waits for a film
 * slot.
 */
export function saveTopicPodcastEpisodeVideoRenderingActivity(podcastEpisodeId: string): Promise<void> {
	return saveQueuedTopicVideoRendering(podcastEpisodeId)
}

// the podcast episode, whether the platform pays for its film, as the backfill does, whether an earlier run of the
// render may have stored its images, as one that the reaper or the workflow started again has, and whether the
// workflow schedules the render again if the worker's shutdown cuts an attempt short
export type RenderTopicVideoActivityInput = {
	podcastEpisodeId: string
	isPlatformBilled?: boolean
	renderVersion?: TopicVideoRenderVersion
	isRestart?: boolean
	isShutdownRescheduled?: boolean
}

/**
 * Renders a podcast episode's film, heartbeating every 30 seconds, and stops the render once the attempt is cancelled
 * or its podcast episode is removed. A later attempt of a version 4 render, and a render started again, reuse what an
 * earlier run stored. An attempt that the worker's shutdown cut short fails with the worker shutdown type and its
 * attempt number, if its workflow schedules it again.
 */
export async function renderTopicPodcastEpisodeVideoActivity({
	podcastEpisodeId,
	isPlatformBilled,
	renderVersion,
	isRestart = false,
	isShutdownRescheduled = false,
}: RenderTopicVideoActivityInput): Promise<RenderTopicVideoResult> {
	// a render on the backfill's queue waits behind a new film for a slot
	const activityContext = Context.current()
	const { attempt, taskQueue } = activityContext.info
	const isRetry = renderVersion === 4 && (isRestart || attempt > 1)
	const isBackfillRender = taskQueue === TOPIC_VIDEO_BACKFILL_TASK_QUEUE

	// a removal found on the heartbeat timer stops the render, which then ends as a skip
	const removal = new AbortController()
	const stopRemovedRender = async (): Promise<void> => {
		if (!(await isPodcastEpisodePublished(podcastEpisodeId))) {
			removal.abort(new Error("the podcast episode was removed"))
		}
	}

	// render under a signal that aborts once Temporal cancels the attempt or the podcast episode is removed
	try {
		return await runWithHeartbeat(
			(cancellationSignal) => {
				const signal = AbortSignal.any([cancellationSignal, removal.signal])
				return renderTopicVideo({
					podcastEpisodeId,
					isPlatformBilled,
					isBackfillRender,
					renderVersion,
					isRetry,
					signal,
				})
			},
			{ checkOnHeartbeat: stopRemovedRender },
		)
	} catch (error) {
		// a shutdown is no fault of the render, so the workflow schedules the render again and counts no attempt for it
		if (isShutdownRescheduled && activityContext.cancellationDetails?.workerShutdown) {
			throw ApplicationFailure.create({
				message: "the worker shut down during the render",
				type: WORKER_SHUTDOWN_FAILURE_TYPE,
				nonRetryable: true,
				details: [attempt],
			})
		}
		throw error
	}
}

/**
 * Rebuilds a ready film for the image its podcast episode shows now, heartbeating every 30 seconds, and stops the
 * rebuild once the attempt is cancelled.
 */
export function rebuildTopicPodcastEpisodeVideoActivity(podcastEpisodeId: string): Promise<RebuildTopicVideoResult> {
	return runWithHeartbeat((signal) => rebuildTopicVideo(podcastEpisodeId, signal))
}

/**
 * Marks a podcast episode's film failed after its last attempt, or after a cancellation ended its first render.
 */
export function markTopicPodcastEpisodeVideoFailedActivity(
	markTopicVideoFailedOptions: MarkTopicVideoFailedOptions,
): Promise<void> {
	return markTopicVideoFailed(markTopicVideoFailedOptions)
}
