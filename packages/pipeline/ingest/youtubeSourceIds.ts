// the YouTube channel or playlist id a YouTube Source names, resolved from the forms people write it in

import { YOUTUBE_HOSTS } from "@carlnotes/contracts/youtube"
import { isRetryableHttpStatus } from "@carlnotes/server/publicFetch"

// the longest a YouTube channel page lookup waits
const YOUTUBE_CHANNEL_PAGE_TIMEOUT_MS = 10_000

// a value parsed as a url on a YouTube host. any other value is null
function toYoutubeUrl(value: string): URL | null {
	const youtubeUrl = URL.parse(value)
	return youtubeUrl && YOUTUBE_HOSTS.has(youtubeUrl.hostname) ? youtubeUrl : null
}

// pull the playlist id from a YouTube playlist page url. any other url returns null
export function playlistIdFromUrl(url: string): string | null {
	// only the playlist page on a YouTube host counts
	const playlistUrl = toYoutubeUrl(url)
	if (playlistUrl?.pathname !== "/playlist") {
		return null
	}

	// the list query param holds the playlist id. a playlist page without one has nothing to expand
	return playlistUrl.searchParams.get("list")
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

// the id forms that the Atom feed reads directly: a YouTube channel id, and the playlist ids a YouTube channel or a
// user builds. a newer playlist id is as short as PL and 11 characters
const YOUTUBE_ID_PATTERN = /^(?:UC[\w-]{22}|(?:PL|UU|RD|OL|LL|FL)[\w-]{10,})$/

// a YouTube channel handle, which is what a YouTube channel is known by and the one form that has to be looked up
const YOUTUBE_HANDLE_PATTERN = /^@[\w.-]+$/

// a YouTube channel page names its own YouTube channel in its canonical link
const CANONICAL_YOUTUBE_CHANNEL_PATTERN =
	/<link rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]{22})">/

/**
 * The YouTube channel or playlist id a YouTube source names, however it was written. Null if it names neither.
 */
export async function toYoutubeSourceId(value: string): Promise<string | null> {
	// an id is already what the feed reads, so it needs no lookup
	const namedSource = value.trim()
	if (YOUTUBE_ID_PATTERN.test(namedSource)) {
		return namedSource
	}

	// a handle, a /c/ url, and a /user/ url name no id at all, so the YouTube channel page is asked for it
	const youtubeChannelPagePath = toYoutubeHandle(namedSource) ?? toLegacyYoutubeChannelPath(namedSource)
	if (youtubeChannelPagePath) {
		return fetchYoutubeChannelId(youtubeChannelPagePath)
	}

	// a YouTube channel url has its id in the path, and a playlist url or a video played from a playlist has it in the
	// list param
	const youtubeChannelUrlId = toYoutubeChannelUrlId(namedSource)
	return youtubeChannelUrlId ?? playlistIdFromUrl(namedSource) ?? toWatchPlaylistId(namedSource)
}

// the playlist a video url plays from, as in watch?v=abc&list=PL123. a video url with no list names none
function toWatchPlaylistId(value: string): string | null {
	const watchUrl = toYoutubeUrl(value)
	if (watchUrl?.pathname !== "/watch") {
		return null
	}
	const playlistId = watchUrl.searchParams.get("list") ?? ""
	return YOUTUBE_ID_PATTERN.test(playlistId) ? playlistId : null
}

// the handle that a value names, whether written bare or as a YouTube channel url. anything else names no handle
function toYoutubeHandle(value: string): string | null {
	// a bare handle is already a match
	if (YOUTUBE_HANDLE_PATTERN.test(value)) {
		return value
	}

	// a handle url has it as the first path segment on a YouTube host
	const firstSegment = toYoutubeUrl(value)?.pathname.split("/")[1] ?? ""
	return YOUTUBE_HANDLE_PATTERN.test(firstSegment) ? firstSegment : null
}

// the /c/ or /user/ path that a legacy YouTube channel url names, as in c/Veritasium. any other url names none
function toLegacyYoutubeChannelPath(value: string): string | null {
	// only a /c/ or /user/ path with a name after it, on a YouTube host, names a YouTube channel page
	const [, firstSegment, secondSegment] = toYoutubeUrl(value)?.pathname.split("/") ?? []
	return (firstSegment === "c" || firstSegment === "user") && secondSegment ? `${firstSegment}/${secondSegment}` : null
}

// the YouTube channel id a /channel url has in its path. any other url has none
function toYoutubeChannelUrlId(value: string): string | null {
	// only the YouTube channel path on a YouTube host names a YouTube channel id
	const [, firstSegment, secondSegment] = toYoutubeUrl(value)?.pathname.split("/") ?? []
	return firstSegment === "channel" && YOUTUBE_ID_PATTERN.test(secondSegment ?? "") ? (secondSegment ?? null) : null
}

