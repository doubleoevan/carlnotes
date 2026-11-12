// the routes for a listener's podcast feed url and its reset, a podcast episode's files at paths after a feed token,
// and the podcast covers

import type { PodcastEpisodeFormat } from "@carlnotes/contracts/podcast"
import { PODCAST_COVER_SIZES, type PodcastCover, toPodcastEpisodeCover } from "@carlnotes/contracts/podcastEpisodes"
import { db } from "@carlnotes/db"
import { podcastEpisodeListens, podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { trackEvent } from "@carlnotes/server/analytics"
import { toLatestPodcastCoverKey, toPodcastCoverKey } from "@carlnotes/server/podcastCoverPaths"
import { eq, sql } from "drizzle-orm"
import { Hono } from "hono"
import { countPodcastEpisodeListen, toRequestSender } from "../counts/viewerCounts"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import {
	LATEST_PRIVATE_IMAGE_HEADERS,
	PRIVATE_IMAGE_HEADERS,
	PRIVATE_NO_STORE_CACHE_CONTROL,
	toVersionedImageHeaders,
} from "../edgeCache"
import { toCachedPodcastCoverJpeg } from "../share/podcastCover"
import {
	toPodcastEpisodeAudioResponse,
	toPodcastEpisodeChaptersResponse,
	toPodcastEpisodeFileResponse,
	toPodcastEpisodeTranscriptResponse,
} from "./podcastEpisodeFiles"
import { loadAccessiblePodcastEpisode, toPodcastEpisodeAnalyticsProperties } from "./podcastEpisodeRows"
import { deletePodcastFeedToken, loadOrCreatePodcastFeedUrls, loadPodcastFeedTokenListener } from "./podcastFeedTokens"
import { loadReadyTopicPodcastEpisodeVideoFiles, TOPIC_PODCAST_EPISODE_VIDEO_FILE } from "./topicPodcastEpisodeVideos"

// the format of each podcast episode file that a feed encloses, by its file name
const PODCAST_EPISODE_FORMAT_BY_FILE_NAME: Record<string, PodcastEpisodeFormat | undefined> = {
	"audio.mp3": "audio",
	"video.mp4": "video",
}

// a cover's file name, made of its key and its size
const PODCAST_COVER_FILE_NAME_PATTERN = /^([0-9a-f]{32})-(\d+)\.jpg$/

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
		const podcastCover = {
			kind: "show" as const,
			id,
			title: topic?.name ?? "",
			topicId: id,
			topicImageHash: topic?.imageHash ?? null,
		}
		return topic ? { podcastCover, isPublic: topic.visibility === "public" } : null
	}

	// a podcast episode cover's id names a podcast episode
	const [podcastEpisodeRow] = await db
		.select({
			title: podcastEpisodes.title,
			status: podcastEpisodes.status,
			season: podcastEpisodes.season,
			episodeNumber: podcastEpisodes.episodeNumber,
			imageHash: podcastEpisodes.imageHash,
			visibility: topics.visibility,
			topicId: topics.id,
			topicName: topics.name,
			topicImageHash: topics.imageHash,
		})
		.from(podcastEpisodes)
		.innerJoin(topics, eq(podcastEpisodes.topicId, topics.id))
		.where(eq(podcastEpisodes.id, id))

	// an unknown kind, a removed podcast episode, and a podcast episode with no title yet have no cover
	if (kind !== "episode" || !podcastEpisodeRow?.title || podcastEpisodeRow.status === "removed") {
		return null
	}
	const { title, topicId, topicName, topicImageHash } = podcastEpisodeRow
	const podcastCover = toPodcastEpisodeCover(
		{ ...podcastEpisodeRow, id, title },
		{ id: topicId, name: topicName, imageHash: topicImageHash },
	)
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
		const podcastFeedUrls = topic ? await loadOrCreatePodcastFeedUrls(userId, topic) : null
		return podcastFeedUrls ? context.json(podcastFeedUrls) : context.json({ error: "not found" }, 404)
	})
	// a new url for the user's own feeds, which ends the old urls of both
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
		const podcastFeedUrls = await loadOrCreatePodcastFeedUrls(userId, topic)
		trackEvent("podcast_feed_reset", userId, { ...toAnalyticsProperties(context), topicId: topic.id })
		return podcastFeedUrls ? context.json(podcastFeedUrls) : context.json({ error: "not found" }, 404)
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
		context.header("Cache-Control", PRIVATE_NO_STORE_CACHE_CONTROL)

		// respond with the chapters file or the transcript
		const { podcastEpisodeRow } = accessiblePodcastEpisode
		const fileName = context.req.param("file")
		if (fileName === "chapters.json") {
			return toPodcastEpisodeChaptersResponse(context, podcastEpisodeRow.id)
		}
		if (fileName === "transcript.html") {
			return toPodcastEpisodeTranscriptResponse(context, podcastEpisodeRow)
		}

		// respond 404 to any file name but the audio's and the film's, and to a film that is not ready
		const format = PODCAST_EPISODE_FORMAT_BY_FILE_NAME[fileName]
		const readyTopicPodcastEpisodeVideoFiles =
			format === "video" ? await loadReadyTopicPodcastEpisodeVideoFiles(podcastEpisodeRow.id) : null
		if (!format || (format === "video" && !readyTopicPodcastEpisodeVideoFiles)) {
			return context.json({ error: "not found" }, 404)
		}

		// count a download through the listener's feed as one play in its format and as its listener, and report the play
		if (context.req.method === "GET") {
			const videoPlayCount = format === "video" ? 1 : 0
			void countPodcastEpisodeListen({
				requestSender: toRequestSender(context, podcastFeedTokenListener.userId),
				podcastEpisodeId: podcastEpisodeRow.id,
				format,
			})
			await db
				.insert(podcastEpisodeListens)
				.values({
					podcastEpisodeId: podcastEpisodeRow.id,
					userId: podcastFeedTokenListener.userId,
					playCount: 1,
					videoPlayCount,
				})
				.onConflictDoUpdate({
					target: [podcastEpisodeListens.podcastEpisodeId, podcastEpisodeListens.userId],
					set: {
						playCount: sql`${podcastEpisodeListens.playCount} + 1`,
						videoPlayCount: sql`${podcastEpisodeListens.videoPlayCount} + ${videoPlayCount}`,
					},
				})
			trackEvent("episode_played", podcastFeedTokenListener.userId, {
				entryPoint: "feed",
				format,
				...toPodcastEpisodeAnalyticsProperties(accessiblePodcastEpisode.topic, podcastEpisodeRow.id),
			})
		}

		// respond with the film or the audio
		if (readyTopicPodcastEpisodeVideoFiles) {
			return toPodcastEpisodeFileResponse(context, {
				...TOPIC_PODCAST_EPISODE_VIDEO_FILE,
				objectKey: readyTopicPodcastEpisodeVideoFiles.filmKey,
				byteSize: readyTopicPodcastEpisodeVideoFiles.byteSize,
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

		// respond 404 to a missing cover, or to a key that is neither the cover's current key nor its latest key
		if (!loadPodcastCoverResult || !podcastCoverSize) {
			return context.json({ error: "not found" }, 404)
		}
		const { podcastCover, isPublic } = loadPodcastCoverResult
		const isCurrentKey = coverKey === toPodcastCoverKey(podcastCover)
		if (!isCurrentKey && coverKey !== toLatestPodcastCoverKey(podcastCover.kind, podcastCover.id)) {
			return context.json({ error: "not found" }, 404)
		}

		// respond with the cover's JPEG. the current key's url never changes what it serves, and the latest key's does
		const coverJpeg = await toCachedPodcastCoverJpeg(podcastCover, podcastCoverSize)
		const latestHeaders = isPublic ? toVersionedImageHeaders(false) : LATEST_PRIVATE_IMAGE_HEADERS
		const currentHeaders = isPublic ? toVersionedImageHeaders(true) : PRIVATE_IMAGE_HEADERS
		return context.body(coverJpeg as unknown as ArrayBuffer, 200, {
			"Content-Type": "image/jpeg",
			...(isCurrentKey ? currentHeaders : latestHeaders),
		})
	})
