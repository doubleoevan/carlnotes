// the YouTube adapter. it uses the Data API when a key is set, otherwise it falls back to the public channel or a playlist Atom feed
import type { NewResource, Source, SourceAdapter } from "./adapter"
import { fetchFeed } from "./feed"

// fetch limits used to bound slow feeds and reject oversized bodies
const MAX_RESULTS = 25
const FETCH_TIMEOUT_MS = 10_000

// the YouTube hosts whose playlist pages can be expanded. the search adapter reuses this
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"])

// fetch a channel or playlist's recent videos as "watch" Resources.
// use the Data API when an API key is set, otherwise use the Atom feed
export const youtubeAdapter: SourceAdapter = async (source: Source) => {
	// resolve what to pull from config, then pick the keyed API or the keyless Atom fallback
	const { apiPlaylistId, atomUrl } = toPlaylistIdAndAtomUrl(source)
	const apiKey = Bun.env.YOUTUBE_API_KEY
	if (apiKey) {
		return { resources: await fetchVideos(apiPlaylistId, apiKey), cost: 0 }
	}

	// fall back to the keyless Atom feed, tagged so the Scan records the degradation
	return { resources: await fetchFeed(atomUrl, { resourceKind: "watch" }), cost: 0, fallbackMode: "youtube-atom" }
}

// the fields parseVideos reads from a playlistItems response. every field is optional because the JSON is unvalidated and deleted videos have no videoId
type YoutubePlaylist = {
	items?: { snippet?: { title?: string; description?: string; resourceId?: { videoId?: string } } }[]
}

// pull the playlist id from a YouTube playlist page url. any other url returns null
export function playlistIdFromUrl(url: string): string | null {
	// only the playlist page on a YouTube host counts. a /watch url with a list param is already one video, so it is not a match
	const playlistUrl = URL.parse(url)
	if (!playlistUrl || !YOUTUBE_HOSTS.has(playlistUrl.hostname) || playlistUrl.pathname !== "/playlist") {
		return null
	}

	// the list query param carries the playlist id. a playlist page without one has nothing to expand
	return playlistUrl.searchParams.get("list")
}

// the config carries either a channel id or a playlist id. throws when it has neither
function toPlaylistIdAndAtomUrl(source: Source): { apiPlaylistId: string; atomUrl: string } {
	// read whichever id the config carries
	const channelId = typeof source.config.channelId === "string" ? source.config.channelId : undefined
	const playlistId = typeof source.config.playlistId === "string" ? source.config.playlistId : undefined

	// a playlist id is read directly by both modes
	if (playlistId) {
		return { apiPlaylistId: playlistId, atomUrl: `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}` }
	}

	// a channel id maps to its uploads playlist for the API and its channel feed for Atom
	if (channelId) {
		return {
			apiPlaylistId: uploadsFromChannel(channelId),
			atomUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
		}
	}
	throw new Error(`youtube source ${source.id} has no channelId or playlistId in config`)
}

// a channel's uploads playlist id is the channel id with the UC prefix swapped to UU. YouTube keeps this mapping stable
function uploadsFromChannel(channelId: string): string {
	// pass ids without the UC prefix through unchanged. a bad id fails the fetch and degrades only this Source
	return channelId.startsWith("UC") ? `UU${channelId.slice(2)}` : channelId
}

// fetch a playlist's recent videos using the Data API and map them to "watch" Resources
export async function fetchVideos(playlistId: string, apiKey: string): Promise<NewResource[]> {
	// playlistItems costs one quota unit and skips no videos, which is cheaper and more complete than search.list
	const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=${MAX_RESULTS}&playlistId=${playlistId}&key=${apiKey}`
	const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
	// a failed response degrades only this Source. the Scan isolates the failure
	if (!response.ok) {
		throw new Error(`youtube playlistItems ${playlistId} returned ${response.status}`)
	}
	return parseVideos((await response.json()) as YoutubePlaylist)
}

// map a playlist response to "watch" Resources, each mapped to its watch url and deduped within the payload
export function parseVideos(playlist: YoutubePlaylist): NewResource[] {
	// keep the first Resource per video url so that a repeated video collapses to one
	const resourceByUrl = new Map<string, NewResource>()
	for (const video of playlist.items ?? []) {
		// skip a deleted or private video or any malformed entry with no video id, so that one bad entry never throws
		const videoId = video.snippet?.resourceId?.videoId
		if (!videoId) {
			continue
		}

		// this canonical watch url matches what the Atom fallback emits, so different modes dedupe to the same Resource
		const url = `https://www.youtube.com/watch?v=${videoId}`
		if (resourceByUrl.has(url)) {
			continue
		}

		// map to a watch Resource. its snippet is the video description. contentHash stays null for review to fill
		resourceByUrl.set(url, {
			url,
			title: video.snippet?.title ?? null,
			kind: "watch",
			snippet: video.snippet?.description || null,
			contentHash: null,
		})
	}

	// return the deduped "watch" Resources, sorted by playlist order
	return [...resourceByUrl.values()]
}
