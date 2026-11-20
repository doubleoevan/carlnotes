// the YouTube ingester

import { YOUTUBE_ATOM_FALLBACK_MODE } from "@carlnotes/contracts/sources"
import { toYoutubeWatchUrl } from "@carlnotes/contracts/youtube"
import { db } from "@carlnotes/db"
import { sources } from "@carlnotes/db/schema/topics"
import { reportError } from "@carlnotes/server/monitoring"
import { FetchStatusError } from "@carlnotes/server/publicFetch"
import { eq } from "drizzle-orm"
import { toYoutubeVideoId } from "../transcripts"
import { fetchNamedFeed } from "./feed"
import type { IngestResult, NewResource, Source, SourceIngester } from "./ingester"
import { toAtomUrl } from "./youtubeSourceIds"

// fetch limits used to bound slow feeds and reject oversized bodies
const MAX_RESULTS = 25
const FETCH_TIMEOUT_MS = 10_000

// fetch a channel or playlist's recent videos as "watch" Resources
export const youtubeIngester: SourceIngester = async (source: Source) => {
	// resolve what to pull from config, then select the keyed API or the keyless Atom fallback
	const { apiPlaylistId, atomUrl } = toPlaylistIdAndAtomUrl(source)
	const apiKey = Bun.env.YOUTUBE_API_KEY
	if (!apiKey) {
		return fetchAtomVideos({ source, atomUrl, isMissingFromApi: false })
	}

	// the API names the YouTube channel, which the Source keeps as its name
	try {
		const { youtubeChannelTitle, resources } = await fetchVideos(apiPlaylistId, apiKey)
		await saveSourceName(source, youtubeChannelTitle)
		return { resources, costDollars: 0 }
	} catch (error) {
		// a playlist the API does not serve, as for a YouTube Topic channel, is read from the Atom feed instead
		if (!isMissingYoutubePlaylist(error)) {
			throw error
		}
		return fetchAtomVideos({ source, atomUrl, isMissingFromApi: true })
	}
}

// read the keyless Atom feed, tagged so the Scan records the fallback
async function fetchAtomVideos({
	source,
	atomUrl,
	isMissingFromApi,
}: {
	source: Source
	atomUrl: string
	isMissingFromApi: boolean
}): Promise<IngestResult> {
	// the feed names the YouTube channel too
	try {
		const { feedName, resources } = await fetchNamedFeed(atomUrl, { resourceKind: "watch" })
		await saveSourceName(source, feedName)
		return { resources, costDollars: 0, fallbackMode: YOUTUBE_ATOM_FALLBACK_MODE }
	} catch (error) {
		// a YouTube channel or playlist that both the API and the feed say is missing can never be read, so its owner is
		// shown why. the feed alone sometimes responds with 404 for a YouTube channel that exists
		if (isMissingFromApi && isMissingYoutubePlaylist(error)) {
			await db
				.update(sources)
				.set({ status: "failed", error: YOUTUBE_SOURCE_MISSING_ERROR })
				.where(eq(sources.id, source.id))
		}

		// the Scan records this Source's failure either way
		throw error
	}
}

// what the owner of a YouTube source that YouTube does not have reads
const YOUTUBE_SOURCE_MISSING_ERROR = "YouTube has no channel or playlist with this id"

// a 404 or a 400 is YouTube saying the playlist or YouTube channel does not exist. a quota 403, a 5xx, or a timeout may
// pass
function isMissingYoutubePlaylist(error: unknown): boolean {
	return error instanceof FetchStatusError && (error.status === 404 || error.status === 400)
}

