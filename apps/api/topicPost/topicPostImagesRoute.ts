// the Topic Post image routes. one file of a Topic Post's image, gated by its topic's visibility, and an editor's
// regenerate and upload. one file of a body image, gated by the post's reader or a read signature, and its author's
// upload

import { MAX_TOPIC_POST_BODY_IMAGE_BYTES } from "@carlnotes/contracts/plans"
import {
	fromTopicImageFileName,
	regenerateTopicImagePayload,
	toTopicPostImageUrls,
} from "@carlnotes/contracts/topicImages"
import { fromTopicPostBodyImagePath, TOPIC_POST_BODY_IMAGES_PATH } from "@carlnotes/contracts/topicPostBodyImages"
import { loadTopicPostBodyImageLimits } from "@carlnotes/db/quotas"
import { topicImageRegenerateModel } from "@carlnotes/models/topicImageModel"
import { storeTopicPostImageFiles, toTopicPostImageFileKey } from "@carlnotes/pipeline/topicImages/topicImageFiles"
import { startTopicImageRender } from "@carlnotes/pipeline/topicImages/topicImageRenders"
import {
	storeTopicPostBodyImage,
	type TopicPostBodyImage,
	toTopicPostBodyImage,
	toTopicPostBodyImageFileKey,
} from "@carlnotes/pipeline/topicPosts/topicPostBodyImageFiles"
import { dropUnpublishedUncheckedImage, publishOrSaveUncheckedImage } from "@carlnotes/pipeline/uncheckedImages"
import { trackEvent } from "@carlnotes/server/analytics"
import { zValidator } from "@hono/zod-validator"
import { type Context, Hono } from "hono"
import { isAllowed } from "../authorization"
import { MULTIPART_ENVELOPE_BYTES, toBodyLimit, uploadSignedOutRejection } from "../bodyLimit"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { toObjectionableContentResponse, toStrictImageModeration } from "../moderation"
import { toolCallerRateLimiter, topicPostBodyImageRateLimiter } from "../rateLimit"
import { toTermsOutdatedResponse } from "../termsAcceptance"
import {
	imageUploadBodyLimit,
	readUploadedImageOriginal,
	toImagePromptRejection,
	toImageUploadResponse,
} from "../topic/imageEdits"
import { serveCurrentOrUncheckedImageFile, serveImageFile } from "../topic/serveImageFile"
import {
	isTopicPostPublic,
	isValidTopicPostBodyImageSignature,
	loadTopicPostBodyImageCount,
	toUploadedTopicPostBodyImageUrl,
} from "./topicPostBodyImages"
import {
	canEditTopicPostImage,
	canReadTopicPost,
	loadAuthoredTopicPost,
	loadTopicPostBodyImageAccessRow,
	loadTopicPostRow,
	type TopicPostBodyImageAccessRow,
	type TopicPostRow,
} from "./topicPosts"

// the path of a body image upload, after the /api base, with a body limit of its own
export const TOPIC_POST_BODY_IMAGE_UPLOAD_PATH = "/topic-posts/:id/body-images"

// the body image upload's limit, set before parseBody buffers the body: the largest plan's file plus the multipart
// envelope. the uploader's own plan is checked after
const topicPostBodyImageBodyLimit = toBodyLimit(MAX_TOPIC_POST_BODY_IMAGE_BYTES + MULTIPART_ENVELOPE_BYTES, "too-large")

// the signed-in editor of the route's Topic Post image with the post, or the response that turns the request away
type TopicPostImageEditor = { userId: string; topicPostRow: TopicPostRow } | { response: Response }

// load the route's published Topic Post for a signed-in user who may change its image: its author, or an editor of
// its topic, while they may still open the topic. a draft, and a post the user may not change, read as missing
async function loadTopicPostImageEditor(context: Context<AppEnv>): Promise<TopicPostImageEditor> {
	// a signed-out visitor is turned away before the post is read
	const userId = currentUser(context)
	if (!userId) {
		return { response: context.json({ error: "unauthorized" }, 401) }
	}

	// the published post, for whoever may change its image
	const topicPostRow = await loadTopicPostRow(context.req.param("id") ?? "")
	if (!topicPostRow?.topicPost.publishedAt || !(await canEditTopicPostImage(userId, topicPostRow))) {
		return { response: context.json({ error: "not found" }, 404) }
	}
	return { userId, topicPostRow }
}

// whether a request may read a body image's file. a saved image goes to the post's readers and to a valid read
// signature. an image the body does not name, an upload not yet saved, goes to the post's author and to a valid read
// signature
async function canReadTopicPostBodyImage(
	context: Context<AppEnv>,
	{ accessRow, path }: { accessRow: TopicPostBodyImageAccessRow; path: string },
): Promise<boolean> {
	// a valid signature reads either
	if (
		isValidTopicPostBodyImageSignature({
			path,
			expires: context.req.query("expires"),
			signature: context.req.query("signature"),
		})
	) {
		return true
	}

	// a saved image follows the post, and an unsaved one is its author's
	const userId = currentUser(context)
	if (!accessRow.isImageSaved) {
		return userId !== null && accessRow.topicPost.authorUserId === userId
	}
	return isTopicPostPublic(accessRow) || canReadTopicPost(userId, accessRow)
}

