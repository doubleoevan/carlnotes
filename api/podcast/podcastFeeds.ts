// the routes for a listener's podcast feed url and its reset, a podcast episode's files at paths after a feed token,
// and the podcast covers
import { PODCAST_COVER_SIZES, type PodcastCover, toPodcastCoverKey } from "@shared/podcastEpisodes"
import { eq, sql } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../../db"
import { podcastEpisodeListens, podcastEpisodes, topics } from "../../db/schema"
import { type AppEnv, currentUser } from "../currentUser"
import { toVersionedImageHeaders } from "../edgeCache"
import { toCachedPodcastCoverJpeg } from "../share/podcastCover"
import { loadAccessiblePodcastEpisode } from "./helpers"
import {
	toPodcastEpisodeAudioResponse,
	toPodcastEpisodeChaptersResponse,
	toPodcastEpisodeTranscriptResponse,
} from "./podcastEpisodeFiles"
import { deletePodcastFeedToken, loadOrCreatePodcastFeedUrl, loadPodcastFeedTokenListener } from "./podcastFeedTokens"

// a cover's file name, made of its key and its size
const PODCAST_COVER_FILE_NAME_PATTERN = /^([0-9a-f]{32})-(\d+)\.jpg$/

// a private or invite Topic's cover is cached by the browser alone, at a url that changes with its title
const PRIVATE_PODCAST_COVER_HEADERS = { "Cache-Control": "private, max-age=31536000, immutable" }

// the kind of cover that a url names, and the id of its Topic or its podcast episode
type LoadPodcastCoverOptions = { kind: string; id: string }

/**
 * Loads the cover that a url names and whether its Topic is public, or null if no such cover exists.
 */
async function loadPodcastCover({
	kind,
	id,
}: LoadPodcastCoverOptions): Promise<{ podcastCover: PodcastCover; isPublic: boolean } | null> {
	// a show cover's id names its Topic
	if (kind === "show") {
		const [topic] = await db.select().from(topics).where(eq(topics.id, id))
		const podcastCover = { kind: "show" as const, id, title: topic?.name ?? "" }
		return topic ? { podcastCover, isPublic: topic.visibility === "public" } : null
	}

	// a podcast episode cover's id names a podcast episode
	const [podcastEpisodeRow] = await db
		.select({ title: podcastEpisodes.title, status: podcastEpisodes.status, visibility: topics.visibility })
		.from(podcastEpisodes)
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.where(eq(podcastEpisodes.id, id))

	// an unknown kind, a removed podcast episode, and a podcast episode with no title yet have no cover
	if (kind !== "episode" || !podcastEpisodeRow?.title || podcastEpisodeRow.status === "removed") {
		return null
	}
	const podcastCover = { kind: "episode" as const, id, title: podcastEpisodeRow.title }
	return { podcastCover, isPublic: podcastEpisodeRow.visibility === "public" }
}

