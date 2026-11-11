// the podcast episode film workflows: a new film's render, which a recording starts as an abandoned child, and the
// rebuild for a new image, which the film route starts. both run on the film queue

import { toWorkflowFailureReason } from "@carlnotes/contracts/scanFailure"
import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "./renderTopicPodcastEpisodeVideoActivities"

// a render gets four hours an attempt and three attempts, and one with no heartbeat for ten minutes is a stall. a
// worker with one core renders a film in about three times the film's length
export const TOPIC_PODCAST_EPISODE_VIDEO_RENDER_OPTIONS = {
	startToCloseTimeout: 4 * 60 * 60 * 1000,
	heartbeatTimeout: 10 * 60 * 1000,
	retry: { maximumAttempts: 3 },
}

// the failure mark is a short write
const WRITE_TIMEOUT_MS = 2 * 60 * 1000
const WRITE_ATTEMPTS = 3

// the render and the rebuild work on temp files and start over on a retry
const { renderTopicPodcastEpisodeVideoActivity, rebuildTopicPodcastEpisodeVideoActivity } = proxyActivities<
	typeof activities
>(TOPIC_PODCAST_EPISODE_VIDEO_RENDER_OPTIONS)

// the failure mark may retry
const { markTopicPodcastEpisodeVideoFailedActivity } = proxyActivities<typeof activities>({
	startToCloseTimeout: WRITE_TIMEOUT_MS,
	retry: { maximumAttempts: WRITE_ATTEMPTS },
})

// the podcast episode whose film to render or rebuild
export type TopicPodcastEpisodeVideoWorkflowInput = { podcastEpisodeId: string }

/**
 * Renders a podcast episode's film, and marks it failed after the last attempt.
 */
export async function renderTopicPodcastEpisodeVideoWorkflow({
	podcastEpisodeId,
}: TopicPodcastEpisodeVideoWorkflowInput): Promise<void> {
	try {
		await renderTopicPodcastEpisodeVideoActivity({ podcastEpisodeId })
	} catch (error) {
		await markTopicPodcastEpisodeVideoFailedActivity({ podcastEpisodeId, reason: toWorkflowFailureReason(error) })
		throw error
	}
}

/**
 * Rebuilds a podcast episode's film for its current image. A failed rebuild leaves the film that plays now.
 */
export async function rebuildTopicPodcastEpisodeVideoWorkflow({
	podcastEpisodeId,
}: TopicPodcastEpisodeVideoWorkflowInput): Promise<void> {
	await rebuildTopicPodcastEpisodeVideoActivity(podcastEpisodeId)
}
