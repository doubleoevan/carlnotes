// the podcast episode film routes: the stable film and captions urls, which start a rebuild for a film drawn from an
// image it no longer shows, and a user's choice to open or close Topic Cinema

import { topicPodcastEpisodeVideoSectionPayload } from "@carlnotes/contracts/podcast"
import { db } from "@carlnotes/db"
import { isMonthlyBudgetCutoffPassed } from "@carlnotes/db/monthlyBudgetCutoffs"
import { takeRateLimitSlot } from "@carlnotes/db/redisRateLimits"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { attachmentStream } from "@carlnotes/db/store"
import { startTopicPodcastEpisodeVideoRebuild } from "@carlnotes/pipeline/temporalClient"
import { toShownImage } from "@carlnotes/pipeline/topicPodcastEpisodeVideo/topicPodcastEpisodeVideoInputs"
import { reportError } from "@carlnotes/server/monitoring"
import { zValidator } from "@hono/zod-validator"
import { and, eq } from "drizzle-orm"
import { Hono } from "hono"
import { isAllowed } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"
import { PRIVATE_NO_STORE_CACHE_CONTROL } from "../edgeCache"
import {
	countPodcastEpisodePlayRequest,
	isJsonAccepted,
	loadPodcastEpisodePlayRequest,
	toPodcastEpisodeFileResponse,
} from "./podcastEpisodeFiles"
import type { AccessiblePodcastEpisode } from "./podcastEpisodeRows"
import {
	loadReadyTopicPodcastEpisodeVideoFiles,
	type ReadyTopicPodcastEpisodeVideoFiles,
	saveTopicPodcastEpisodeVideoSection,
	TOPIC_PODCAST_EPISODE_VIDEO_CAPTIONS_FILE,
	TOPIC_PODCAST_EPISODE_VIDEO_FILE,
} from "./topicPodcastEpisodeVideos"

// how long one check of a stale film's spend cutoff and rebuild start holds off the next for its podcast episode
const STALE_FILM_CHECK_MS = 60_000

// the podcast episode film routes
export const topicPodcastEpisodeVideosRoute = new Hono<AppEnv>()
	// the stable film url. hono runs this route for a HEAD too and drops the body
	.get("/episodes/:id/video.mp4", async (context) => {
		// read the listener, the podcast episode, and its ready film
		const podcastEpisodePlayRequest = await loadPodcastEpisodePlayRequest(context)
		const readyTopicPodcastEpisodeVideoFiles = podcastEpisodePlayRequest
			? await loadReadyTopicPodcastEpisodeVideoFiles(
					podcastEpisodePlayRequest.accessiblePodcastEpisode.podcastEpisodeRow.id,
				)
			: null
		if (!podcastEpisodePlayRequest || !readyTopicPodcastEpisodeVideoFiles) {
			return toPodcastEpisodeFileResponse(context, {
				...TOPIC_PODCAST_EPISODE_VIDEO_FILE,
				objectKey: null,
				byteSize: null,
			})
		}

		// count a GET, and start a rebuild if the film shows an older image. the film that plays now is served at once
		if (context.req.method === "GET") {
			countPodcastEpisodePlayRequest(context, podcastEpisodePlayRequest, "video")
			void startStaleFilmRebuild(podcastEpisodePlayRequest.accessiblePodcastEpisode, readyTopicPodcastEpisodeVideoFiles)
		}
		return toPodcastEpisodeFileResponse(context, {
			...TOPIC_PODCAST_EPISODE_VIDEO_FILE,
			objectKey: readyTopicPodcastEpisodeVideoFiles.filmKey,
			byteSize: readyTopicPodcastEpisodeVideoFiles.byteSize,
		})
	})
	// the film's captions, for the web player's track
	.get("/episodes/:id/captions.vtt", async (context) => {
		// read the listener, the podcast episode, and its ready film
		const podcastEpisodePlayRequest = await loadPodcastEpisodePlayRequest(context)
		const readyTopicPodcastEpisodeVideoFiles = podcastEpisodePlayRequest
			? await loadReadyTopicPodcastEpisodeVideoFiles(
					podcastEpisodePlayRequest.accessiblePodcastEpisode.podcastEpisodeRow.id,
				)
			: null
		const captionsKey = readyTopicPodcastEpisodeVideoFiles?.captionsKey ?? null

		// a browser track reads captions only from this origin, so a plain GET returns the file itself
		if (captionsKey && context.req.method === "GET" && !isJsonAccepted(context)) {
			context.header("Cache-Control", PRIVATE_NO_STORE_CACHE_CONTROL)
			return context.body(attachmentStream(captionsKey), 200, { "Content-Type": "text/vtt; charset=utf-8" })
		}
		return toPodcastEpisodeFileResponse(context, {
			...TOPIC_PODCAST_EPISODE_VIDEO_CAPTIONS_FILE,
			objectKey: captionsKey,
			byteSize: null,
		})
	})
	// a user's choice to open or close Topic Cinema, saved with the latest film when they chose
	.put("/topics/:id/video-section", zValidator("json", topicPodcastEpisodeVideoSectionPayload), async (context) => {
		// reject a visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// a topic the user may not view looks identical to a missing one
		const [topic] = await db
			.select()
			.from(topics)
			.where(eq(topics.id, context.req.param("id")))
		if (!topic || !(await isAllowed(userId, "topic:view", topic))) {
			return context.json({ error: "not found" }, 404)
		}

		// the choice names a published podcast episode of this topic. any other id is not found
		const sectionChoice = context.req.valid("json")
		const [podcastEpisodeRow] = await db
			.select({ id: podcastEpisodes.id })
			.from(podcastEpisodes)
			.where(
				and(
					eq(podcastEpisodes.id, sectionChoice.podcastEpisodeId),
					eq(podcastEpisodes.topicId, topic.id),
					eq(podcastEpisodes.status, "published"),
				),
			)
		if (!podcastEpisodeRow) {
			return context.json({ error: "not found" }, 404)
		}

		// save the choice
		await saveTopicPodcastEpisodeVideoSection({ userId, topicId: topic.id, ...sectionChoice })
		return context.json({ ok: true })
	})

