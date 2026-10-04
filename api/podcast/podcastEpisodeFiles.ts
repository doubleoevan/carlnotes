// the responses for a podcast episode's audio, chapters file, and transcript
import { eq } from "drizzle-orm"
import type { Context } from "hono"
import { db } from "../../db"
import { podcastEpisodeChapters, podcastEpisodes } from "../../db/schema"
import { toPodcastEpisodeAudioUrl } from "../../worker"
import { toPodcastEpisodeChaptersJson, toTranscriptHtml } from "../share/podcastFeed"
import type { PodcastEpisodeRow } from "./helpers"

/**
 * Returns a podcast episode's audio length and type for a HEAD, and a redirect to its presigned url for a GET.
 */
export function toPodcastEpisodeAudioResponse(context: Context, podcastEpisodeRow: PodcastEpisodeRow): Response {
	// respond 404 if the podcast episode has no audio
	if (!podcastEpisodeRow.audioKey) {
		return context.json({ error: "not found" }, 404)
	}

	// respond to a HEAD with the audio's length and type instead of a redirect
	if (context.req.method === "HEAD") {
		return context.body(null, 200, {
			"Content-Type": "audio/mpeg",
			"Content-Length": String(podcastEpisodeRow.audioByteSize ?? 0),
			"Accept-Ranges": "bytes",
		})
	}

	// redirect to the short-lived presigned url, and never cache the redirect
	context.header("Cache-Control", "private, no-store")
	return context.redirect(toPodcastEpisodeAudioUrl(podcastEpisodeRow.audioKey), 302)
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
