// the podcast episode image routes: one file of an episode's own image, gated by its topic's visibility, and an
// editor's regenerate, upload, and removal of an upload

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
	removePodcastEpisodeImageUpload,
	replacePodcastEpisodeImage,
} from "@carlnotes/pipeline/podcast/podcastEpisodeImageRenders"
import {
	storePodcastEpisodeImageFiles,
	toPodcastEpisodeImageFileKey,
} from "@carlnotes/pipeline/topicImages/topicImageFiles"
import { startTopicImageRender } from "@carlnotes/pipeline/topicImages/topicImageRenders"
import { trackEvent } from "@carlnotes/server/analytics"
import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { isAllowed } from "../authorization"
import { uploadSignedOutRejection } from "../bodyLimit"
import { type AppEnv, toAnalyticsProperties } from "../currentUser"
import { toolCallerRateLimiter } from "../rateLimit"
import { imageUploadBodyLimit, readUploadedImageOriginal, toImagePromptRejection } from "../topic/imageEdits"
import { namedTopicColumns } from "../topic/permissions"
import { serveImageFile } from "../topic/serveImageFile"
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

		// an unknown file, an unknown episode, or a hash that is no longer current is not found
		if (!podcastEpisodeTopic || podcastEpisodeTopic.imageHash !== hash) {
			return context.json({ error: "not found" }, 404)
		}
		return serveImageFile(context, {
			topic: podcastEpisodeTopic.topic,
			objectKey: toPodcastEpisodeImageFileKey(podcastEpisodeId, hash, file),
		})
	})
	// an editor's regenerate: a fresh render on the better model, from an optional image prompt, within the month's limit
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

			// the render row and its workflow
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

			// the files under their hash, then the row that makes the upload current
			const hash = await storePodcastEpisodeImageFiles(editor.podcastEpisodeId, uploadedImage.original)
			await replacePodcastEpisodeImage({
				podcastEpisodeId: editor.podcastEpisodeId,
				renderId: null,
				hash,
				origin: "uploaded",
				imagePrompt: null,
				costDollars: 0,
			})

			// the upload's event, and the urls that replace the current ones at once
			trackEvent("topic_image_upload", editor.userId, {
				...toAnalyticsProperties(context),
				topicId: editor.topicId,
				podcastEpisodeId: editor.podcastEpisodeId,
				isOwner: editor.topicOwnerId === editor.userId,
			})
			return context.json({ image: toPodcastEpisodeImageUrls(editor.podcastEpisodeId, hash) })
		},
	)
	// the removal of an upload: its files go, and a fresh render starts on the editor's budget. the render counts as
	// one of the month's regenerations
	.delete("/episodes/:id/image", toolCallerRateLimiter, async (context) => {
		// an editor of the podcast episode's topic with a regeneration left, whose current image is an upload
		const editor = await loadPodcastEpisodeEditor(context)
		if ("response" in editor) {
			return editor.response
		}
		if (!(await isAllowed(editor.userId, "topicImage:regenerate"))) {
			return context.json({ error: "regeneration limit reached" }, 429)
		}

		// the upload and its files go. a current image that is not an upload reads as missing
		if (!(await removePodcastEpisodeImageUpload(editor.podcastEpisodeId))) {
			return context.json({ error: "not found" }, 404)
		}

		// a fresh render takes the upload's place
		const renderId = await startTopicImageRender({
			topicId: editor.topicId,
			podcastEpisodeId: editor.podcastEpisodeId,
			userId: editor.userId,
			kind: "regenerate",
			model: topicImageRegenerateModel(),
		})

		// the removal's event, and the render to poll
		trackEvent("topic_image_remove", editor.userId, {
			...toAnalyticsProperties(context),
			topicId: editor.topicId,
			podcastEpisodeId: editor.podcastEpisodeId,
			isOwner: editor.topicOwnerId === editor.userId,
		})
		return context.json({ renderId }, 202)
	})
