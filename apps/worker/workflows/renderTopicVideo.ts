// the podcast episode film workflows: a film's render, which a recording starts as an abandoned child and the backfill
// runs as a child, and the rebuild for a new image, which the film route starts. their names must not change, because a
// workflow under way replays them by name

import {
	toActivityApplicationFailure,
	toWorkflowFailureReason,
	WORKER_SHUTDOWN_FAILURE_TYPE,
} from "@carlnotes/contracts/scanFailure"
import { TOPIC_VIDEO_WRITE_TASK_QUEUE, type TopicVideoRenderVersion } from "@carlnotes/contracts/topicVideoWork"
import {
	HEARTBEAT_TIMEOUT_MS,
	TOPIC_VIDEO_RENDER_ATTEMPTS,
	TOPIC_VIDEO_RENDER_TIMEOUT_MS,
	TOPIC_VIDEO_WRITE_ATTEMPTS,
	TOPIC_VIDEO_WRITE_TIMEOUT_MS,
} from "@carlnotes/pipeline/stageTimeouts"
import type { RenderTopicVideoResult } from "@carlnotes/pipeline/topicVideo/renderTopicVideo"
import { CancellationScope, isCancellation, patched, proxyActivities } from "@temporalio/workflow"
import type * as activities from "./renderTopicVideoActivities"

// a render's timeout for one attempt, its heartbeat timeout, and its attempts, which the backfill's renders share
export const TOPIC_VIDEO_RENDER_OPTIONS = {
	startToCloseTimeout: TOPIC_VIDEO_RENDER_TIMEOUT_MS,
	heartbeatTimeout: HEARTBEAT_TIMEOUT_MS,
	retry: { maximumAttempts: TOPIC_VIDEO_RENDER_ATTEMPTS },
}

// the render and the rebuild work on temp files and start over on a retry
const { renderTopicPodcastEpisodeVideoActivity, rebuildTopicPodcastEpisodeVideoActivity } =
	proxyActivities<typeof activities>(TOPIC_VIDEO_RENDER_OPTIONS)

// a film's short writes may retry
const TOPIC_VIDEO_WRITE_OPTIONS = {
	startToCloseTimeout: TOPIC_VIDEO_WRITE_TIMEOUT_MS,
	retry: { maximumAttempts: TOPIC_VIDEO_WRITE_ATTEMPTS },
}

// the failure mark of a render from before the short writes had their own queue, on the render's queue
const { markTopicPodcastEpisodeVideoFailedActivity: markFailedOnRenderQueue } =
	proxyActivities<typeof activities>(TOPIC_VIDEO_WRITE_OPTIONS)

// the row written once the render is queued and the failure mark, on the short writes' queue, so neither waits behind
// a render for a film Worker's slot
const { saveTopicPodcastEpisodeVideoRenderingActivity, markTopicPodcastEpisodeVideoFailedActivity: markFailed } =
	proxyActivities<typeof activities>({ ...TOPIC_VIDEO_WRITE_OPTIONS, taskQueue: TOPIC_VIDEO_WRITE_TASK_QUEUE })

// a render from before its row was written at queue time marks its failure on its own queue
const RENDERING_ROW_PATCH = "topic-video-rendering-row"

// a render from before the workflow scheduled an attempt again after a worker's shutdown counts that attempt
const SHUTDOWN_RESCHEDULE_PATCH = "topic-video-shutdown-reschedule"

// how many times a render is scheduled again after a worker's shutdown cut its attempt short. a deploy and a
// scale-down each end one attempt, and no film meets this many, so past it the worker is failing to stay up
const SHUTDOWN_RESCHEDULE_LIMIT = 20

// the podcast episode whose film to render or rebuild, and the render version of a selected render. a render that the
// reaper started again says so, and says whether the platform pays for it, as it does on a row no user was charged for
export type TopicVideoWorkflowInput = {
	podcastEpisodeId: string
	renderVersion?: TopicVideoRenderVersion
	isPlatformBilled?: boolean
	isRestart?: boolean
}

