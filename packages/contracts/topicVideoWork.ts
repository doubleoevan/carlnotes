// the task queues and workflow names of podcast episode films, which the worker, its workflows, and the Temporal client
// share. the workflow sandbox cannot import the Temporal client, so they live here

// a new film renders on its own queue, apart from the recordings. the workflow names must not change, because a
// workflow under way replays them by name
export const TOPIC_VIDEO_TASK_QUEUE = "episode-videos"
export const TOPIC_VIDEO_WORKFLOW = "renderTopicPodcastEpisodeVideoWorkflow"
export const TOPIC_VIDEO_REBUILD_WORKFLOW = "rebuildTopicPodcastEpisodeVideoWorkflow"

// a rebuild for a new image starts on a queue of its own, so it never waits behind a render for a film Worker. a
// rebuild that started on the film queue before this queue existed still runs there
export const TOPIC_VIDEO_REBUILD_TASK_QUEUE = "episode-video-rebuilds"

// a film's short writes run on a queue of their own that the main queue group polls: the row written once a render is
// queued, and the failure mark. neither waits behind a render for a film Worker's slot, and both are written even if no
// film Worker runs. a mark that was scheduled on the film queue before this queue existed still runs there
export const TOPIC_VIDEO_WRITE_TASK_QUEUE = "episode-video-writes"

// the backfill of each Topic's latest podcast episode renders on its own queue too, under one fixed workflow id and a
// workflow name that must not change
export const TOPIC_VIDEO_BACKFILL_TASK_QUEUE = "episode-video-backfill"
export const TOPIC_VIDEO_BACKFILL_WORKFLOW = "backfillTopicPodcastEpisodeVideosWorkflow"
export const TOPIC_VIDEO_BACKFILL_WORKFLOW_ID = "episode-video-backfill"

// the version a film renders at: 3 draws still chapters, and 4 animates them
export type TopicVideoRenderVersion = 3 | 4

// what the backfill did: the films it rendered, skipped, and failed, the generated images it drew for them, the seconds
// the renders took, and the bytes stored
export type TopicVideoBackfillSummary = {
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
export function toTopicVideoWorkflowId(podcastEpisodeId: string): string {
	return `episode-video-${podcastEpisodeId}`
}

/**
 * Returns the workflow id of a podcast episode's film rebuild.
 */
export function toTopicVideoRebuildWorkflowId(podcastEpisodeId: string): string {
	return `episode-video-rebuild-${podcastEpisodeId}`
}
