import { fetchTopicPageHead } from "@carlnotes/client/pageHeadClient"
import { type FetchedSeason, fetchSeasonPodcastEpisodes } from "@carlnotes/client/podcastEpisodeClient"
import { fetchTopicPage } from "@carlnotes/client/topicClient"
import type { PageHead } from "@carlnotes/contracts/pageHead"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { notFound, redirect } from "@tanstack/react-router"
import { loadOnServer, loadPageOnServer, readWithDegradedFallback } from "@/lib/loadOnServer"

// the page head, the topic if the topic is public, the url's season with its podcast episodes, and the url's film
// season with its films
export type TopicRouteData = {
	head: PageHead | undefined
	topic: TopicResponse | null
	fetchedSeason: FetchedSeason | null
	fetchedFilmSeason: FetchedSeason | null
}

// the topic id from the url, the slug if the url has a slug, and the seasons from the url's query
type LoadTopicRouteOptions = {
	topicId: string
	topicSlug?: string
	season?: unknown
	filmSeason?: unknown
	search?: string
}

/**
 * Loads a topic's head and public page on the server, with the podcast episodes of the season that the url names,
 * and redirects a url without the current slug. In the browser loadTopicRoute returns no head, topic, or season.
 */
export async function loadTopicRoute({
	topicId,
	topicSlug,
	season,
	filmSeason,
	search = "",
}: LoadTopicRouteOptions): Promise<TopicRouteData> {
	// read the head, the topic page, and the url's seasons on the server
	const [[topicHead, topicPage], fetchedSeason, fetchedFilmSeason] = await Promise.all([
		loadPageOnServer({
			fetchPageHead: () => fetchTopicPageHead(topicId),
			fetchPage: () => fetchTopicPage(topicId),
		}),
		loadOnServer(() => fetchLinkedSeason({ topicId, season, hasVideo: false }), null),
		loadOnServer(() => fetchLinkedSeason({ topicId, season: filmSeason, hasVideo: true }), null),
	])

	// respond 404 for a topic the api does not know
	if (topicHead === null) {
		throw notFound()
	}

	// redirect any other path permanently to the topic's current path, the path of its card url
	const currentTopicPath = topicHead ? new URL(topicHead.cardUrl).pathname : null
	const requestedTopicPath = topicSlug ? `/topics/${topicId}/${topicSlug}` : `/topics/${topicId}`
	if (currentTopicPath && currentTopicPath !== requestedTopicPath) {
		throw redirect({ href: `${currentTopicPath}${search}`, statusCode: 301 })
	}

	// return the head, the topic only if the topic is public, and the fetched seasons
	const topic = topicPage?.status === "visible" ? topicPage.topic : null
	return { head: topicHead, topic, fetchedSeason, fetchedFilmSeason }
}

/**
 * Returns a season from a topic url's parsed query under the key, or undefined if the url has no such season.
 */
export function toLinkedSeason(search: object, seasonKey: string): unknown {
	return seasonKey in search ? (search as Record<string, unknown>)[seasonKey] : undefined
}

// the topic, the season that the url names, and whether to read only the podcast episodes with a film
type FetchLinkedSeasonOptions = { topicId: string; season: unknown; hasVideo: boolean }

// the season that the url names, with its podcast episodes, or null if the url names no season or the read fails,
// which marks the render degraded
async function fetchLinkedSeason({
	topicId,
	season,
	hasVideo,
}: FetchLinkedSeasonOptions): Promise<FetchedSeason | null> {
	if (typeof season !== "number" || !Number.isInteger(season)) {
		return null
	}

	// the season's podcast episodes, or null if their read fails
	return readWithDegradedFallback(async () => {
		const seasonPodcastEpisodes = await fetchSeasonPodcastEpisodes({ topicId, season, hasVideo })
		return { season, seasonPodcastEpisodes }
	}, null)
}
