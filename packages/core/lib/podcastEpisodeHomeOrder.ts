// who sees the podcast episode page's rank actions: Home podcasts and Home films, which rank the home's podcast
// episodes and films, and Featured podcasts and Featured films, which rank the profile's of the topic's owner

import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"

// the page fields that decide both actions
type PodcastEpisodeHomeOrderPage = Pick<
	PodcastEpisodePageResponse,
	"topic" | "podcastEpisode" | "homePodcastEpisodes" | "homeTopicPodcastEpisodeVideos"
>

/**
 * Returns whether the page offers Home podcasts: to an admin, on a public topic.
 */
export function isPodcastEpisodeHomeOrderShown(podcastEpisodePage: PodcastEpisodeHomeOrderPage): boolean {
	return Boolean(podcastEpisodePage.homePodcastEpisodes) && podcastEpisodePage.topic.visibility === "public"
}

/**
 * Returns whether the page offers Home films: to an admin, on a public topic, for a podcast episode with a ready
 * film.
 */
export function isTopicPodcastEpisodeVideoHomeOrderShown(podcastEpisodePage: PodcastEpisodeHomeOrderPage): boolean {
	return (
		Boolean(podcastEpisodePage.homeTopicPodcastEpisodeVideos) &&
		podcastEpisodePage.topic.visibility === "public" &&
		Boolean(podcastEpisodePage.podcastEpisode.video)
	)
}

/**
 * Returns whether the page offers Featured podcasts: to the topic's owner, on a public topic, for a published podcast
 * episode.
 */
export function isPodcastEpisodeProfileOrderShown({
	topic,
	podcastEpisode,
}: Pick<PodcastEpisodePageResponse, "topic" | "podcastEpisode">): boolean {
	return topic.isTopicOwner && topic.visibility === "public" && podcastEpisode.status === "published"
}

/**
 * Returns whether the page offers Featured films: to whoever it offers Featured podcasts, for a podcast episode with
 * a ready film.
 */
export function isTopicPodcastEpisodeVideoProfileOrderShown(
	podcastEpisodePage: Pick<PodcastEpisodePageResponse, "topic" | "podcastEpisode">,
): boolean {
	return isPodcastEpisodeProfileOrderShown(podcastEpisodePage) && Boolean(podcastEpisodePage.podcastEpisode.video)
}
