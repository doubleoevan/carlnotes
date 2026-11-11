// the responses for a podcast episode's audio, film, captions, chapters file, and transcript

import type { PodcastEpisodeFormat } from "@carlnotes/contracts/podcast"
import { db } from "@carlnotes/db"
import { podcastEpisodeChapters, podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { PODCAST_EPISODE_FILE_URL_LIFETIME_SECONDS, toPodcastEpisodeFileUrl } from "@carlnotes/db/store"
import { trackEvent } from "@carlnotes/server/analytics"
import { eq } from "drizzle-orm"
import type { Context } from "hono"
import { countPodcastEpisodeListen, countWithinRateLimit, toRequestSender } from "../counts/viewerCounts"
import { type AppEnv, currentUser } from "../currentUser"
import { PRIVATE_NO_STORE_CACHE_CONTROL } from "../edgeCache"
import { toPodcastEpisodeChaptersJson, toTranscriptHtml } from "../share/podcastFeed"
import { type PlayTokenCaller, readPlayToken } from "./playTokens"
import {
	type AccessiblePodcastEpisode,
	loadAccessiblePodcastEpisode,
	type PodcastEpisodeRow,
	toPodcastEpisodeAnalyticsProperties,
} from "./podcastEpisodeRows"

// a play request's listener, the play token's caller if a token named one, and the podcast episode under that
// listener's access
export type PodcastEpisodePlayRequest = {
	listenerUserId: string | null
	playTokenCaller: PlayTokenCaller | null
	accessiblePodcastEpisode: AccessiblePodcastEpisode
}

/**
 * Reads a request for a podcast episode's audio or film. An MCP view's media element sends no session, so its play
 * token names the caller instead. Returns null for a token that names no caller or a podcast episode the listener may
 * not play, which both read as missing.
 */
export async function loadPodcastEpisodePlayRequest(
	context: Context<AppEnv>,
): Promise<PodcastEpisodePlayRequest | null> {
	// a play token must name its caller for this podcast episode
	const podcastEpisodeId = context.req.param("id") ?? ""
	const playToken = context.req.query("play")
	const playTokenCaller = playToken ? readPlayToken({ playToken, podcastEpisodeId }) : null
	if (playToken && !playTokenCaller) {
		return null
	}

	// the listener is the token's caller, else the session's user, and the podcast episode is read under that listener's access
	const listenerUserId = playTokenCaller ? playTokenCaller.userId : currentUser(context)
	const accessiblePodcastEpisode = await loadAccessiblePodcastEpisode({ userId: listenerUserId, podcastEpisodeId })
	return accessiblePodcastEpisode ? { listenerUserId, playTokenCaller, accessiblePodcastEpisode } : null
}

/**
 * Counts the listener of a web play or a podcast app's download within the listen rate limit, without the response
 * waiting on the count, and reports a play token's first request as a play in its format.
 */
export function countPodcastEpisodePlayRequest(
	context: Context<AppEnv>,
	{ listenerUserId, playTokenCaller, accessiblePodcastEpisode }: PodcastEpisodePlayRequest,
	format: PodcastEpisodeFormat,
): void {
	// count the listener
	const podcastEpisodeId = accessiblePodcastEpisode.podcastEpisodeRow.id
	const requestSender = toRequestSender(context, listenerUserId ?? undefined)
	void countWithinRateLimit({
		requestSender,
		rateLimitName: "podcast-listen",
		count: () => countPodcastEpisodeListen(requestSender, podcastEpisodeId),
	})

	// a play token's first request reports the play
	if (playTokenCaller?.userId && isFirstAudioRequest(context.req.header("range"))) {
		trackEvent("episode_played", playTokenCaller.userId, {
			entryPoint: "mcp",
			format,
			...toPodcastEpisodeAnalyticsProperties(accessiblePodcastEpisode.topic, podcastEpisodeId),
		})
	}
}

/**
 * Returns whether an audio request starts at the first byte.
 */
export function isFirstAudioRequest(rangeHeader: string | undefined): boolean {
	return !rangeHeader || rangeHeader.startsWith("bytes=0-")
}

/**
 * Returns a recording's audio length and type for a HEAD, and a redirect to its presigned url for a GET. A podcast
 * episode's audio and a Topic Post Discussion's are served the same way.
 */
export function toPodcastEpisodeAudioResponse(
	context: Context,
	podcastEpisodeRow: Pick<PodcastEpisodeRow, "audioKey" | "audioByteSize">,
): Response {
	return toPodcastEpisodeFileResponse(context, {
		objectKey: podcastEpisodeRow.audioKey,
		byteSize: podcastEpisodeRow.audioByteSize,
		contentType: "audio/mpeg",
		urlFieldName: "audioUrl",
	})
}

// a stored podcast episode file: its key, null if there is none, its size, its type, and the field a platform
// player's JSON names its url in
export type PodcastEpisodeFile = {
	objectKey: string | null
	byteSize: number | null
	contentType: string
	urlFieldName: "audioUrl" | "videoUrl" | "captionsUrl"
}

/**
 * Returns a stored podcast episode file's length and type for a HEAD, and for a GET a redirect to its presigned url,
 * or the url as JSON for a platform player.
 */
export function toPodcastEpisodeFileResponse(
	context: Context,
	{ objectKey, byteSize, contentType, urlFieldName }: PodcastEpisodeFile,
): Response {
	// prevent caching either representation, including a missing file
	context.header("Cache-Control", PRIVATE_NO_STORE_CACHE_CONTROL)
	context.header("Vary", "Accept")

	// respond 404 if the podcast episode has no such file
	if (!objectKey) {
		return context.json({ error: "not found" }, 404)
	}

	// respond to a HEAD with the file's length and type
	if (context.req.method === "HEAD") {
		return context.body(null, 200, {
			"Content-Type": contentType,
			"Content-Length": String(byteSize ?? 0),
			"Accept-Ranges": "bytes",
		})
	}

	// resolve a source for platform players without forwarding their session to storage
	const fileUrl = toPodcastEpisodeFileUrl(objectKey)
	if (isJsonAccepted(context)) {
		return context.json({
			[urlFieldName]: fileUrl,
			expiresAt: new Date(Date.now() + PODCAST_EPISODE_FILE_URL_LIFETIME_SECONDS * 1000).toISOString(),
		})
	}
	return context.redirect(fileUrl, 302)
}

/**
 * Returns whether a request asks for JSON, as a platform player does for a file's url.
 */
export function isJsonAccepted(context: Context): boolean {
	return (
		context.req
			.header("Accept")
			?.split(",")
			.some((type) => type.trim().toLowerCase() === "application/json") ?? false
	)
}

/**
 * Returns a podcast episode's chapters file response, in the Podcasting 2.0 format.
 */
export async function toPodcastEpisodeChaptersResponse(context: Context, podcastEpisodeId: string): Promise<Response> {
	// respond with the podcast episode's chapters in their order
	const podcastEpisodeChapterRows = await db
		.select()
		.from(podcastEpisodeChapters)
		.where(eq(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodeId))
		.orderBy(podcastEpisodeChapters.position)
	return context.body(toPodcastEpisodeChaptersJson(podcastEpisodeChapterRows), 200, {
		"Content-Type": "application/json+chapters",
	})
}

/**
 * Returns a podcast episode's transcript response, built from its stored script.
 */
export async function toPodcastEpisodeTranscriptResponse(
	context: Context,
	podcastEpisodeRow: PodcastEpisodeRow,
): Promise<Response> {
	// the podcast episode's stored script
	const [podcastEpisodeScriptRow] = await db
		.select({ script: podcastEpisodes.script })
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.id, podcastEpisodeRow.id))

	// respond 404 if the podcast episode has not published, or has no script or no title
	if (podcastEpisodeRow.status !== "published" || !podcastEpisodeScriptRow?.script || !podcastEpisodeRow.title) {
		return context.json({ error: "not found" }, 404)
	}
	return context.html(toTranscriptHtml(podcastEpisodeRow.title, podcastEpisodeScriptRow.script))
}