/**
 * Starts a rebuild of a film drawn from an image it no longer shows, unless the user its podcast episode bills is past
 * the podcast episode spend cutoff. A film with its own image shows that image, so a changed podcast episode image
 * never rebuilds it. A stale film is checked at most once a minute. A failed start is reported, and the film that
 * plays now stays.
 */
export async function startStaleFilmRebuild(
	{ podcastEpisodeRow, topic }: Pick<AccessiblePodcastEpisode, "podcastEpisodeRow" | "topic">,
	{
		renderedImageHash,
		imageHash: topicPodcastEpisodeVideoImageHash,
		ownerId,
	}: Pick<ReadyTopicPodcastEpisodeVideoFiles, "renderedImageHash" | "imageHash" | "ownerId">,
): Promise<void> {
	// the image the film shows now: its own, or else the one its podcast episode shows
	const { imageHash } = toShownImage({
		podcastEpisodeId: podcastEpisodeRow.id,
		topicId: topic.id,
		podcastEpisodeImageHash: podcastEpisodeRow.imageHash,
		topicImageHash: topic.imageHash,
		topicPodcastEpisodeVideoImageHash,
	})

	// a film drawn from the shown image is current
	if (imageHash === renderedImageHash) {
		return
	}

	// a stale film rebuilds on the spend of the user its podcast episode bills, checked once a minute for each podcast
	// episode on every replica. a check that Redis could not count still runs
	try {
		const staleFilmCheckWaitMs = await takeRateLimitSlot({
			key: `stale-film-check:${podcastEpisodeRow.id}`,
			slotMs: STALE_FILM_CHECK_MS,
		})
		if (staleFilmCheckWaitMs || (await isMonthlyBudgetCutoffPassed(ownerId, "podcastEpisodes"))) {
			return
		}

		// start the rebuild, which joins one already running
		await startTopicPodcastEpisodeVideoRebuild(podcastEpisodeRow.id)
	} catch (error) {
		reportError(error, "topic-podcast-episode-video", { podcastEpisodeId: podcastEpisodeRow.id, step: "rebuild" })
	}
}
