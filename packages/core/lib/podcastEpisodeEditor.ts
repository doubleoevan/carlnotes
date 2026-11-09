// the Edit podcast form, as both apps word it, and the podcast episode's image as the image block edits it

import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import type { EditableImage } from "../components/TopicImageEditor"

// the menu option and the dialog title, the form's field labels, and the line after a save
export const EDIT_PODCAST_EPISODE_LABEL = "Edit podcast"
export const PODCAST_EPISODE_TITLE_LABEL = "Title"
export const PODCAST_EPISODE_DESCRIPTION_LABEL = "Description"
export const PODCAST_EPISODE_SAVED_TEXT = "Podcast saved."
export const PODCAST_EPISODE_SAVE_FAILED_TEXT = "The podcast didn't save."

// what the Edit podcast form reads from the podcast episode's page: the podcast episode, its topic's name, and the
// editor's view of its image
export type PodcastEpisodeEditorPage = Pick<
	PodcastEpisodePageResponse,
	"podcastEpisode" | "podcastEpisodeImageOrigin" | "podcastEpisodeImagePrompt" | "imageRegenerationQuota"
> & { topic: { name: string } }

/**
 * Returns the podcast episode's image as the image block edits it, from its page.
 */
export function toPodcastEpisodeEditableImage(podcastEpisodePage: PodcastEpisodeEditorPage): EditableImage {
	const { podcastEpisode } = podcastEpisodePage
	return {
		kind: "podcastEpisode",
		id: podcastEpisode.id,
		name: podcastEpisode.title ?? podcastEpisodePage.topic.name,
		image: podcastEpisode.image,
		imageOrigin: podcastEpisodePage.podcastEpisodeImageOrigin,
		imagePrompt: podcastEpisodePage.podcastEpisodeImagePrompt,
		imageRegenerationQuota: podcastEpisodePage.imageRegenerationQuota,
	}
}