/**
 * YouTube did not respond to a YouTube channel page lookup: a timeout, a dropped connection, a rate limit, or a server
 * error. The value may still name a YouTube channel, so a save asks the user to try again instead of calling it
 * missing.
 */
export class YoutubeUnavailableError extends Error {}

// the most of a YouTube channel page read while looking for its canonical link, which sits about 0.9 MB in
const MAX_YOUTUBE_CHANNEL_PAGE_BYTES = 2_000_000

// the text kept from the previous chunk, longer than the canonical link, so a link split across two chunks still
// matches
const CANONICAL_LINK_OVERLAP_CHARS = 200

// ask the YouTube channel page at a handle, /c/, or /user/ path which YouTube channel it is
async function fetchYoutubeChannelId(youtubeChannelPagePath: string): Promise<string | null> {
	try {
		// a missing page names no YouTube channel, and a rate limit or a server error is YouTube not responding
		const response = await fetch(`https://www.youtube.com/${youtubeChannelPagePath}`, {
			signal: AbortSignal.timeout(YOUTUBE_CHANNEL_PAGE_TIMEOUT_MS),
		})
		if (!response.ok) {
			await response.body?.cancel()
			if (isRetryableHttpStatus(response.status)) {
				throw new YoutubeUnavailableError(`youtube channel page ${youtubeChannelPagePath} returned ${response.status}`)
			}
			return null
		}

		// a page that responded names its YouTube channel in its canonical link, or names none
		return await readCanonicalYoutubeChannelId(response)
	} catch (error) {
		// a timeout or a dropped connection is YouTube not responding too
		if (error instanceof YoutubeUnavailableError) {
			throw error
		}
		throw new YoutubeUnavailableError(`youtube channel page ${youtubeChannelPagePath} could not be read`, {
			cause: error,
		})
	}
}

// read the page until its canonical link, the only place the page names itself instead of another YouTube channel, and
// stop
async function readCanonicalYoutubeChannelId(response: Response): Promise<string | null> {
	// a response with no body names no YouTube channel
	const reader = response.body?.getReader()
	if (!reader) {
		return null
	}

	// keep only the end of the text read so far, and look for the link in it after each chunk
	const decoder = new TextDecoder()
	let pageTail = ""
	let byteCount = 0
	while (byteCount < MAX_YOUTUBE_CHANNEL_PAGE_BYTES) {
		// a page that ends without the link names no YouTube channel
		const { done, value } = await reader.read()
		if (done) {
			return null
		}
		byteCount += value.length
		pageTail += decoder.decode(value, { stream: true })

		// the link ends the read, and a page that has not named it yet keeps only its overlap
		const youtubeChannelId = pageTail.match(CANONICAL_YOUTUBE_CHANNEL_PATTERN)?.[1]
		if (youtubeChannelId) {
			await reader.cancel()
			return youtubeChannelId
		}
		pageTail = pageTail.slice(-CANONICAL_LINK_OVERLAP_CHARS)
	}

	// a page that names no YouTube channel within the limit names none
	await reader.cancel()
	return null
}

// whether an id names a YouTube channel or a playlist
export type YoutubeIdKind = "channel" | "playlist"

/**
 * A YouTube source's config with the value it was saved with resolved to the YouTube channel or playlist id the
 * ingester reads, or null if the value names neither. A value that is not an id already stays on as the source's name
 * until a Scan stores the YouTube channel's own title.
 */
export async function toResolvedYoutubeSourceConfig(
	config: Record<string, unknown>,
): Promise<Record<string, unknown> | null> {
	// the value is whichever id field the config has
	const { channelId, playlistId, ...otherConfig } = config
	const youtubeSourceValue = [channelId, playlistId].find((value): value is string => typeof value === "string")
	const youtubeSourceId = youtubeSourceValue && (await toYoutubeSourceId(youtubeSourceValue))
	if (!youtubeSourceValue || !youtubeSourceId) {
		return null
	}

	// the id goes under the field its kind reads, and a value that was not the id names the source
	const idField = toYoutubeIdKind(youtubeSourceId) === "channel" ? "channelId" : "playlistId"
	const savedName = youtubeSourceValue.trim()
	const name = otherConfig.name ?? (savedName !== youtubeSourceId ? savedName : undefined)
	return { ...otherConfig, [idField]: youtubeSourceId, ...(name ? { name } : {}) }
}

/**
 * What a YouTube id is for, parsed from its prefix. Channel ids are the only ones that start with UC,
 * so everything else is a playlist: PL, and the UU, RD, OL, and LL are the playlists a YouTube channel generates.
 */
function toYoutubeIdKind(youtubeId: string): YoutubeIdKind {
	return youtubeId.startsWith("UC") ? "channel" : "playlist"
}
