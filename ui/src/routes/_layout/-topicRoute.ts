import type { PageHead, TopicResponse } from "@shared/contracts"
import { notFound, redirect } from "@tanstack/react-router"
import { fetchTopicPageHead } from "@/clients/pageHeadClient"
import { type FetchedSeason, fetchSeasonPodcastEpisodes } from "@/clients/podcastEpisodeClient"
import { fetchTopicPage } from "@/clients/topicClient"
import { loadOnServer, loadPageOnServer } from "@/lib/loadOnServer"

// the page head, the topic if the topic is public, and the url's season with its podcast episodes
export type TopicRouteData = {
	head: PageHead | undefined
	topic: TopicResponse | null
	fetchedSeason: FetchedSeason | null
}

// the topic id from the url, the slug if the url has a slug, and the season from the url's query
type LoadTopicRouteOptions = { topicId: string; topicSlug?: string; season?: unknown }

/**
 * Loads a topic's head and public page on the server, with the podcast episodes of the season that the url names,
 * and redirects a url without the current slug. In the browser loadTopicRoute returns no head, topic, or season.
 */
export async function loadTopicRoute({ topicId, topicSlug, season }: LoadTopicRouteOptions): Promise<TopicRouteData> {
	// read the head, the topic page, and the url's season on the server
	const [[topicHead, topicPage], fetchedSeason] = await Promise.all([
		loadPageOnServer({
			fetchPageHead: () => fetchTopicPageHead(topicId),
			fetchPage: () => fetchTopicPage(topicId),
		}),
		loadOnServer(() => fetchLinkedSeason(topicId, season), null),
	])

	// respond 404 for a topic the api does not know
	if (topicHead === null) {
		throw notFound()
	}

	// redirect any other path permanently to the topic's current path, the path of its card url
	const currentTopicPath = topicHead ? new URL(topicHead.cardUrl).pathname : null
	const requestedTopicPath = topicSlug ? `/topics/${topicId}/${topicSlug}` : `/topics/${topicId}`
	if (currentTopicPath && currentTopicPath !== requestedTopicPath) {
		throw redirect({ href: currentTopicPath, statusCode: 301 })
	}

	// return the head, the topic only if the topic is public, and the fetched season
	return { head: topicHead, topic: topicPage?.status === "visible" ? topicPage.topic : null, fetchedSeason }
}

/**
 * Returns the season from a topic url's parsed query, or undefined if the url has no season.
 */
export function toLinkedSeason(search: object): unknown {
	return "season" in search ? search.season : undefined
}

// the season that the url names, with its podcast episodes, or null if the url names no season or the read fails
async function fetchLinkedSeason(topicId: string, season: unknown): Promise<FetchedSeason | null> {
	if (typeof season !== "number" || !Number.isInteger(season)) {
		return null
	}
	return fetchSeasonPodcastEpisodes(topicId, season)
		.then((seasonPodcastEpisodes) => ({ season, seasonPodcastEpisodes }))
		.catch(() => null)
}
