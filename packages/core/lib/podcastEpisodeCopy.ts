// a podcast episode's words that are the same on the web and in the app: the lines shown if it fails to load or
// play, the lines shown while it records and while its film renders, and the title of the film section on its page
// and on its topic's page

export const PODCAST_EPISODE_LOAD_FAILED_TEXT = "This podcast episode could not load. Try again."
export const PODCAST_EPISODE_PLAY_FAILED_TEXT = "This podcast episode could not play. Try again."
export const TOPIC_PODCAST_EPISODE_VIDEO_SECTION_TITLE = "Coffee Break Cinema"

// a line the unpublished card shows while work is in progress: its emoji, hidden from a screen reader, and its text
export type PodcastEpisodeProgressLine = { emoji: string; text: string }

// the line while a podcast episode records, and the line while a published podcast episode's film renders
export const PODCAST_EPISODE_RECORDING_LINE: PodcastEpisodeProgressLine = {
	emoji: "🤫",
	text: "Carl and Vienna are recording...",
}
export const TOPIC_PODCAST_EPISODE_VIDEO_RENDERING_LINE: PodcastEpisodeProgressLine = {
	emoji: "🎬",
	text: "Carl and Vienna are filming...",
}
