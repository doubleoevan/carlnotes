// the YouTube adapter: Data API when a key is set, else keyless channel/playlist Atom feeds
import type { NewResource, Source, SourceAdapter } from "./adapter"
import { fetchFeed } from "./feed"

// fetch knobs kept at the top per adapter-authoring
const MAX_RESULTS = 25
const FETCH_TIMEOUT_MS = 10_000
// the youtube hosts whose /playlist page playlistIdFromUrl expands (search reuses this)
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"])

// fetch a channel or playlist's recent videos as watch Resources: Data API when a key is set, else Atom
export const youtubeAdapter: SourceAdapter = async (source: Source) => {
	// resolve what to pull from config, then pick the keyed API or the keyless Atom fallback
	const { apiPlaylistId, atomUrl } = resolveTarget(source)
	const apiKey = Bun.env.YOUTUBE_API_KEY
	if (apiKey) {
		return { resources: await fetchVideos(apiPlaylistId, apiKey), cost: 0 }
	}
	// keyless fallback: the channel/playlist Atom feed, tagged so the Scan records the degradation
	return { resources: await fetchFeed(atomUrl, { kind: "watch" }), cost: 0, fallbackMode: "youtube-atom" }
}

// the fields parseVideos reads from a playlistItems response
type YoutubePlaylist = {
	items: { snippet: { title?: string; description?: string; resourceId: { videoId: string } } }[]
}

// pure playlist→Resources: each video becomes a watch Resource keyed by its watch?v= url, deduped in-payload
export function parseVideos(playlist: YoutubePlaylist): NewResource[] {
	// keep the first Resource per video url so a repeated video collapses to one
	const resourceByUrl = new Map<string, NewResource>()
	for (const video of playlist.items) {
		// this canonical watch url matches what the Atom fallback emits, so modes dedupe to the same Resource
		const url = `https://www.youtube.com/watch?v=${video.snippet.resourceId.videoId}`
		if (resourceByUrl.has(url)) {
			continue
		}
		// map to a watch Resource; the native snippet is the video description, contentHash/content stay null for curation to fill
		resourceByUrl.set(url, {
			url,
			title: video.snippet.title ?? null,
			kind: "watch",
			snippet: video.snippet.description || null,
			contentHash: null,
		})
	}
	// hand back the deduped Resources, first-seen order preserved
	return [...resourceByUrl.values()]
}

// a youtube.com/playlist?list=<id> url → its playlist id; any other url (watch, non-youtube, no list) → null
export function playlistIdFromUrl(url: string): string | null {
	// only the /playlist page on a youtube host expands; an unparseable url or a /watch?…&list= (already one video) is not a match
	const playlistUrl = URL.parse(url)
	if (!playlistUrl || !YOUTUBE_HOSTS.has(playlistUrl.hostname) || playlistUrl.pathname !== "/playlist") {
		return null
	}
	// the list query param carries the playlist id; a /playlist with none has nothing to expand
	return playlistUrl.searchParams.get("list")
}

// map the config's channelId/playlistId to the API playlist and the Atom feed url; throws if neither is set
function resolveTarget(source: Source): { apiPlaylistId: string; atomUrl: string } {
	// read whichever id the config carries
	const channelId = typeof source.config.channelId === "string" ? source.config.channelId : undefined
	const playlistId = typeof source.config.playlistId === "string" ? source.config.playlistId : undefined
	// a playlist id is read directly by both modes
	if (playlistId) {
		return { apiPlaylistId: playlistId, atomUrl: `https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}` }
	}
	// a channel id maps to its uploads playlist (API) and its channel feed (Atom)
	if (channelId) {
		return {
			apiPlaylistId: uploadsFromChannel(channelId),
			atomUrl: `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
		}
	}
	throw new Error(`youtube source ${source.id} has no channelId or playlistId in config`)
}

// a channel's uploads playlist id is the channel id with the UC prefix swapped to UU (a stable youtube invariant)
function uploadsFromChannel(channelId: string): string {
	// pass non-UC ids through unchanged; a bad id simply 404s and degrades this Source in isolation
	return channelId.startsWith("UC") ? `UU${channelId.slice(2)}` : channelId
}

// fetch a playlist's recent items via the Data API and map them to watch Resources
export async function fetchVideos(playlistId: string, apiKey: string): Promise<NewResource[]> {
	// playlistItems costs 1 quota unit and returns uploads completely (cheaper and more complete than search.list)
	const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=${MAX_RESULTS}&playlistId=${playlistId}&key=${apiKey}`
	const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
	// a non-ok response degrades only this Source (isolated by runTopicScan)
	if (!response.ok) {
		throw new Error(`youtube playlistItems ${playlistId} returned ${response.status}`)
	}
	return parseVideos((await response.json()) as YoutubePlaylist)
}
