// what a film section shows for a podcast episode: the film player, the card that says the film is rendering, or
// nothing, and the section a topic's page shows while its only film is rendering
import type { PodcastEpisode, TopicPodcast } from "@carlnotes/contracts/podcast"
import type { TopicResponse } from "@carlnotes/contracts/topics"

// the film player for a ready film, the rendering card while the film renders, and null for no film
export type TopicPodcastEpisodeVideoDisplay = "player" | "rendering" | null

// Topic Cinema as a topic's page shows it: its podcast episode and whether the section opens
type TopicPodcastEpisodeVideoSection = NonNullable<TopicPodcast["topicPodcastEpisodeVideoSection"]>

/**
 * Returns what a film section shows for a podcast episode: the film player for a ready film, the rendering card while
 * its film renders, and null for a podcast episode with no film or a failed one.
 */
export function toTopicPodcastEpisodeVideoDisplay(
	podcastEpisode: Pick<PodcastEpisode, "video" | "isVideoRendering">,
): TopicPodcastEpisodeVideoDisplay {
	if (podcastEpisode.video) {
		return "player"
	}
	return podcastEpisode.isVideoRendering ? "rendering" : null
}

/**
 * Returns Topic Cinema for a topic's page: the topic read's section on its latest ready film, or an open section on
 * the latest podcast episode while its film is rendering and no film is ready, or null.
 */
export function toTopicPagePodcastEpisodeVideoSection(
	topic: Pick<TopicResponse, "podcast" | "latestPodcastEpisode">,
): TopicPodcastEpisodeVideoSection | null {
	// the latest ready film's section comes first
	const topicPodcastEpisodeVideoSection = topic.podcast?.topicPodcastEpisodeVideoSection
	if (topicPodcastEpisodeVideoSection) {
		return topicPodcastEpisodeVideoSection
	}

	// a topic with no ready film shows its latest podcast episode while that film is rendering
	const { latestPodcastEpisode } = topic
	return latestPodcastEpisode?.isVideoRendering ? { podcastEpisode: latestPodcastEpisode, isOpen: true } : null
}
