// the fetch an mcp card runs with. the card's security policy names no connections, so the api requests the site's
// components make are returned here: a podcast episode the player loads comes from the tool result, and every other
// request fails, so nothing in a card reaches the api except through a tool call
import { findCardPodcastEpisode } from "./cardHost"

// a podcast episode's own read, which the podcast player sends to load a podcast episode it plays
const PODCAST_EPISODE_PATH_PATTERN = /^\/api\/episodes\/([^/]+)$/

/**
 * Installs the card's fetch in place of the browser's.
 */
export function installCardFetch(): void {
	globalThis.fetch = cardFetch as typeof fetch
}

// return a podcast episode read from the tool result, and fail every other request
async function cardFetch(input: RequestInfo | URL): Promise<Response> {
	// the request's path, relative or absolute
	const requestUrl = new URL(
		input instanceof Request ? input.url : input.toString(),
		globalThis.document?.baseURI ?? "http://localhost/",
	)
	const podcastEpisodeId = PODCAST_EPISODE_PATH_PATTERN.exec(requestUrl.pathname)?.[1]
	const podcastEpisode = podcastEpisodeId ? findCardPodcastEpisode(podcastEpisodeId) : null
	if (podcastEpisode) {
		return Response.json(podcastEpisode)
	}
	return Response.json({ error: "a card reads only what its tool returned" }, { status: 503 })
}