// keep what the channel or playlist is called on the Source, so it reads by name instead of by id
async function saveSourceName(source: Source, name: string | null): Promise<void> {
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

// the fields parseVideos reads from a playlistItems response
type YoutubePlaylist = {
	items?: {
		snippet?: { title?: string; description?: string; channelTitle?: string; resourceId?: { videoId?: string } }
	}[]
}

// the fields addVideoDurations reads from a videos response
type YoutubeVideoDetails = { items?: { id?: string; contentDetails?: { duration?: string } }[] }

// the config has either a channel id or a playlist id. throws an error when it has neither
function toPlaylistIdAndAtomUrl(source: Source): { apiPlaylistId: string; atomUrl: string } {
	// read whichever id the config has
	const youtubeChannelId = typeof source.config.channelId === "string" ? source.config.channelId : undefined
	const playlistId = typeof source.config.playlistId === "string" ? source.config.playlistId : undefined

	// a playlist id is read directly by both access modes
	if (playlistId) {
		return { apiPlaylistId: playlistId, atomUrl: toAtomUrl(playlistId, "playlist") }
	}

	// a channel id maps to its uploads playlist for the API and its channel feed for Atom
	if (youtubeChannelId) {
		return {
			apiPlaylistId: uploadsFromYoutubeChannel(youtubeChannelId),
			atomUrl: toAtomUrl(youtubeChannelId, "channel"),
		}
	}
	throw new Error(`youtube source ${source.id} has no channelId or playlistId in config`)
}

// a YouTube channel's uploads playlist id is the YouTube channel id with the UC prefix swapped to UU. YouTube keeps
// this mapping stable
function uploadsFromYoutubeChannel(youtubeChannelId: string): string {
	// pass ids without the UC prefix through unchanged. a bad id fails the fetch and stops only this Source
	return youtubeChannelId.startsWith("UC") ? `UU${youtubeChannelId.slice(2)}` : youtubeChannelId
}

// a 400 that names the API key is a rejected key, which is a fault to report instead of a missing playlist
const API_KEY_REJECTION_PATTERN = /API_KEY_|API key/

// the API key goes in a header, so a failed fetch's url, which an error log prints, never holds it
function toApiKeyHeaders(apiKey: string): Record<string, string> {
	return { "X-Goog-Api-Key": apiKey }
}

// fetch a playlist's recent videos using the Data API, keeping the channel title the response names with them
export async function fetchVideos(
	playlistId: string,
	apiKey: string,
): Promise<{ youtubeChannelTitle: string | null; resources: NewResource[] }> {
	// playlistItems costs one quota unit and skips no videos, which is cheaper and more complete than search.list
	const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&maxResults=${MAX_RESULTS}&playlistId=${playlistId}`
	const response = await fetch(url, { headers: toApiKeyHeaders(apiKey), signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })

	// a failed response stops only this Source. the Scan isolates the failure. a playlist that does not exist is
	// YouTube's response instead of a fault, so it throws the status error the ingester reads the Atom feed after
	if (!response.ok) {
		const responseText = await response.text()
		if (response.status === 404 || (response.status === 400 && !API_KEY_REJECTION_PATTERN.test(responseText))) {
			throw new FetchStatusError(`youtube playlistItems ${playlistId}`, response.status)
		}
		throw new Error(`youtube playlistItems ${playlistId} returned ${response.status}`)
	}

	// the playlist owner's channel title is included on every item, so the first one names the Source
	const playlist = (await response.json()) as YoutubePlaylist
	const youtubeChannelTitle = playlist.items?.[0]?.snippet?.channelTitle?.trim() || null
	return { youtubeChannelTitle, resources: await addVideoDurations(parseVideos(playlist), apiKey) }
}

// add each video's length with one call for the page. the Resources stay as they are if the call fails
async function addVideoDurations(resources: NewResource[], apiKey: string): Promise<NewResource[]> {
	const videoIds = resources.map((resource) => toYoutubeVideoId(resource.url)).filter(Boolean)
	if (!videoIds.length) {
		return resources
	}
	try {
		// videos.list costs one quota unit for up to 50 ids
		const url = `https://www.googleapis.com/youtube/v3/videos?part=contentDetails&id=${videoIds.join(",")}`
		const response = await fetch(url, {
			headers: toApiKeyHeaders(apiKey),
			signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
		})
		if (!response.ok) {
			throw new Error(`youtube videos returned ${response.status}`)
		}

		// put each length on its video's Resource
		const { items = [] } = (await response.json()) as YoutubeVideoDetails
		const durationSecondsByUrl = new Map(
			items.map((video) => [toYoutubeWatchUrl(video.id ?? ""), toVideoDurationSeconds(video.contentDetails?.duration)]),
		)
		return resources.map((resource) => ({
			...resource,
			durationSeconds: durationSecondsByUrl.get(resource.url) ?? null,
		}))
	} catch (error) {
		reportError(error, "ingest", { operation: "video-durations" })
		return resources
	}
}

/**
 * Returns a YouTube ISO 8601 duration in seconds, as in PT1H2M3S. Null if missing, malformed, or zero, as on a live
 * video.
 */
export function toVideoDurationSeconds(duration: string | undefined): number | null {
	const durationMatch = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(duration ?? "")
	if (!durationMatch) {
		return null
	}

	// add the days, hours, minutes, and seconds up
	const [, days = "0", hours = "0", minutes = "0", seconds = "0"] = durationMatch
	return Number(days) * 86_400 + Number(hours) * 3600 + Number(minutes) * 60 + Number(seconds) || null
}

// map a playlist response to "watch" Resources, each mapped to its watch url and deduped within the payload
export function parseVideos(playlist: YoutubePlaylist): NewResource[] {
	// keep the first Resource per video url so that a repeated video collapses to one
	const resourceByUrl = new Map<string, NewResource>()
	for (const video of playlist.items ?? []) {
		// skip a deleted or private video or any malformed entry with no video id, so that one bad entry never throws an error
		const videoId = video.snippet?.resourceId?.videoId
		if (!videoId) {
			continue
		}

		// this canonical watch url matches what the Atom fallback finds, so different access modes dedupe to the same Resource
		const url = toYoutubeWatchUrl(videoId)
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
