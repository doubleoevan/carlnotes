// the podcast episode image routes. one file of a podcast episode's own image, gated by its topic's visibility, and
// an editor's regenerate and upload

import {
	fromTopicImageFileName,
	regenerateTopicImagePayload,
	toPodcastEpisodeImageUrls,
} from "@carlnotes/contracts/topicImages"
import { db } from "@carlnotes/db"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { topicImageRegenerateModel } from "@carlnotes/models/topicImageModel"
import {
	storePodcastEpisodeImageFiles,
	toPodcastEpisodeImageFileKey,
} from "@carlnotes/pipeline/topicImages/topicImageFiles"
import { startTopicImageRender } from "@carlnotes/pipeline/topicImages/topicImageRenders"
import { dropUnpublishedUncheckedImage, publishOrSaveUncheckedImage } from "@carlnotes/pipeline/uncheckedImages"
import { trackEvent } from "@carlnotes/server/analytics"
import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { isAllowed } from "../authorization"
import { uploadSignedOutRejection } from "../bodyLimit"
import { type AppEnv, toAnalyticsProperties } from "../currentUser"
import { toolCallerRateLimiter } from "../rateLimit"
import {
	imageUploadBodyLimit,
	readUploadedImageOriginal,
	toImagePromptRejection,
	toImageUploadResponse,
} from "../topic/imageEdits"
import { namedTopicColumns } from "../topic/permissions"
import { serveCurrentOrUncheckedImageFile } from "../topic/serveImageFile"
import { loadPodcastEpisodeEditor } from "./podcastEpisodeEditor"

// the podcast episode image routes
export const podcastEpisodeImagesRoute = new Hono<AppEnv>()
	// one derived file, at the podcast episode's current hash alone, to anyone who may see its topic
	.get("/podcast-episode-images/:podcastEpisodeId/:hash/:file", async (context) => {
		// the file the url names
		const { podcastEpisodeId, hash, file } = context.req.param()
		const derivedFile = fromTopicImageFileName(file)

		// the podcast episode at its current hash alone, with its topic
		const [podcastEpisodeTopic] = derivedFile
			? await db
					.select({ imageHash: podcastEpisodes.imageHash, topic: namedTopicColumns })
					.from(podcastEpisodes)
					.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
					.where(eq(podcastEpisodes.id, podcastEpisodeId))
			: []

		// an unknown file or an unknown podcast episode is not found
		if (!podcastEpisodeTopic) {
			return context.json({ error: "not found" }, 404)
		}

		// the podcast episode's current image goes to anyone who may see its topic, and an unchecked upload of the
		// signed-in user goes to them alone. any other hash is not found
		const { topic, imageHash } = podcastEpisodeTopic
		return serveCurrentOrUncheckedImageFile(context, {
			imageFile: { topic, objectKey: toPodcastEpisodeImageFileKey(podcastEpisodeId, hash, file) },
			hash,
			currentImageHash: imageHash,
			uncheckedImageSubject: { subjectKind: "podcastEpisodeImage", subjectId: podcastEpisodeId },
		})
	})
	// an editor's regenerate. a fresh render on the better model, from an optional image prompt, within the month's limit
	.post(
		"/episodes/:id/image/regenerate",
		toolCallerRateLimiter,
		zValidator("json", regenerateTopicImagePayload),
		async (context) => {
			// an editor of the podcast episode's topic, with regenerations left this month
			const editor = await loadPodcastEpisodeEditor(context)
			if ("response" in editor) {
				return editor.response
			}
			if (!(await isAllowed(editor.userId, "topicImage:regenerate"))) {
				return context.json({ error: "regeneration limit reached" }, 429)
			}

			// the image prompt passes the moderation before it reaches the image model
			const { imagePrompt } = context.req.valid("json")
			const imagePromptRejection = await toImagePromptRejection(context, {
				imagePrompt,
				subjectKind: "podcast episode image prompt",
				subjectId: editor.podcastEpisodeId,
			})
			if (imagePromptRejection) {
				return imagePromptRejection
			}

			// the render row and its workflow, in place of an unchecked upload shown to its uploader alone. a published
			// unchecked image stays
			await dropUnpublishedUncheckedImage({ subjectKind: "podcastEpisodeImage", subjectId: editor.podcastEpisodeId })
			const renderId = await startTopicImageRender({
				topicId: editor.topicId,
				podcastEpisodeId: editor.podcastEpisodeId,
				userId: editor.userId,
				kind: "regenerate",
				model: topicImageRegenerateModel(),
				imagePrompt,
			})
			return context.json({ renderId }, 202)
		},
	)
	// an editor's upload: a jpeg, png, or webp, center-cropped and derived in place of the current image
	.post(
		"/episodes/:id/image",
		toolCallerRateLimiter,
		uploadSignedOutRejection,
		imageUploadBodyLimit,
		async (context) => {
			// an editor of the podcast episode's topic
			const editor = await loadPodcastEpisodeEditor(context)
			if ("response" in editor) {
				return editor.response
			}

			// the file, checked by its size, its type, and the image moderation
			const uploadedImage = await readUploadedImageOriginal(context, {
				subjectKind: "podcast episode image",
				subjectId: editor.podcastEpisodeId,
			})
			if ("response" in uploadedImage) {
				return uploadedImage.response
			}

			// the files under their hash, then the row that makes the upload current, or the unchecked image's row that shows
			// it to its uploader alone
			const { podcastEpisodeId } = editor
			const hash = await storePodcastEpisodeImageFiles(podcastEpisodeId, uploadedImage.original)
			const uploadedImageOutcome = await publishOrSaveUncheckedImage({
				subjectKind: "podcastEpisodeImage",
				subjectId: podcastEpisodeId,
				uploaderUserId: editor.userId,
				imageHash: hash,
				isUnchecked: uploadedImage.isUnchecked,
			})

			// the upload's event, and the urls that replace the current ones at once
			trackEvent("topic_image_upload", editor.userId, {
				...toAnalyticsProperties(context),
				topicId: editor.topicId,
				podcastEpisodeId,
				isOwner: editor.topicOwnerId === editor.userId,
			})
			const image = toPodcastEpisodeImageUrls(podcastEpisodeId, hash)
			return context.json(toImageUploadResponse({ image }, uploadedImageOutcome === "unchecked"))
		},
	)
