// what a film section shows for a podcast episode: the film player, the card that says the film is rendering, or
// nothing, and the section a topic's page shows while its only film is rendering
import type { PodcastEpisode, PodcastEpisodeSummary, TopicPodcast } from "@carlnotes/contracts/podcast"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { TopicVideoDialogSurface } from "@carlnotes/contracts/visitAnalytics"
import type { PodcastEpisodeVideoButtonProps } from "../components/PodcastEpisodeVideoButton"

// the film player for a ready film, the rendering card while the film renders, and null for no film
export type TopicVideoDisplay = "player" | "rendering" | null

// the topic video section as a topic's page shows it: its podcast episode and whether the section opens
type TopicVideoSection = NonNullable<TopicPodcast["topicPodcastEpisodeVideoSection"]>

/**
 * Returns what a film section shows for a podcast episode: the film player for a ready film, the rendering card while
 * its film renders, and null for a podcast episode with no film or a failed one.
 */
export function toTopicVideoDisplay(
	podcastEpisode: Pick<PodcastEpisode, "video" | "isVideoRendering">,
): TopicVideoDisplay {
	if (podcastEpisode.video) {
		return "player"
	}
	return podcastEpisode.isVideoRendering ? "rendering" : null
}

/**
 * Returns the Video button of a podcast episode with a ready film, as a pill beside its play pill, or null for a
 * podcast episode with no film.
 */
export function toPodcastEpisodeVideoPill(
	podcastEpisode: PodcastEpisodeSummary | null | undefined,
	surface: TopicVideoDialogSurface,
): PodcastEpisodeVideoButtonProps | null {
	if (!podcastEpisode?.hasVideo) {
		return null
	}
	return { podcastEpisode, label: "Video", surface, size: "pill" }
}

/**
 * Returns the topic video section for a topic's page: the topic read's section on its latest ready film, or a section
 * on the latest podcast episode while its film is rendering and no film is ready, or null.
 */
export function toTopicPageTopicVideoSection(
	topic: Pick<TopicResponse, "podcast" | "latestPodcastEpisode">,
): TopicVideoSection | null {
	// the latest ready film's section comes first
	const topicVideoSection = topic.podcast?.topicPodcastEpisodeVideoSection
	if (topicVideoSection) {
		return topicVideoSection
	}

	// a topic with no ready film shows its latest podcast episode while that film is rendering
	const { latestPodcastEpisode } = topic
	return latestPodcastEpisode?.isVideoRendering ? { podcastEpisode: latestPodcastEpisode } : null
}