// the uploader and the post an upload goes to
type ReadTopicPostBodyImageUploadOptions = { userId: string; topicPostRow: TopicPostRow }

// read the request's body image upload, or the response that rejects it: past the plan's file size, past the post's
// count of images, not an image by its bytes, past the pixel limit, abandoned, objectionable, or unchecked by the
// moderation
async function readTopicPostBodyImageUpload(
	context: Context<AppEnv>,
	{ userId, topicPostRow }: ReadTopicPostBodyImageUploadOptions,
): Promise<{ bodyImage: TopicPostBodyImage } | { response: Response }> {
	// the uploaded file
	const uploadedFile = (await context.req.parseBody()).image
	if (!(uploadedFile instanceof File) || uploadedFile.size === 0) {
		return { response: context.json({ error: "unsupported-type" }, 400) }
	}

	// the plan's file size and count of images
	const bodyImageLimits = await loadTopicPostBodyImageLimits(userId)
	if (uploadedFile.size > bodyImageLimits.imageBytes) {
		return { response: context.json({ error: "too-large" }, 413) }
	}
	if ((await loadTopicPostBodyImageCount(topicPostRow)) >= bodyImageLimits.imageLimit) {
		return { response: context.json({ error: "image-limit-reached" }, 422) }
	}

	// the files, decoded within the pixel limit and re-encoded
	const bodyImage = await toTopicPostBodyImage(new Uint8Array(await uploadedFile.arrayBuffer()))
	if ("rejection" in bodyImage) {
		const status = bodyImage.rejection === "too-large" ? 413 : 400
		return { response: context.json({ error: bodyImage.rejection }, status) }
	}

	// an upload its author abandoned while it encoded is neither classified nor stored
	if (context.req.raw.signal.aborted) {
		return { response: context.json({ error: "aborted" }, 400) }
	}

	// the moderation of its frames, which lets nothing through that it could not check
	const imageModeration = await toStrictImageModeration({
		frameJpegs: bodyImage.moderationJpegs,
		subjectKind: "topic post body image",
		subjectId: topicPostRow.topicPost.id,
	})

	// a flagged image is rejected with its category
	if (imageModeration.outcome === "objectionable") {
		return { response: toObjectionableContentResponse(context, imageModeration.category) }
	}

	// an image the moderation could not read, or could not check, is rejected too
	if (imageModeration.outcome === "unreadable") {
		return { response: context.json({ error: "unreadable" }, 400) }
	}
	if (imageModeration.outcome === "unavailable") {
		return { response: context.json({ error: "moderation-unavailable" }, 503) }
	}

	// a clean image is ready to store
	return { bodyImage }
}

