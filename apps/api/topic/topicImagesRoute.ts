// the topic image routes: the files, gated by the topic's visibility, the owner's regenerate and its poll, the upload,
// and the removal of an upload

import {
	fromTopicImageFileName,
	regenerateTopicImagePayload,
	type TopicImageRenderResponse,
	type TopicImageUrls,
	toPodcastEpisodeImageUrls,
	toTopicImageUrls,
	toTopicImageUrlsOrNull,
} from "@carlnotes/contracts/topicImages"
import { db } from "@carlnotes/db"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { loadTopicImage } from "@carlnotes/db/topicImages"
import { topicImageRegenerateModel } from "@carlnotes/models/topicImageModel"
import { storeTopicImageFiles, toTopicImageFileKey } from "@carlnotes/pipeline/topicImages/topicImageFiles"
import {
	loadTopicImageRender,
	removeTopicImageUpload,
	replaceTopicImage,
	startTopicImageRender,
	type TopicImageRenderRow,
} from "@carlnotes/pipeline/topicImages/topicImageRenders"
import { trackEvent } from "@carlnotes/server/analytics"
import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { isAllowed } from "../authorization"
import { uploadSignedOutRejection } from "../bodyLimit"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { toolCallerRateLimiter } from "../rateLimit"
import { imageUploadBodyLimit, readUploadedImageOriginal, toImagePromptRejection } from "./imageEdits"
import { namedTopicColumns } from "./permissions"
import { serveImageFile } from "./serveImageFile"

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
			// an editor of the topic, with regenerations left this month
			const editor = await loadTopicEditor(context)
			if ("response" in editor) {
				return editor.response
			}
			if (!(await isAllowed(editor.userId, "topicImage:regenerate"))) {
				return context.json({ error: "regeneration limit reached" }, 429)
			}

			// an image prompt goes to the image model alone, so it passes the moderation first
			const { imagePrompt } = context.req.valid("json")
			const imagePromptRejection = await toImagePromptRejection(context, {
				imagePrompt,
				subjectKind: "topic image prompt",
				subjectId: editor.topic.id,
			})
			if (imagePromptRejection) {
				return imagePromptRejection
			}

			// the render row and its workflow
			const renderId = await startTopicImageRender({
				topicId: editor.topic.id,
				userId: editor.userId,
				kind: "regenerate",
				model: topicImageRegenerateModel(),
				imagePrompt,
			})
			return context.json({ renderId }, 202)
		},
	)
	// a render as the editor polls it
	.get("/topic-image-renders/:id", async (context) => {
		// the render, which only an editor of its topic may read
		const render = await loadTopicImageRender(context.req.param("id"))
		const [topic] = render ? await db.select(namedTopicColumns).from(topics).where(eq(topics.id, render.topicId)) : []
		if (!render || !topic || !(await isAllowed(currentUser(context), "topic:edit", topic))) {
			return context.json({ error: "not found" }, 404)
		}
		const renderResponse: TopicImageRenderResponse = {
			status: render.status,
			image: render.status === "succeeded" ? await loadRenderedImage(render) : null,
		}
		return context.json(renderResponse)
	})
	// the owner's upload: a jpeg, png, or webp, center-cropped and derived in place of the current image
	.post("/topics/:id/image", toolCallerRateLimiter, uploadSignedOutRejection, imageUploadBodyLimit, async (context) => {
		// an editor of the topic
		const editor = await loadTopicEditor(context)
		if ("response" in editor) {
			return editor.response
		}

		// the file, checked by its size, its type, and the image moderation
		const uploadedImage = await readUploadedImageOriginal(context, {
			subjectKind: "topic image",
			subjectId: editor.topic.id,
		})
		if ("response" in uploadedImage) {
			return uploadedImage.response
		}
		const { original } = uploadedImage

		// the files under their hash, then the row that makes the upload current
		const hash = await storeTopicImageFiles(editor.topic.id, original)
		await replaceTopicImage({
			topicId: editor.topic.id,
			renderId: null,
			hash,
			origin: "uploaded",
			scene: null,
			model: null,
			imagePrompt: null,
			width: original.width,
			height: original.height,
			costDollars: 0,
		})
		trackEvent("topic_image_upload", editor.userId, {
			...toAnalyticsProperties(context),
			topicId: editor.topic.id,
			isOwner: editor.topic.ownerId === editor.userId,
		})
		return context.json({ image: toTopicImageUrls(editor.topic.id, hash) })
	})
	// the removal of an upload: its files go, and a fresh render starts on the editor's budget. the render counts as
	// one of the month's regenerations
	.delete("/topics/:id/image", toolCallerRateLimiter, async (context) => {
		// an editor of the topic with a regeneration left, whose current image is an upload
		const editor = await loadTopicEditor(context)
		if ("response" in editor) {
			return editor.response
		}
		if (!(await isAllowed(editor.userId, "topicImage:regenerate"))) {
			return context.json({ error: "regeneration limit reached" }, 429)
		}

		// the upload's row and files go. a current image that is not an upload reads as missing
		if (!(await removeTopicImageUpload(editor.topic.id))) {
			return context.json({ error: "not found" }, 404)
		}

		// a fresh render takes the upload's place
		const renderId = await startTopicImageRender({
			topicId: editor.topic.id,
			userId: editor.userId,
			kind: "regenerate",
			model: topicImageRegenerateModel(),
		})
		trackEvent("topic_image_remove", editor.userId, {
			...toAnalyticsProperties(context),
			topicId: editor.topic.id,
			isOwner: editor.topic.ownerId === editor.userId,
		})
		return context.json({ renderId }, 202)
	})

// the image a succeeded render left: its podcast episode's for a podcast episode render, else its topic's
async function loadRenderedImage(render: TopicImageRenderRow): Promise<TopicImageUrls | null> {
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

	// a topic render's image is the topic's current one
	return toTopicImageUrlsOrNull(render.topicId, (await loadTopicImage(render.topicId))?.hash ?? null)
}

// the signed-in editor of the route's topic, or the response that turns the request away
type TopicEditor = { userId: string; topic: { id: string; ownerId: string } } | { response: Response }

// load the route's topic for a signed-in user the edit gate grants. a topic the user may not edit reads as missing
async function loadTopicEditor(context: Context<AppEnv>): Promise<TopicEditor> {
	// a signed-out visitor is turned away before the topic is read
	const userId = currentUser(context)
	if (!userId) {
		return { response: context.json({ error: "unauthorized" }, 401) }
	}

	// the topic, which the edit gate decides
	const topicId = context.req.param("id") ?? ""
	const [topic] = await db.select(namedTopicColumns).from(topics).where(eq(topics.id, topicId))
	if (!topic || !(await isAllowed(userId, "topic:edit", topic))) {
		return { response: context.json({ error: "not found" }, 404) }
	}
	return { userId, topic }
}
