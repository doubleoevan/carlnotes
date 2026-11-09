// the topic image routes: the files, gated by the topic's visibility, the owner's regenerate and its poll, the upload,
// and the removal of an upload

import {
	fromTopicImageFileName,
	MAX_TOPIC_IMAGE_UPLOAD_BYTES,
	regenerateTopicImagePayload,
	type TopicImageRenderResponse,
	toTopicImageUrls,
	toTopicImageUrlsOrNull,
} from "@carlnotes/contracts/topicImages"
import { db } from "@carlnotes/db"
import { topics } from "@carlnotes/db/schema/topics"
import { loadTopicImage } from "@carlnotes/db/topicImages"
import { topicImageRegenerateModel } from "@carlnotes/models/topicImageModel"
import {
	storeTopicImageFiles,
	toTopicImageFileKey,
	toTopicImageOriginal,
	toTopicImageUploadType,
} from "@carlnotes/pipeline/topicImages/topicImageFiles"
import {
	loadTopicImageRender,
	removeTopicImageUpload,
	replaceTopicImage,
	startTopicImageRender,
} from "@carlnotes/pipeline/topicImages/topicImageRenders"
import { trackEvent } from "@carlnotes/server/analytics"
import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { isAllowed } from "../authorization"
import { MULTIPART_ENVELOPE_BYTES, toBodyLimit, uploadSignedOutRejection } from "../bodyLimit"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { toObjectionableCategory, toObjectionableContentResponse, toObjectionableImageCategory } from "../moderation"
import { toolCallerRateLimiter } from "../rateLimit"
import { namedTopicColumns } from "./permissions"
import { serveImageFile } from "./serveImageFile"

// the body limit of an upload, set before parseBody buffers the body: the image limit plus the multipart envelope
const topicImageBodyLimit = toBodyLimit(MAX_TOPIC_IMAGE_UPLOAD_BYTES + MULTIPART_ENVELOPE_BYTES, "too-large")

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
			const objectionableCategory = imagePrompt
				? await toObjectionableCategory({
						text: imagePrompt,
						textKind: "an image prompt",
						subjectKind: "topic image prompt",
						subjectId: editor.topic.id,
					})
				: null
			if (objectionableCategory) {
				return toObjectionableContentResponse(context, objectionableCategory)
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
			image:
				render.status === "succeeded"
					? toTopicImageUrlsOrNull(render.topicId, (await loadTopicImage(render.topicId))?.hash ?? null)
					: null,
		}
		return context.json(renderResponse)
	})
	// the owner's upload: a jpeg, png, or webp, center-cropped and derived in place of the current image
	.post("/topics/:id/image", toolCallerRateLimiter, uploadSignedOutRejection, topicImageBodyLimit, async (context) => {
		// an editor of the topic
		const editor = await loadTopicEditor(context)
		if ("response" in editor) {
			return editor.response
		}

		// the file, checked by its size and by what its bytes decode as
		const uploadedFile = (await context.req.parseBody()).image
		if (!(uploadedFile instanceof File) || uploadedFile.size === 0) {
			return context.json({ error: "unsupported-type" }, 400)
		}
		if (uploadedFile.size > MAX_TOPIC_IMAGE_UPLOAD_BYTES) {
			return context.json({ error: "too-large" }, 413)
		}

		// the bytes decode as a jpeg, a png, or a webp, or the upload is refused
		const uploadedBytes = new Uint8Array(await uploadedFile.arrayBuffer())
		const original = toTopicImageUploadType(uploadedBytes)
			? await toTopicImageOriginal(uploadedBytes).catch(() => null)
			: null
		if (!original) {
			return context.json({ error: "unsupported-type" }, 400)
		}

		// the moderation, on the cropped original the topic will show. an image it cannot read is an unsupported type,
		// and a skipped or failed check lets the upload through
		const objectionableCategory = await toObjectionableImageCategory({
			dataUrl: `data:image/jpeg;base64,${Buffer.from(original.jpegBytes).toString("base64")}`,
			subjectKind: "topic image",
			subjectId: editor.topic.id,
		})
		if (objectionableCategory === "unreadable") {
			return context.json({ error: "unsupported-type" }, 400)
		}
		if (objectionableCategory) {
			return toObjectionableContentResponse(context, objectionableCategory)
		}

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
