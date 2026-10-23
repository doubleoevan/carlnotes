// the api client for a topic page's view and the topic and podcast episode counts
import {
	type PodcastEpisodeCounts,
	podcastEpisodeCounts,
	type TopicCounts,
	topicCounts,
} from "@carlnotes/contracts/viewerCounts"
import { apiClient } from "./apiClient"

/**
 * Sends a topic page's view, which outlives a page that unloads first. The response says nothing, so a failure is left
 * alone.
 */
export function sendTopicView(topicId: string): void {
	apiClient()
		.api.topics[":id"].view.$post({ param: { id: topicId } }, { init: { keepalive: true } })
		.catch(() => {})
}

/**
 * Fetches a topic's viewers and followers, or null if the read fails. A public topic's counts are fetched without
 * credentials.
 */
export async function fetchTopicCounts(topicId: string, isPublic: boolean): Promise<TopicCounts | null> {
	const response = await apiClient()
		.api.counts.topics[":id"].$get({ param: { id: topicId } }, { init: toCountsRequestInit(isPublic) })
		.catch(() => null)
	return response?.ok ? topicCounts.parse(await response.json()) : null
}

/**
 * Fetches a podcast episode's listeners, or null if the read fails. A public topic's podcast episode counts are
 * fetched without credentials.
 */
export async function fetchPodcastEpisodeCounts(
	podcastEpisodeId: string,
	isPublic: boolean,
): Promise<PodcastEpisodeCounts | null> {
	const response = await apiClient()
		.api.counts.episodes[":id"].$get({ param: { id: podcastEpisodeId } }, { init: toCountsRequestInit(isPublic) })
		.catch(() => null)
	return response?.ok ? podcastEpisodeCounts.parse(await response.json()) : null
}

// a public topic's counts leave the session cookie behind, and any other topic's send it for the access check
function toCountsRequestInit(isPublic: boolean): RequestInit {
	return { credentials: isPublic ? "omit" : "same-origin" }
}
