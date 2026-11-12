// the task queues and workflow names of podcast episode films, which the worker, its workflows, and the Temporal client
// share. the workflow sandbox cannot import the Temporal client, so they live here

// a new film and a rebuild render on their own queue, apart from the recordings
export const TOPIC_PODCAST_EPISODE_VIDEO_TASK_QUEUE = "episode-videos"
export const TOPIC_PODCAST_EPISODE_VIDEO_WORKFLOW = "renderTopicPodcastEpisodeVideoWorkflow"
export const TOPIC_PODCAST_EPISODE_VIDEO_REBUILD_WORKFLOW = "rebuildTopicPodcastEpisodeVideoWorkflow"

// the backfill of each Topic's latest podcast episode renders on its own queue too, under one fixed workflow id
export const TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_TASK_QUEUE = "episode-video-backfill"
export const TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_WORKFLOW = "backfillTopicPodcastEpisodeVideosWorkflow"
export const TOPIC_PODCAST_EPISODE_VIDEO_BACKFILL_WORKFLOW_ID = "episode-video-backfill"

// what the backfill did: the films it rendered, skipped, and failed, the generated images it drew for them, the seconds
// the renders took, and the bytes stored
export type TopicPodcastEpisodeVideoBackfillSummary = {
	renderedCount: number
	skippedCount: number
	failedCount: number
	generatedChapterImageCount: number
	renderSeconds: number
	byteSize: number
}

/**
 * Returns the workflow id of a podcast episode's film render.
 */
export function toTopicPodcastEpisodeVideoWorkflowId(podcastEpisodeId: string): string {
	return `episode-video-${podcastEpisodeId}`
}

/**
 * Returns the workflow id of a podcast episode's film rebuild.
 */
export function toTopicPodcastEpisodeVideoRebuildWorkflowId(podcastEpisodeId: string): string {
	return `episode-video-rebuild-${podcastEpisodeId}`
}