// the podcast feed and cover routes
export const podcastFeedsRoute = new Hono<AppEnv>()
	// the url of the user's podcast feed, which is the user's own on a private or invite Topic
	.get("/topics/:id/podcast-feed", async (context) => {
		// load the topic that the url names
		const userId = currentUser(context)
		const [topic] = await db
			.select()
			.from(topics)
			.where(eq(topics.id, context.req.param("id")))

		// a user who may not see the topic gets no url
		const podcastFeedUrl = topic ? await loadOrCreatePodcastFeedUrl(userId, topic) : null
		return podcastFeedUrl ? context.json({ podcastFeedUrl }) : context.json({ error: "not found" }, 404)
	})
	// a new url for the user's own feed, which ends the old url
	.post("/topics/:id/podcast-feed/reset", async (context) => {
		// load the topic that the url names
		const userId = currentUser(context)
		const [topic] = await db
			.select()
			.from(topics)
			.where(eq(topics.id, context.req.param("id")))

		// only a private or invite topic has a feed of the user's own
		if (!userId || !topic || topic.visibility === "public") {
			return context.json({ error: "not found" }, 404)
		}

		// delete the old feed token, then load the url, which creates a new feed token
		await deletePodcastFeedToken({ topicId: topic.id, userId })
		const podcastFeedUrl = await loadOrCreatePodcastFeedUrl(userId, topic)
		return podcastFeedUrl ? context.json({ podcastFeedUrl }) : context.json({ error: "not found" }, 404)
	})
	// a podcast episode's files at paths after a listener's feed token, which grants access without a session.
	// hono runs this route for a HEAD too
	.get("/podcast-feeds/:token/episodes/:id/:file", async (context) => {
		// the token's listener, and the podcast episode that the url names if the listener may listen to that episode
		const podcastFeedTokenListener = await loadPodcastFeedTokenListener(context.req.param("token"))
		const accessiblePodcastEpisode = podcastFeedTokenListener
			? await loadAccessiblePodcastEpisode({
					userId: podcastFeedTokenListener.userId,
					podcastEpisodeId: context.req.param("id"),
				})
			: null

		// respond 404 unless the listener may listen to the podcast episode on the feed token's own Topic
		if (
			!podcastFeedTokenListener ||
			!accessiblePodcastEpisode ||
			accessiblePodcastEpisode.topic.id !== podcastFeedTokenListener.topicId
		) {
			return context.json({ error: "not found" }, 404)
		}

		// tell shared caches not to store a file that a feed token opens
		context.header("Cache-Control", "private, no-store")

		// respond with the chapters file or the transcript
		const { podcastEpisodeRow } = accessiblePodcastEpisode
		const fileName = context.req.param("file")
		if (fileName === "chapters.json") {
			return toPodcastEpisodeChaptersResponse(context, podcastEpisodeRow.id)
		}
		if (fileName === "transcript.html") {
			return toPodcastEpisodeTranscriptResponse(context, podcastEpisodeRow)
		}

		// respond 404 to any file name but the audio's
		if (fileName !== "audio.mp3") {
			return context.json({ error: "not found" }, 404)
		}

		// count a download through the listener's feed as one play
		if (context.req.method === "GET") {
			await db
				.insert(podcastEpisodeListens)
				.values({ podcastEpisodeId: podcastEpisodeRow.id, userId: podcastFeedTokenListener.userId, playCount: 1 })
				.onConflictDoUpdate({
					target: [podcastEpisodeListens.podcastEpisodeId, podcastEpisodeListens.userId],
					set: { playCount: sql`${podcastEpisodeListens.playCount} + 1` },
				})
		}
		return toPodcastEpisodeAudioResponse(context, podcastEpisodeRow)
	})
	// a cover at a url that only the app can compute, served without a session
	.get("/podcast-covers/:kind/:id/:file", async (context) => {
		// load the cover that the url names, at the size in its file name
		const [, coverKey, sizeText] = PODCAST_COVER_FILE_NAME_PATTERN.exec(context.req.param("file")) ?? []
		const podcastCoverSize = PODCAST_COVER_SIZES.find((coverSize) => String(coverSize) === sizeText)
		const { kind, id } = context.req.param()
		const loadPodcastCoverResult = podcastCoverSize ? await loadPodcastCover({ kind, id }) : null

		// respond 404 to a missing cover, or to a key that does not match the cover's current title
		if (
			!loadPodcastCoverResult ||
			!podcastCoverSize ||
			coverKey !== toPodcastCoverKey(loadPodcastCoverResult.podcastCover)
		) {
			return context.json({ error: "not found" }, 404)
		}

		// respond with the cover's JPEG
		const coverJpeg = await toCachedPodcastCoverJpeg(loadPodcastCoverResult.podcastCover, podcastCoverSize)
		return context.body(coverJpeg as unknown as ArrayBuffer, 200, {
			"Content-Type": "image/jpeg",
			...(loadPodcastCoverResult.isPublic ? toVersionedImageHeaders(true) : PRIVATE_PODCAST_COVER_HEADERS),
		})
	})