// the Topic Post image routes
export const topicPostImagesRoute = new Hono<AppEnv>()
	// one file of a body image, to whoever may read it
	.get("/topic-post-body-images/:topicPostId/:imageId/:file", async (context) => {
		// a path that names no body image file, and a post that does not exist, are not found
		const { topicPostId, imageId, file } = context.req.param()
		const path = `${TOPIC_POST_BODY_IMAGES_PATH}/${topicPostId}/${imageId}/${file}`
		const bodyImagePath = fromTopicPostBodyImagePath(path)
		const accessRow = bodyImagePath ? await loadTopicPostBodyImageAccessRow(topicPostId, imageId) : null
		if (!bodyImagePath || !accessRow) {
			return context.json({ error: "not found" }, 404)
		}

		// an image the caller may not read is not found either
		if (!(await canReadTopicPostBodyImage(context, { accessRow, path }))) {
			return context.json({ error: "not found" }, 404)
		}

		// the edge caches a public post's saved image alone. every other read stays in the browser
		const isEdgeCached = isTopicPostPublic(accessRow) && accessRow.isImageSaved
		return serveImageFile(context, {
			topic: accessRow.topic,
			objectKey: toTopicPostBodyImageFileKey(topicPostId, imageId, bodyImagePath.file),
			checkedReadAccess: isEdgeCached ? "public" : "private",
		})
	})
	// an author's body image upload: a jpeg, png, webp, or gif, judged by its bytes, re-encoded, and moderated, failing
	// closed. it is stored as pending deletion until a save names it
	.post(
		TOPIC_POST_BODY_IMAGE_UPLOAD_PATH,
		topicPostBodyImageRateLimiter,
		uploadSignedOutRejection,
		topicPostBodyImageBodyLimit,
		async (context) => {
			// the post's author
			const userId = currentUser(context)
			const topicPostRow = await loadAuthoredTopicPost(userId, context.req.param("id"))
			if (!userId || !topicPostRow) {
				return context.json({ error: "not found" }, 404)
			}
			// a write waits on the current Terms
			const termsOutdatedResponse = toTermsOutdatedResponse(context)
			if (termsOutdatedResponse) {
				return termsOutdatedResponse
			}

			// the upload, checked and re-encoded
			const { topicPost } = topicPostRow
			const uploadedImage = await readTopicPostBodyImageUpload(context, { userId, topicPostRow })
			if ("response" in uploadedImage) {
				return uploadedImage.response
			}

			// an upload abandoned while it was classified is not stored
			if (context.req.raw.signal.aborted) {
				return context.json({ error: "aborted" }, 400)
			}

			// the files under a new image id, and the url the editor inserts
			const imageId = crypto.randomUUID()
			await storeTopicPostBodyImage({ topicPostId: topicPost.id, imageId, files: uploadedImage.bodyImage.files })
			return context.json({
				url: toUploadedTopicPostBodyImageUrl(topicPostRow, imageId),
				width: uploadedImage.bodyImage.width,
				height: uploadedImage.bodyImage.height,
			})
		},
	)
	// one derived file, at the post's current hash alone, to anyone who may see its topic
	.get("/topic-post-images/:topicPostId/:hash/:file", async (context) => {
		// the file the url names, and the published post at its current hash alone
		const { topicPostId, hash, file } = context.req.param()
		const topicPostRow = fromTopicImageFileName(file) ? await loadTopicPostRow(topicPostId) : null

		// an unknown file, an unknown post, or a draft is not found
		if (!topicPostRow?.topicPost.publishedAt) {
			return context.json({ error: "not found" }, 404)
		}

		// the post's current image goes to anyone who may see its topic, and an unchecked upload of the signed-in user goes
		// to them alone. any other hash is not found
		const { topic, topicPost } = topicPostRow
		return serveCurrentOrUncheckedImageFile(context, {
			imageFile: { topic, objectKey: toTopicPostImageFileKey(topicPostId, hash, file) },
			hash,
			currentImageHash: topicPost.imageHash,
			uncheckedImageSubject: { subjectKind: "topicPostImage", subjectId: topicPostId },
		})
	})
	// an editor's regenerate. a fresh render on the better model, from an optional image prompt, within the month's
	// limit, which counts a person's Topic and Topic Post regenerations together
	.post(
		"/topic-posts/:id/image/regenerate",
		toolCallerRateLimiter,
		zValidator("json", regenerateTopicImagePayload),
		async (context) => {
			// whoever may change the post's image, with regenerations left this month
			const editor = await loadTopicPostImageEditor(context)
			if ("response" in editor) {
				return editor.response
			}
			if (!(await isAllowed(editor.userId, "topicImage:regenerate"))) {
				return context.json({ error: "regeneration limit reached" }, 429)
			}

			// the image prompt passes the moderation before it reaches the image model
			const { topicPost, topic } = editor.topicPostRow
			const { imagePrompt } = context.req.valid("json")
			const imagePromptRejection = await toImagePromptRejection(context, {
				imagePrompt,
				subjectKind: "topic post image prompt",
				subjectId: topicPost.id,
			})
			if (imagePromptRejection) {
				return imagePromptRejection
			}

			// the render row and its workflow, which sends the regenerate's event once the image is drawn, in place of an
			// unchecked upload shown to its uploader alone. a published unchecked image stays
			await dropUnpublishedUncheckedImage({ subjectKind: "topicPostImage", subjectId: topicPost.id })
			const renderId = await startTopicImageRender({
				topicId: topic.id,
				topicPostId: topicPost.id,
				userId: editor.userId,
				kind: "regenerate",
				model: topicImageRegenerateModel(),
				imagePrompt,
			})
			return context.json({ renderId }, 202)
		},
	)
	// an editor's upload: a jpeg, png, or webp, center-cropped and derived in place of the current image. an upload
	// counts toward no limit
	.post(
		"/topic-posts/:id/image",
		toolCallerRateLimiter,
		uploadSignedOutRejection,
		imageUploadBodyLimit,
		async (context) => {
			// whoever may change the post's image
			const editor = await loadTopicPostImageEditor(context)
			if ("response" in editor) {
				return editor.response
			}

			// the file, checked by its size, its type, and the image moderation
			const { topicPost, topic } = editor.topicPostRow
			const uploadedImage = await readUploadedImageOriginal(context, {
				subjectKind: "topic post image",
				subjectId: topicPost.id,
			})
			if ("response" in uploadedImage) {
				return uploadedImage.response
			}

			// the files under their hash, then the row that makes the upload current, or the unchecked image's row that shows
			// it to its uploader alone
			const topicPostId = topicPost.id
			const hash = await storeTopicPostImageFiles(topicPostId, uploadedImage.original)
			const uploadedImageOutcome = await publishOrSaveUncheckedImage({
				subjectKind: "topicPostImage",
				subjectId: topicPostId,
				uploaderUserId: editor.userId,
				imageHash: hash,
				isUnchecked: uploadedImage.isUnchecked,
			})

			// the upload's event by its ids, and the urls that replace the current ones at once
			trackEvent("social_topic_post_image_upload", editor.userId, {
				...toAnalyticsProperties(context),
				objectId: topicPostId,
				topicId: topic.id,
				isOwner: topic.ownerId === editor.userId,
			})
			const image = toTopicPostImageUrls(topicPostId, hash)
			return context.json(toImageUploadResponse({ image }, uploadedImageOutcome === "unchecked"))
		},
	)
