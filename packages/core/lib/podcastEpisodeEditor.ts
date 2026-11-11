// the Edit podcast form, as both apps word it, and the podcast episode's image and its film's own image as the image
// block edits them

import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import { toTopicPodcastEpisodeVideoImageUrls } from "@carlnotes/contracts/topicImages"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { EditableImage } from "../components/TopicImageEditor"
import { EDIT_IMAGE_DIALOG_TITLES } from "./topicImageEditor"

// the menu option and the dialog title, the form's field labels, and the line after a save
export const EDIT_PODCAST_EPISODE_LABEL = "Edit podcast"
export const PODCAST_EPISODE_TITLE_LABEL = "Title"
export const PODCAST_EPISODE_DESCRIPTION_LABEL = "Description"
export const PODCAST_EPISODE_SAVED_TEXT = "Podcast saved."
export const PODCAST_EPISODE_SAVE_FAILED_TEXT = "The podcast didn't save."

// the menu option that opens a film's image dialog, which the dialog's title repeats
export const EDIT_TOPIC_PODCAST_EPISODE_VIDEO_LABEL = EDIT_IMAGE_DIALOG_TITLES.topicPodcastEpisodeVideo

// whether the user may edit the podcast episode, and the podcast episode, if the page has one
type IsTopicPodcastEpisodeVideoEditShownOptions = {
	canEditPodcastEpisode: boolean
	podcastEpisode: Pick<PodcastEpisode, "video"> | null | undefined
}

/**
 * Returns whether a page's action menu offers Edit film: to a user who may edit the podcast episode, for a podcast
 * episode with a ready film.
 */
export function isTopicPodcastEpisodeVideoEditShown({
	canEditPodcastEpisode,
	podcastEpisode,
}: IsTopicPodcastEpisodeVideoEditShownOptions): boolean {
	return canEditPodcastEpisode && Boolean(podcastEpisode?.video)
}

/**
 * Returns the podcast episode whose film a topic page's Edit film edits, the topic's latest film, or null if the
 * page's action menu does not offer Edit film.
 */
export function toTopicPageEditedPodcastEpisode(
	topic: Pick<TopicResponse, "canEdit" | "podcast">,
): PodcastEpisode | null {
	const podcastEpisode = topic.podcast?.topicPodcastEpisodeVideoSection?.podcastEpisode
	return podcastEpisode && isTopicPodcastEpisodeVideoEditShown({ canEditPodcastEpisode: topic.canEdit, podcastEpisode })
		? podcastEpisode
		: null
}

// what the Edit podcast form reads from the podcast episode's page: the podcast episode, its topic's name, and the
// editor's view of its image and of its film's own image
export type PodcastEpisodeEditorPage = Pick<
	PodcastEpisodePageResponse,
	| "podcastEpisode"
	| "podcastEpisodeImageOrigin"
	| "podcastEpisodeImagePrompt"
	| "topicPodcastEpisodeVideoImageOrigin"
	| "topicPodcastEpisodeVideoImagePrompt"
	| "imageRegenerationQuota"
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

/**
 * Returns the image of the podcast episode's film as the image block edits it, from the podcast episode's page: the
 * film's own image, or the podcast episode's until the film has one.
 */
export function toTopicPodcastEpisodeVideoEditableImage(podcastEpisodePage: PodcastEpisodeEditorPage): EditableImage {
	const { podcastEpisode } = podcastEpisodePage
	const posterUrl = podcastEpisode.video?.posterUrl
	return {
		kind: "topicPodcastEpisodeVideo",
		id: podcastEpisode.id,
		name: podcastEpisode.title ?? podcastEpisodePage.topic.name,
		image: posterUrl ? toTopicPodcastEpisodeVideoImageUrls(posterUrl) : podcastEpisode.image,
		imageOrigin: podcastEpisodePage.topicPodcastEpisodeVideoImageOrigin ?? null,
		imagePrompt: podcastEpisodePage.topicPodcastEpisodeVideoImagePrompt ?? null,
		imageRegenerationQuota: podcastEpisodePage.imageRegenerationQuota,
	}
}