/**
 * Writes a podcast episode's film row as rendering at once, renders the film, and returns what the render did. The film
 * is marked failed after its last attempt, and a first render that a cancellation ended is marked failed too.
 */
export async function renderTopicPodcastEpisodeVideoWorkflow({
	podcastEpisodeId,
	renderVersion,
	isPlatformBilled,
	isRestart,
}: TopicVideoWorkflowInput): Promise<RenderTopicVideoResult> {
	// read each patch once, so a render that started before a step existed replays as it began
	const isRowWrittenAtQueueTime = patched(RENDERING_ROW_PATCH)
	const isShutdownRescheduled = patched(SHUTDOWN_RESCHEDULE_PATCH)
	const markFilmFailed = isRowWrittenAtQueueTime ? markFailed : markFailedOnRenderQueue
	try {
		// the row shows the film as rendering while its render waits for a film slot
		if (isRowWrittenAtQueueTime) {
			await saveTopicPodcastEpisodeVideoRenderingActivity(podcastEpisodeId)
		}

		// the activity's input holds only what the workflow's did, so a render from before these fields replays the same
		const renderInput = {
			podcastEpisodeId,
			...(renderVersion ? { renderVersion } : {}),
			...(isPlatformBilled ? { isPlatformBilled } : {}),
			...(isRestart ? { isRestart } : {}),
		}
		return await (isShutdownRescheduled
			? renderThroughShutdowns(renderInput)
			: renderTopicPodcastEpisodeVideoActivity(renderInput))
	} catch (error) {
		if (isCancellation(error)) {
			// an interrupted first render must leave the rendering state. a film rendered again keeps its ready row
			if (patched("settle-cancelled-film")) {
				const cancelledMark = { podcastEpisodeId, reason: "cancelled", isCancelled: true }
				await CancellationScope.nonCancellable(() =>
					markFilmFailed({ ...cancelledMark, ...(renderVersion ? { renderVersion } : {}) }),
				)
			}
			throw error
		}
		await markFilmFailed({
			podcastEpisodeId,
			reason: toWorkflowFailureReason(error),
			...(renderVersion ? { renderVersion } : {}),
		})
		throw error
	}
}

// render the film, scheduling the render again each time a worker's shutdown cut an attempt short. the attempts that
// failed before the shutdown still count, and the attempt that the shutdown ended does not
async function renderThroughShutdowns(
	renderInput: activities.RenderTopicVideoActivityInput,
): Promise<RenderTopicVideoResult> {
	let attemptsLeft = TOPIC_VIDEO_RENDER_ATTEMPTS
	let rescheduledInput = { ...renderInput, isShutdownRescheduled: true }
	for (let rescheduleCount = 0; ; rescheduleCount += 1) {
		// one run of the render, with the attempts it has left
		const { renderTopicPodcastEpisodeVideoActivity: renderWithAttemptsLeft } = proxyActivities<typeof activities>({
			...TOPIC_VIDEO_RENDER_OPTIONS,
			retry: { maximumAttempts: attemptsLeft },
		})
		try {
			return await renderWithAttemptsLeft(rescheduledInput)
		} catch (error) {
			// any other failure used the render's last attempt
			const shutdownFailure = toActivityApplicationFailure(error)
			if (shutdownFailure?.type !== WORKER_SHUTDOWN_FAILURE_TYPE || rescheduleCount >= SHUTDOWN_RESCHEDULE_LIMIT) {
				throw error
			}

			// the attempts before the one that the shutdown ended are spent, and the next run reuses what this one stored
			const shutdownAttempt = Number(shutdownFailure.details[0]) || 1
			attemptsLeft = Math.max(1, attemptsLeft - (shutdownAttempt - 1))
			rescheduledInput = { ...rescheduledInput, isRestart: true }
		}
	}
}

/**
 * Rebuilds a podcast episode's film for its current image. A failed rebuild leaves the film that plays now.
 */
export async function rebuildTopicPodcastEpisodeVideoWorkflow({
	podcastEpisodeId,
}: TopicVideoWorkflowInput): Promise<void> {
	await rebuildTopicPodcastEpisodeVideoActivity(podcastEpisodeId)
}
