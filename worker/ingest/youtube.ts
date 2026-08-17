// the YouTube ingester. it uses the Data API when a key is set, otherwise it falls back to the public channel or a playlist Atom feed

import { eq } from "drizzle-orm"
import { db } from "../../db"
import { sources } from "../../db/schema"
import { fetchNamedFeed } from "./feed"
import type { NewResource, Source, SourceIngester } from "./ingester"

// fetch limits used to bound slow feeds and reject oversized bodies
const MAX_RESULTS = 25
const FETCH_TIMEOUT_MS = 10_000

// the YouTube hosts whose playlist pages can be expanded. the search ingester reuses this
const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com"])

// fetch a channel or playlist's recent videos as "watch" Resources.
// use the Data API when an API key is set, otherwise use the Atom feed
export const youtubeIngester: SourceIngester = async (source: Source) => {
	// resolve what to pull from config, then pick the keyed API or the keyless Atom fallback
	const { apiPlaylistId, atomUrl } = toPlaylistIdAndAtomUrl(source)
	const apiKey = Bun.env.YOUTUBE_API_KEY
	if (apiKey) {
		const { channelTitle, resources } = await fetchVideos(apiPlaylistId, apiKey)
		await storeSourceName(source, channelTitle)
		return { resources, costDollars: 0 }
	}

	// fall back to the keyless Atom feed, tagged so the Scan records the fallback
	const { feedName, resources } = await fetchNamedFeed(atomUrl, { resourceKind: "watch" })
	await storeSourceName(source, feedName)
	return { resources, costDollars: 0, fallbackMode: "youtube-atom" }
}

// keep what the channel or playlist is called on the Source, so it reads by name instead of by id.
// re-reading it each scan picks up a channel that renamed itself
async function storeSourceName(source: Source, name: string | null): Promise<void> {
	// an unknown name, or one already stored, isn't saved
	if (!name || source.config.name === name) {
		return
	}

	// merge the name in, leaving the rest of the config alone
	await db
		.update(sources)
		.set({ config: { ...source.config, name } })
		.where(eq(sources.id, source.id))
}

// the fields parseVideos reads from a playlistItems response. every field is optional because the JSON is unvalidated and deleted videos have no videoId
type YoutubePlaylist = {
	items?: {
		snippet?: { title?: string; description?: string; channelTitle?: string; resourceId?: { videoId?: string } }
	}[]
}

// pull the playlist id from a YouTube playlist page url. any other url returns null
export function playlistIdFromUrl(url: string): string | null {
	// only the playlist page on a YouTube host counts. a /watch url with a list param is already one video, so it is not a match
	const playlistUrl = URL.parse(url)
	if (!playlistUrl || !YOUTUBE_HOSTS.has(playlistUrl.hostname) || playlistUrl.pathname !== "/playlist") {
		return null
	}

	// the list query param holds the playlist id. a playlist page without one has nothing to expand
	return playlistUrl.searchParams.get("list")
}

// the config has either a channel id or a playlist id. throws when it has neither
function toPlaylistIdAndAtomUrl(source: Source): { apiPlaylistId: string; atomUrl: string } {
	// read whichever id the config has
	const channelId = typeof source.config.channelId === "string" ? source.config.channelId : undefined
	const playlistId = typeof source.config.playlistId === "string" ? source.config.playlistId : undefined

	// a playlist id is read directly by both access modes
	if (playlistId) {
		return { apiPlaylistId: playlistId, atomUrl: toAtomUrl(playlistId, "playlist") }
	}

	// a channel id maps to its uploads playlist for the API and its channel feed for Atom
	if (channelId) {
		return { apiPlaylistId: uploadsFromChannel(channelId), atomUrl: toAtomUrl(channelId, "channel") }
	}
	throw new Error(`youtube source ${source.id} has no channelId or playlistId in config`)
}

/**
 * The Atom feed url for a YouTube channel or playlist id, which is the keyless way to read either one.
 */
export function toAtomUrl(youtubeId: string, youtubeKind: YoutubeIdKind = toYoutubeIdKind(youtubeId)): string {
	// the feed names the id by what it is. a caller that knows says so, and the rest is read from the id itself
	const atomQuery =
		youtubeKind === "playlist"
			? new URLSearchParams({ playlist_id: youtubeId })
			: new URLSearchParams({ channel_id: youtubeId })
	return `https://www.youtube.com/feeds/videos.xml?${atomQuery}`
}

// the id forms that the Atom feed reads directly: a channel id, and the playlist ids a channel or a user builds.
// a real playlist id runs at least 12 characters past its prefix, so a word like LLM never reads as one
const YOUTUBE_ID_PATTERN = /^(?:UC[\w-]{22}|(?:PL|UU|RD|OL|LL|FL)[\w-]{12,})$/

