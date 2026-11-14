// the film image routes. a film's poster and a chapter's generated image, each gated by the film's topic's visibility,
// and an editor's regenerate and upload of the film's own image

import {
	regenerateTopicImagePayload,
	TOPIC_PODCAST_EPISODE_VIDEO_POSTER_FILE_NAME,
	toTopicPodcastEpisodeVideoPosterUrl,
} from "@carlnotes/contracts/topicImages"
import { db } from "@carlnotes/db"
import { podcastEpisodes, topicPodcastEpisodeVideos } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { attachmentExists } from "@carlnotes/db/store"
import {
	toTopicPodcastEpisodeVideoChapterImageKey,
	toTopicPodcastEpisodeVideoImageKey,
} from "@carlnotes/db/topicPodcastEpisodeVideoKeys"
import { topicImageRegenerateModel } from "@carlnotes/models/topicImageModel"
import { startTopicImageRender } from "@carlnotes/pipeline/topicImages/topicImageRenders"
import {
	storeTopicPodcastEpisodeVideoImage,
	TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_FORMAT,
} from "@carlnotes/pipeline/topicPodcastEpisodeVideo/topicPodcastEpisodeVideoImage"
import { dropUnpublishedUncheckedImage, publishOrSaveUncheckedImage } from "@carlnotes/pipeline/uncheckedImages"
import { trackEvent } from "@carlnotes/server/analytics"
import { zValidator } from "@hono/zod-validator"
import { and, eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
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
import { serveCurrentOrUncheckedImageFile, serveImageFile } from "../topic/serveImageFile"
import { loadPodcastEpisodeEditor, type PodcastEpisodeEditor } from "./podcastEpisodeEditor"

// a chapter's position in a url, a whole number of at most three digits
const CHAPTER_POSITION_PATTERN = /^\d{1,3}$/

// the read of a film's own image hash with its topic's name and gate columns, which a caller filters
// biome-ignore lint/nursery/useExplicitReturnType: the query's type is drizzle's generated builder type
function toTopicPodcastEpisodeVideoTopicQuery() {
	return db
		.select({ imageHash: topicPodcastEpisodeVideos.imageHash, topic: namedTopicColumns })
		.from(topicPodcastEpisodeVideos)
		.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, topicPodcastEpisodeVideos.podcastEpisodeId))
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
}

