// the podcast ingester. a Source names a show by its podcast id, and that show's RSS feed provides the episodes,
// since a podcast is really an RSS feed

import { eq } from "drizzle-orm"
import { db } from "../../db"
import { sources } from "../../db/schema"
import { fetchFeed } from "./feed"
import type { Source, SourceIngester } from "./ingester"

// the iTunes endpoints, which need no key. lookup reads one show by its id, and search finds shows by name
const ITUNES_LOOKUP_ENDPOINT = "https://itunes.apple.com/lookup"
const ITUNES_SEARCH_ENDPOINT = "https://itunes.apple.com/search"
// how many shows a search returns, and how long a request may run before it aborts
const MAX_SEARCH_RESULTS = 10
const FETCH_TIMEOUT_MS = 10_000
// how many of a show's episodes are read, taken in the order the feed lists them, which podcast feeds put newest first. a show archive runs to hundreds of entries and the relevance
// gate embeds each one, so a show is read only as deeply as the YouTube ingester reads a channel
const MAX_EPISODES = 25

// read the show the Source names and turn its recent episodes into "listen" Resources
export const podcastIngester: SourceIngester = async (source: Source) => {
	// the show id lives in the Source config. a missing id is a misconfigured Source, and the Scan isolates the failure
	const podcastId = typeof source.config.podcastId === "string" ? source.config.podcastId.trim() : ""
	if (!podcastId) {
		throw new Error(`podcast source ${source.id} has no string config.podcastId`)
	}

	// resolve the podcast id to the show's feed. an unknown show, or one that syndicates nowhere, has no episodes to read
	const podcast = await lookupPodcast(podcastId)
	if (!podcast?.feedUrl) {
		throw new Error(`podcast ${podcastId} is unknown or publishes no feed`)
	}

	// the lookup knows what the show is called, so keep it on the Source for the editor and the topic page to render.
	// a bare id names nothing on its own, and re-reading it with each scan would only pick up a show that renamed itself
	if (source.config.name !== podcast.name) {
		await db
			.update(sources)
			.set({ config: { ...source.config, name: podcast.name } })
			.where(eq(sources.id, source.id))
	}

	// read the show's recent episodes. iTunes and the feed both need no key, so the cost is 0,
	// and there is no keyed path to fall back from, so fallbackMode stays unset
	const episodes = await fetchFeed(podcast.feedUrl, { resourceKind: "listen" })
	return { resources: episodes.slice(0, MAX_EPISODES), costDollars: 0 }
}

// a show as iTunes returns it. every field is optional because the JSON is unvalidated,
// and a show that syndicates nowhere publishes no feed
type ItunesShow = { collectionId?: number; collectionName?: string; artistName?: string; feedUrl?: string }
type ItunesResponse = { results?: ItunesShow[] }

// a show as the app names it: the id a Source stores, what to call it, and where its episodes come from
export type Podcast = { podcastId: string; name: string; author: string | null; feedUrl: string | null }

/**
 * Search iTunes for shows by name, to offer a Topic the ones worth adding as Sources.
 */
export async function searchPodcasts(searchTerm: string): Promise<Podcast[]> {
	// the podcast entity returns shows instead of single episodes, and a show is what has an id and a feed
	const query = new URLSearchParams({
		term: searchTerm,
		media: "podcast",
		entity: "podcast",
		limit: String(MAX_SEARCH_RESULTS),
	})
	return toPodcasts(await readItunes(ITUNES_SEARCH_ENDPOINT, query))
}

/**
 * The one show a podcast id names, or null when iTunes doesn't find it.
 */
export async function lookupPodcast(podcastId: string): Promise<Podcast | null> {
	// an unknown id returns an empty result instead of an error, so absence is read from the body, not the status
	const [podcast] = toPodcasts(await readItunes(ITUNES_LOOKUP_ENDPOINT, new URLSearchParams({ id: podcastId })))
	return podcast ?? null
}

// read one iTunes endpoint, throwing on a failed response
async function readItunes(endpoint: string, query: URLSearchParams): Promise<ItunesResponse> {
	const response = await fetch(`${endpoint}?${query}`, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
	if (!response.ok) {
		throw new Error(`itunes returned ${response.status} for ${endpoint}`)
	}
	return (await response.json()) as ItunesResponse
}

/**
 * The shows an iTunes response returns, skipping any entry with no id to store or no name.
 */
export function toPodcasts(itunesResponse: ItunesResponse): Podcast[] {
	return (itunesResponse.results ?? []).flatMap((show) => {
		// a show with no id cannot be stored on a Source, and one with no name has nothing to display
		if (!show.collectionId || !show.collectionName) {
			return []
		}
		const podcast = {
			podcastId: String(show.collectionId),
			name: show.collectionName,
			author: show.artistName ?? null,
			feedUrl: show.feedUrl ?? null,
		}
		return [podcast]
	})
}