// a channel handle, which is what a channel is known by and the one form that has to be looked up
const YOUTUBE_HANDLE_PATTERN = /^@[\w.-]+$/

// a channel page names its own channel in its canonical link. the page mentions other channels too,
// so nothing else on it can be read as the channel's id
const CANONICAL_CHANNEL_PATTERN = /<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})">/

/**
 * The channel or playlist id a YouTube source names, however it was written. Null when it names neither.
 */
export async function toYoutubeSourceId(value: string): Promise<string | null> {
	// an id is already what the feed reads, so it needs no lookup
	const namedSource = value.trim()
	if (YOUTUBE_ID_PATTERN.test(namedSource)) {
		return namedSource
	}

	// a handle names no id at all, so the channel page is asked for it. a bare handle and a handle url are the same ask
	const handle = toYoutubeHandle(namedSource)
	if (handle) {
		return fetchChannelId(handle)
	}

	// a channel url has its id in the path, and a playlist url has its own id in the list param
	const channelUrlId = toChannelUrlId(namedSource)
	return channelUrlId ?? playlistIdFromUrl(namedSource)
}

// the handle that a value names, whether written bare or as a channel url. anything else names no handle
function toYoutubeHandle(value: string): string | null {
	// a bare handle is already a match
	if (YOUTUBE_HANDLE_PATTERN.test(value)) {
		return value
	}

	// a handle url has it as the first path segment on a YouTube host
	const handleUrl = URL.parse(value)
	if (!handleUrl || !YOUTUBE_HOSTS.has(handleUrl.hostname)) {
		return null
	}
	const firstSegment = handleUrl.pathname.split("/")[1] ?? ""
	return YOUTUBE_HANDLE_PATTERN.test(firstSegment) ? firstSegment : null
}

// the channel id a /channel url has in its path. any other url has none
function toChannelUrlId(value: string): string | null {
	// only the channel path on a YouTube host names a channel id
	const channelUrl = URL.parse(value)
	if (!channelUrl || !YOUTUBE_HOSTS.has(channelUrl.hostname)) {
		return null
	}
	const [, firstSegment, secondSegment] = channelUrl.pathname.split("/")
	return firstSegment === "channel" && YOUTUBE_ID_PATTERN.test(secondSegment ?? "") ? (secondSegment ?? null) : null
}

// ask the channel page which channel it is. a handle nobody has returns 404,
// and a lookup that fails drops the suggestion instead of failing the request that asked for it
async function fetchChannelId(handle: string): Promise<string | null> {
	// a page that does not answer names no channel
	try {
		const response = await fetch(`https://www.youtube.com/${handle}`, {
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		})
		if (!response.ok) {
			return null
		}

		// the canonical link is the only place the page names itself instead of another channel
		return (await response.text()).match(CANONICAL_CHANNEL_PATTERN)?.[1] ?? null
	} catch (error) {
		console.error(`youtube handle ${handle} could not be resolved`, error)
		return null
	}
}

// whether an id names a channel or a playlist
export type YoutubeIdKind = "channel" | "playlist"

/**
 * What a YouTube id is for, parsed from its prefix. Channel ids are the only ones that start with UC,
 * so everything else is a playlist: PL, and the UU, RD, OL, and LL are the playlists a channel generates.
 */
export function toYoutubeIdKind(youtubeId: string): YoutubeIdKind {
	return youtubeId.startsWith("UC") ? "channel" : "playlist"
}

// a channel's uploads playlist id is the channel id with the UC prefix swapped to UU. YouTube keeps this mapping stable
function uploadsFromChannel(channelId: string): string {
	// pass ids without the UC prefix through unchanged. a bad id fails the fetch and stops only this Source
	return channelId.startsWith("UC") ? `UU${channelId.slice(2)}` : channelId
}

// fetch a playlist's recent videos using the Data API, keeping the channel title the response names with them
export async function fetchVideos(
	playlistId: string,
	apiKey: string,
): Promise<{ channelTitle: string | null; resources: NewResource[] }> {
	// playlistItems costs one quota unit and skips no videos, which is cheaper and more complete than search.list
	const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=${MAX_RESULTS}&playlistId=${playlistId}&key=${apiKey}`
	const response = await fetch(url, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
	// a failed response stops only this Source. the Scan isolates the failure
	if (!response.ok) {
		throw new Error(`youtube playlistItems ${playlistId} returned ${response.status}`)
	}

	// the playlist owner's channel title is included on every item, so the first one names the Source
	const playlist = (await response.json()) as YoutubePlaylist
	const channelTitle = playlist.items?.[0]?.snippet?.channelTitle?.trim() || null
	return { channelTitle, resources: parseVideos(playlist) }
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

		// this canonical watch url matches what the Atom fallback finds, so different access modes dedupe to the same Resource
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