// the film image routes
export const topicPodcastEpisodeVideoImagesRoute = new Hono<AppEnv>()
	// the poster, at the film's current image hash alone, to anyone who may see its topic
	.get("/topic-podcast-episode-video-images/:podcastEpisodeId/:hash/:file", async (context) => {
		// the file the url names, which is a poster's one file name or nothing
		const { podcastEpisodeId, hash, file } = context.req.param()
		const isPosterFile = file === TOPIC_PODCAST_EPISODE_VIDEO_POSTER_FILE_NAME

		// the film's own image, with its topic
		const [topicPodcastEpisodeVideoTopic] = isPosterFile
			? await toTopicPodcastEpisodeVideoTopicQuery().where(
					eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeId),
				)
			: []

		// an unknown file or an unknown film is not found
		if (!topicPodcastEpisodeVideoTopic) {
			return context.json({ error: "not found" }, 404)
		}

		// the film's current image goes to anyone who may see its topic, and an unchecked upload of the signed-in user
		// goes to them alone. any other hash is not found
		const { topic, imageHash } = topicPodcastEpisodeVideoTopic
		const objectKey = toTopicPodcastEpisodeVideoImageKey(podcastEpisodeId, hash)
		return serveCurrentOrUncheckedImageFile(context, {
			imageFile: { topic, objectKey, contentType: "image/jpeg" },
			hash,
			currentImageHash: imageHash,
			uncheckedImageSubject: { subjectKind: "topicPodcastEpisodeVideoImage", subjectId: podcastEpisodeId },
		})
	})
	// a chapter's generated image, to anyone who may see the topic of its ready film
	.get("/topic-podcast-episode-video-images/:podcastEpisodeId/chapters/:position/image.jpg", async (context) => {
		// the chapter position the url names, which is a whole number
		const { podcastEpisodeId, position } = context.req.param()
		const isChapterPosition = CHAPTER_POSITION_PATTERN.test(position)

		// the topic of the podcast episode's ready film
		const [topicPodcastEpisodeVideoTopic] = isChapterPosition
			? await toTopicPodcastEpisodeVideoTopicQuery().where(
					and(
						eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeId),
						eq(topicPodcastEpisodeVideos.status, "ready"),
					),
				)
			: []

		// an unknown position and a podcast episode with no ready film are not found
		if (!topicPodcastEpisodeVideoTopic) {
			return context.json({ error: "not found" }, 404)
		}

		// the image in the current style, or the first style's for a film not yet rendered again
		const currentStyleKey = toTopicPodcastEpisodeVideoChapterImageKey(podcastEpisodeId, Number(position))
		const firstStyleKey = toTopicPodcastEpisodeVideoChapterImageKey(podcastEpisodeId, Number(position), 1)
		const objectKey = (await attachmentExists(currentStyleKey))
			? currentStyleKey
			: (await attachmentExists(firstStyleKey))
				? firstStyleKey
				: null

		// a chapter with neither image is not found
		if (!objectKey) {
			return context.json({ error: "not found" }, 404)
		}
		return serveImageFile(context, {
			topic: topicPodcastEpisodeVideoTopic.topic,
			objectKey,
			contentType: "image/jpeg",
			isUrlVersioned: false,
		})
	})
	// an editor's regenerate. a fresh render on the better model, from an optional image prompt, within the month's
	// limit that every image regeneration counts against
	.post(
		"/episodes/:id/video/image/regenerate",
		toolCallerRateLimiter,
		zValidator("json", regenerateTopicImagePayload),
		async (context) => {
			// an editor of the film's topic, with regenerations left this month
			const editor = await loadTopicPodcastEpisodeVideoEditor(context)
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
				subjectKind: "film image prompt",
				subjectId: editor.podcastEpisodeId,
			})
			if (imagePromptRejection) {
				return imagePromptRejection
			}

			// the render row, which names the film, and its workflow, in place of an unchecked upload shown to its uploader
			// alone. a published unchecked image stays
			await dropUnpublishedUncheckedImage({
				subjectKind: "topicPodcastEpisodeVideoImage",
				subjectId: editor.podcastEpisodeId,
			})
			const renderId = await startTopicImageRender({
				topicId: editor.topicId,
				topicPodcastEpisodeVideoId: editor.topicPodcastEpisodeVideoId,
				userId: editor.userId,
				kind: "regenerate",
				model: topicImageRegenerateModel(),
				imagePrompt,
			})
			return context.json({ renderId }, 202)
		},
	)
	// an editor's upload: a jpeg, png, or webp, center-cropped to the film's frame in place of the current image
	.post(
		"/episodes/:id/video/image",
		toolCallerRateLimiter,
		uploadSignedOutRejection,
		imageUploadBodyLimit,
		async (context) => {
			// an editor of the film's topic
			const editor = await loadTopicPodcastEpisodeVideoEditor(context)
			if ("response" in editor) {
				return editor.response
			}

			// the file, checked by its size, its type, and the image moderation, and cropped to the film's frame
			const uploadedImage = await readUploadedImageOriginal(context, {
				subjectKind: "film image",
				subjectId: editor.podcastEpisodeId,
				format: TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_FORMAT,
			})
			if ("response" in uploadedImage) {
				return uploadedImage.response
			}

			// the file under its hash, then the row that makes the upload current with the rebuild of the intro and
			// sign-off, or the unchecked image's row that shows the file to its uploader alone and rebuilds nothing
			const { podcastEpisodeId, topicPodcastEpisodeVideoId } = editor
			const imageHash = await storeTopicPodcastEpisodeVideoImage(podcastEpisodeId, uploadedImage.original)
			const uploadedImageOutcome = await publishOrSaveUncheckedImage({
				subjectKind: "topicPodcastEpisodeVideoImage",
				subjectId: podcastEpisodeId,
				uploaderUserId: editor.userId,
				imageHash,
				topicPodcastEpisodeVideoId,
				isUnchecked: uploadedImage.isUnchecked,
			})

			// the upload's event, and the poster url that replaces the current one at once
			trackEvent("topic_image_upload", editor.userId, {
				...toAnalyticsProperties(context),
				topicId: editor.topicId,
				podcastEpisodeId,
				topicPodcastEpisodeVideoId,
				isOwner: editor.topicOwnerId === editor.userId,
			})
			const posterUrl = toTopicPodcastEpisodeVideoPosterUrl(podcastEpisodeId, imageHash)
			return context.json(toImageUploadResponse({ posterUrl }, uploadedImageOutcome === "unchecked"))
		},
	)

// the signed-in editor of the route's podcast episode with its ready film, or the response that turns the request away
type TopicPodcastEpisodeVideoEditor =
	| (Exclude<PodcastEpisodeEditor, { response: Response }> & { topicPodcastEpisodeVideoId: string })
	| { response: Response }

// load the route's podcast episode for a user who may edit its topic, with its ready film. a podcast episode with no
// ready film reads as missing
async function loadTopicPodcastEpisodeVideoEditor(context: Context<AppEnv>): Promise<TopicPodcastEpisodeVideoEditor> {
	// whoever may edit the podcast episode's image may edit its film's
	const editor = await loadPodcastEpisodeEditor(context)
	if ("response" in editor) {
		return editor
	}

	// the podcast episode's ready film
	const [topicPodcastEpisodeVideo] = await db
		.select({ id: topicPodcastEpisodeVideos.id })
		.from(topicPodcastEpisodeVideos)
		.where(
			and(
				eq(topicPodcastEpisodeVideos.podcastEpisodeId, editor.podcastEpisodeId),
				eq(topicPodcastEpisodeVideos.status, "ready"),
			),
		)

	// a film still rendering, failed, or missing has no image to edit
	if (!topicPodcastEpisodeVideo) {
		return { response: context.json({ error: "not found" }, 404) }
	}
	return { ...editor, topicPodcastEpisodeVideoId: topicPodcastEpisodeVideo.id }
}
