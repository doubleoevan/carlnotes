// the topic image routes. the files, gated by the topic's visibility, an editor's regenerate and upload, and the
// render poll

import {
	fromTopicImageFileName,
	regenerateTopicImagePayload,
	type TopicImageRenderResponse,
	type TopicImageUrls,
	toPodcastEpisodeImageUrls,
	toTopicImageUrlsOrNull,
	toTopicPodcastEpisodeVideoPosterUrl,
	toTopicPostImageUrls,
} from "@carlnotes/contracts/topicImages"
import { db } from "@carlnotes/db"
import { podcastEpisodes, topicPodcastEpisodeVideos } from "@carlnotes/db/schema/podcast"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { loadTopicImage } from "@carlnotes/db/topicImages"
import { toTopicImageFileKey } from "@carlnotes/pipeline/topicImages/topicImageFiles"
import { loadTopicImageRender, type TopicImageRenderRow } from "@carlnotes/pipeline/topicImages/topicImageRenders"
import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { isAllowed } from "../authorization"
import { uploadSignedOutRejection } from "../bodyLimit"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { toObjectionableContentResponse } from "../moderation"
import { toolCallerRateLimiter } from "../rateLimit"
import { imageUploadBodyLimit, readUploadedImageOriginal } from "./imageEdits"
import { namedTopicColumns } from "./permissions"
import { serveImageFile } from "./serveImageFile"
import {
	loadTopicImageEditor,
	regenerateTopicImage,
	storeUploadedTopicImage,
	type TopicImageEditor,
} from "./topicImageEdits"

// the topic image routes
export const topicImagesRoute = new Hono<AppEnv>()
	// one derived file, at the topic's current hash alone, to anyone who may see the topic
	.get("/topic-images/:topicId/:hash/:file", async (context) => {
		// the topic, its image, and the file the url names
		const { topicId, hash, file } = context.req.param()
		const derivedFile = fromTopicImageFileName(file)
		const [topic] = await db.select(namedTopicColumns).from(topics).where(eq(topics.id, topicId))
		const topicImage = topic && derivedFile ? await loadTopicImage(topicId) : null

		// an unknown file, an unknown topic, or a hash that is no longer current is not found
		if (!topic || !derivedFile || !topicImage || topicImage.hash !== hash) {
			return context.json({ error: "not found" }, 404)
		}
		return serveImageFile(context, { topic, objectKey: toTopicImageFileKey(topicId, hash, file) })
	})
	// the owner's regenerate: a fresh render on the better model, from an optional image prompt, within the month's limit
	.post(
		"/topics/:id/image/regenerate",
		toolCallerRateLimiter,
		zValidator("json", regenerateTopicImagePayload),
		async (context) => {
			// an editor of the topic
			const topicImageEditor = await loadTopicEditor(context)
			if ("response" in topicImageEditor) {
				return topicImageEditor.response
			}

			// the render, within the month's regenerations and after the image prompt's moderation
			const regenerateTopicImageResult = await regenerateTopicImage({
				topicImageEditor,
				imagePrompt: context.req.valid("json").imagePrompt,
			})
			switch (regenerateTopicImageResult.status) {
				case "started":
					return context.json({ renderId: regenerateTopicImageResult.renderId }, 202)
				case "limitReached":
					return context.json({ error: "regeneration limit reached" }, 429)
				// the moderation names the category
				case "objectionable":
					return toObjectionableContentResponse(context, regenerateTopicImageResult.category)
			}
		},
	)
	// a render as the editor polls it
	.get("/topic-image-renders/:id", async (context) => {
		// the render, which the user who started it and an editor of its topic may read
		const userId = currentUser(context)
		const render = await loadTopicImageRender(context.req.param("id"))
		const [topic] = render ? await db.select(namedTopicColumns).from(topics).where(eq(topics.id, render.topicId)) : []
		const isOwnRender = Boolean(userId) && render?.userId === userId
		if (!render || !topic || !(isOwnRender || (await isAllowed(userId, "topic:edit", topic)))) {
			return context.json({ error: "not found" }, 404)
		}
		// the image a succeeded render left, which is the poster for a film's render
		const isSucceeded = render.status === "succeeded"
		const renderResponse: TopicImageRenderResponse = {
			status: render.status,
			image: isSucceeded ? await loadRenderedImage(render) : null,
			posterUrl: isSucceeded ? await loadRenderedPosterUrl(render) : null,
		}
		return context.json(renderResponse)
	})
	// the owner's upload: a jpeg, png, or webp, center-cropped and derived in place of the current image
	.post("/topics/:id/image", toolCallerRateLimiter, uploadSignedOutRejection, imageUploadBodyLimit, async (context) => {
		// an editor of the topic
		const topicImageEditor = await loadTopicEditor(context)
		if ("response" in topicImageEditor) {
			return topicImageEditor.response
		}

		// the file, checked by its size, its type, and the image moderation
		const uploadedImage = await readUploadedImageOriginal(context, {
			subjectKind: "topic image",
			subjectId: topicImageEditor.topic.id,
		})
		if ("response" in uploadedImage) {
			return uploadedImage.response
		}

		// the checked original becomes the current image
		const image = await storeUploadedTopicImage({
			topicImageEditor,
			original: uploadedImage.original,
			analyticsProperties: toAnalyticsProperties(context),
		})
		return context.json({ image })
	})

