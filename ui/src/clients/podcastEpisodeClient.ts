// the api client for the podcast episode routes
import {
	type PodcastEpisode,
	type PodcastEpisodeListenPayload,
	type PodcastEpisodePageResponse,
	podcastEpisode,
	podcastEpisodePageResponse,
	type SeasonPodcastEpisodes,
	seasonPodcastEpisodes,
} from "@shared/contracts"
import { z } from "zod"
import { apiClient } from "./apiClient"

// what a podcast feed url request returns
const podcastFeedUrlResponse = z.object({ podcastFeedUrl: z.string() })

// the url params of a podcast episode's own page
export type PodcastEpisodePageParams = { topicId: string; season: string; episodeNumber: string }

// the result of saving a topic's podcast setting
export type TopicPodcastResult = "saved" | "planRejected" | "failed"

/**
 * Loads one podcast episode with its chapters and the user's progress,
 * or null if the episode is missing or the user may not listen to the episode.
 */
export async function fetchPodcastEpisode(podcastEpisodeId: string): Promise<PodcastEpisode | null> {
	const response = await apiClient.api.episodes[":id"].$get({ param: { id: podcastEpisodeId } })
	return response.ok ? podcastEpisode.parse(await response.json()) : null
}

/**
 * Loads a podcast episode's page, or null if the topic has no such episode or the user may not listen to the episode.
 */
export async function fetchPodcastEpisodePage({
	topicId,
	season,
	episodeNumber,
}: PodcastEpisodePageParams): Promise<PodcastEpisodePageResponse | null> {
	const response = await apiClient.api.topics[":id"].episodes[":season"][":episodeNumber"].$get({
		param: { id: topicId, season, episodeNumber },
	})
	return response.ok ? podcastEpisodePageResponse.parse(await response.json()) : null
}

// a season's number and its podcast episodes
export type FetchedSeason = { season: number; seasonPodcastEpisodes: SeasonPodcastEpisodes }

/**
 * Loads a season's podcast episodes, or none if the request fails.
 */
export async function fetchSeasonPodcastEpisodes(topicId: string, season: number): Promise<SeasonPodcastEpisodes> {
	// a request that throws an error has no response, and returns no podcast episodes
	const response = await apiClient.api.topics[":id"].episodes
		.$get({ param: { id: topicId }, query: { season: String(season) } })
		.catch(() => null)
	return response?.ok ? seasonPodcastEpisodes.parse(await response.json()) : { podcastEpisodes: [] }
}

/**
 * Loads the newest unplayed podcast episode from another topic that the user owns or subscribes to,
 * or null if there is none.
 */
export async function fetchNextUnplayedPodcastEpisode(currentTopicId: string): Promise<PodcastEpisode | null> {
	const response = await apiClient.api.episodes["next-unplayed"].$get({ query: { topicId: currentTopicId } })
	if (!response.ok) {
		return null
	}
	return z.object({ podcastEpisode: podcastEpisode.nullable() }).parse(await response.json()).podcastEpisode
}

/**
 * Saves the user's progress in a podcast episode with a request that outlives the page. A failed save is dropped.
 */
export function sendPodcastEpisodeListen(
	podcastEpisodeId: string,
	podcastEpisodeListen: PodcastEpisodeListenPayload,
): void {
	fetch(`/api/episodes/${podcastEpisodeId}/listen`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(podcastEpisodeListen),
		keepalive: true,
	}).catch(() => {})
}

// a podcast episode, the position of one of its chapters, and the chapter's new rating, or null to clear it
type SendPodcastEpisodeChapterRatingOptions = {
	podcastEpisodeId: string
	position: number
	rating: "up" | "down" | null
}

/**
 * Rates a podcast episode's chapter, or clears its rating, and returns whether the rating saved.
 */
export async function sendPodcastEpisodeChapterRating({
	podcastEpisodeId,
	position,
	rating,
}: SendPodcastEpisodeChapterRatingOptions): Promise<boolean> {
	// a request that throws an error has no response
	const response = await apiClient.api.episodes[":id"].chapters[":position"].rating
		.$post({ param: { id: podcastEpisodeId, position: String(position) }, json: { rating } })
		.catch(() => null)
	return Boolean(response?.ok)
}

// the topic, and whether its podcast should be on
type SendTopicPodcastOptions = { topicId: string; isPodcastEnabled: boolean }

/**
 * Turns a topic's podcast on or off and returns whether the change saved, failed, or the plan rejected the change.
 * A request that never reaches the api counts as failed.
 */
export async function sendTopicPodcast({
	topicId,
	isPodcastEnabled,
}: SendTopicPodcastOptions): Promise<TopicPodcastResult> {
	// a request that throws an error has no response
	const response = await apiClient.api.topics[":id"].podcast
		.$put({ param: { id: topicId }, json: { isPodcastEnabled } })
		.catch(() => null)

	// an ok response saved the change, a 402 means the plan rejected the change, and anything else failed
	if (response?.ok) {
		return "saved"
	}
	return response?.status === 402 ? "planRejected" : "failed"
}

/**
 * Removes a podcast episode and returns whether the episode was removed.
 */
export async function sendRemovePodcastEpisode(podcastEpisodeId: string): Promise<boolean> {
	const response = await apiClient.api.episodes[":id"].$delete({ param: { id: podcastEpisodeId } })
	return response.ok
}

/**
 * Loads the url of the user's podcast feed for a topic, or null if the url does not load.
 */
export async function fetchPodcastFeedUrl(topicId: string): Promise<string | null> {
	const response = await apiClient.api.topics[":id"]["podcast-feed"].$get({ param: { id: topicId } })
	return response.ok ? podcastFeedUrlResponse.parse(await response.json()).podcastFeedUrl : null
}

/**
 * Replaces the user's own podcast feed url and returns the new url, or null if the reset fails.
 * The old url stops working.
 */
export async function sendResetPodcastFeed(topicId: string): Promise<string | null> {
	const response = await apiClient.api.topics[":id"]["podcast-feed"].reset.$post({ param: { id: topicId } })
	return response.ok ? podcastFeedUrlResponse.parse(await response.json()).podcastFeedUrl : null
}
