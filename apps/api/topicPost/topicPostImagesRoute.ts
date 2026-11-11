// the Topic Post image routes. one file of a Topic Post's image, gated by its topic's visibility, and an editor's
// regenerate and upload

import {
	fromTopicImageFileName,
	regenerateTopicImagePayload,
	toTopicPostImageUrls,
} from "@carlnotes/contracts/topicImages"
import { topicImageRegenerateModel } from "@carlnotes/models/topicImageModel"
import { storeTopicPostImageFiles, toTopicPostImageFileKey } from "@carlnotes/pipeline/topicImages/topicImageFiles"
import { startTopicImageRender } from "@carlnotes/pipeline/topicImages/topicImageRenders"
import { replaceTopicPostImage } from "@carlnotes/pipeline/topicPosts/topicPostImageRenders"
import { trackEvent } from "@carlnotes/server/analytics"
import { zValidator } from "@hono/zod-validator"
import { type Context, Hono } from "hono"
import { isAllowed } from "../authorization"
import { uploadSignedOutRejection } from "../bodyLimit"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { toolCallerRateLimiter } from "../rateLimit"
import { imageUploadBodyLimit, readUploadedImageOriginal, toImagePromptRejection } from "../topic/imageEdits"
import { serveImageFile } from "../topic/serveImageFile"
import { canEditTopicPostImage, loadTopicPostRow, type TopicPostRow } from "./topicPosts"

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

// the Topic Post image routes
export const topicPostImagesRoute = new Hono<AppEnv>()
	// one derived file, at the post's current hash alone, to anyone who may see its topic
	.get("/topic-post-images/:topicPostId/:hash/:file", async (context) => {
		// the file the url names, and the published post at its current hash alone
		const { topicPostId, hash, file } = context.req.param()
		const topicPostRow = fromTopicImageFileName(file) ? await loadTopicPostRow(topicPostId) : null

		// an unknown file, an unknown post, a draft, or a hash that is no longer current is not found
		if (!topicPostRow?.topicPost.publishedAt || topicPostRow.topicPost.imageHash !== hash) {
			return context.json({ error: "not found" }, 404)
		}
		return serveImageFile(context, {
			topic: topicPostRow.topic,
			objectKey: toTopicPostImageFileKey(topicPostId, hash, file),
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

			// the render row and its workflow, which sends the regenerate's event once the image lands
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

			// the files under their hash, then the row that makes the upload current
			const hash = await storeTopicPostImageFiles(topicPost.id, uploadedImage.original)
			await replaceTopicPostImage({
				topicPostId: topicPost.id,
				renderId: null,
				hash,
				origin: "uploaded",
				imagePrompt: null,
				costDollars: 0,
			})

			// the upload's event by its ids, and the urls that replace the current ones at once
			trackEvent("social_topic_post_image_upload", editor.userId, {
				...toAnalyticsProperties(context),
				objectId: topicPost.id,
				topicId: topic.id,
				isOwner: topic.ownerId === editor.userId,
			})
			return context.json({ image: toTopicPostImageUrls(topicPost.id, hash) })
		},
	)
