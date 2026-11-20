// the task queues, the workflow name, and the workflow id of a podcast episode's recording, which the worker, its
// workflows, the sweep, and the Temporal client share. the workflow sandbox cannot import the Temporal client, so they
// live here

// a recording's workflow and its activities run on their own queue, apart from the scan activities' slots, and a Topic
// Post Discussion records on the same queue. the workflow name must not change, because a recording under way replays
// it by name
export const PODCAST_EPISODE_TASK_QUEUE = "episode-recordings"
export const PODCAST_EPISODE_WORKFLOW = "recordPodcastEpisodeWorkflow"

// a scheduled Scan's chapters record on a queue of their own, so a chapter that waits hours for speech capacity never
// holds a recording slot that a script, an encode, or a person's own chapter needs
export const PODCAST_EPISODE_SCHEDULED_CHAPTER_TASK_QUEUE = "episode-scheduled-chapters"

// the join and encode of a podcast episode's audio runs on a queue of its own, with a slot for each core, because one
// encode uses about a core. podcast episodes that reach their encode together wait there and slow no script or chapter
export const PODCAST_EPISODE_ENCODE_TASK_QUEUE = "episode-encodes"

/**
 * Returns the workflow id of a Scan's podcast episode recording.
 */
export function toPodcastEpisodeWorkflowId(scanId: string): string {
	return `episode-${scanId}`
}
