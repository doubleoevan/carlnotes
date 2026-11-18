// the podcast episode film workflows: a new film's render, which a recording starts as an abandoned child, and the
// rebuild for a new image, which the film route starts. both run on the film queue, and their names must not change,
// because a workflow under way replays them by name

import { toWorkflowFailureReason } from "@carlnotes/contracts/scanFailure"
import { CancellationScope, isCancellation, patched, proxyActivities } from "@temporalio/workflow"
import type * as activities from "./renderTopicVideoActivities"

// a render gets four hours an attempt and three attempts, and one with no heartbeat for ten minutes is a stall. a
// worker with one core renders a film in about three times the film's length
export const TOPIC_VIDEO_RENDER_OPTIONS = {
	startToCloseTimeout: 4 * 60 * 60 * 1000,
	heartbeatTimeout: 10 * 60 * 1000,
	retry: { maximumAttempts: 3 },
}

// the failure mark is a short write
const WRITE_TIMEOUT_MS = 2 * 60 * 1000
const WRITE_ATTEMPTS = 3

// the render and the rebuild work on temp files and start over on a retry
const { renderTopicPodcastEpisodeVideoActivity, rebuildTopicPodcastEpisodeVideoActivity } =
	proxyActivities<typeof activities>(TOPIC_VIDEO_RENDER_OPTIONS)

// the failure mark may retry
const { markTopicPodcastEpisodeVideoFailedActivity } = proxyActivities<typeof activities>({
	startToCloseTimeout: WRITE_TIMEOUT_MS,
	retry: { maximumAttempts: WRITE_ATTEMPTS },
})

// the podcast episode whose film to render or rebuild
export type TopicVideoWorkflowInput = { podcastEpisodeId: string; renderVersion?: 3 | 4 }

/**
 * Renders a podcast episode's film, and marks it failed after the last attempt.
 */
export async function renderTopicPodcastEpisodeVideoWorkflow({
	podcastEpisodeId,
	renderVersion,
}: TopicVideoWorkflowInput): Promise<void> {
	try {
		await renderTopicPodcastEpisodeVideoActivity(
			renderVersion ? { podcastEpisodeId, renderVersion } : { podcastEpisodeId },
		)
	} catch (error) {
		if (renderVersion === 4 && isCancellation(error)) {
			// An interrupted first render must leave the rendering state. A failed upgrade keeps its ready files.
			if (patched("settle-cancelled-film")) {
				await CancellationScope.nonCancellable(() =>
					markTopicPodcastEpisodeVideoFailedActivity({ podcastEpisodeId, renderVersion, reason: "cancelled" }),
				)
			}
			throw error
		}
		await markTopicPodcastEpisodeVideoFailedActivity({
			podcastEpisodeId,
			reason: toWorkflowFailureReason(error),
			...(renderVersion ? { renderVersion } : {}),
		})
		throw error
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