// the poster url of the image a succeeded film render left, or null for any other render
async function loadRenderedPosterUrl(render: TopicImageRenderRow): Promise<string | null> {
	if (!render.topicPodcastEpisodeVideoId) {
		return null
	}

	// the film's current image, at its podcast episode
	const [topicPodcastEpisodeVideo] = await db
		.select({
			podcastEpisodeId: topicPodcastEpisodeVideos.podcastEpisodeId,
			imageHash: topicPodcastEpisodeVideos.imageHash,
		})
		.from(topicPodcastEpisodeVideos)
		.where(eq(topicPodcastEpisodeVideos.id, render.topicPodcastEpisodeVideoId))
	return topicPodcastEpisodeVideo?.imageHash
		? toTopicPodcastEpisodeVideoPosterUrl(topicPodcastEpisodeVideo.podcastEpisodeId, topicPodcastEpisodeVideo.imageHash)
		: null
}

// the urls of the image a succeeded render left, on its podcast episode, its Topic Post, or its topic. a film's render
// leaves a poster and no urls
async function loadRenderedImage(render: TopicImageRenderRow): Promise<TopicImageUrls | null> {
	if (render.topicPodcastEpisodeVideoId) {
		return null
	}

	// a podcast episode render's image is the podcast episode's current one
	if (render.podcastEpisodeId) {
		const [podcastEpisode] = await db
			.select({ imageHash: podcastEpisodes.imageHash })
			.from(podcastEpisodes)
			.where(eq(podcastEpisodes.id, render.podcastEpisodeId))

		// a podcast episode with no image yet has no urls
		return podcastEpisode?.imageHash
			? toPodcastEpisodeImageUrls(render.podcastEpisodeId, podcastEpisode.imageHash)
			: null
	}

	// a Topic Post render's image is the post's current one
	if (render.topicPostId) {
		const [topicPost] = await db
			.select({ imageHash: topicPosts.imageHash })
			.from(topicPosts)
			.where(eq(topicPosts.id, render.topicPostId))
		return topicPost?.imageHash ? toTopicPostImageUrls(render.topicPostId, topicPost.imageHash) : null
	}

	// a topic render's image is the topic's current one
	return toTopicImageUrlsOrNull(render.topicId, (await loadTopicImage(render.topicId))?.hash ?? null)
}

// the signed-in editor of the route's topic, or the response that turns the request away. a signed-out visitor is
// turned away before the topic is read, and a topic the user may not edit reads as missing
async function loadTopicEditor(context: Context<AppEnv>): Promise<TopicImageEditor | { response: Response }> {
	const userId = currentUser(context)
	if (!userId) {
		return { response: context.json({ error: "unauthorized" }, 401) }
	}
	const topicImageEditor = await loadTopicImageEditor(userId, context.req.param("id") ?? "")
	return topicImageEditor ?? { response: context.json({ error: "not found" }, 404) }
}
