// a film's own image: a wide scene drawn in the film house style and stored beside the film's parts, at the film's
// size for the poster and as a larger original that the intro and the sign-off zoom into. they show it in place of the
// podcast episode's image

import type { TopicImageOrigin } from "@carlnotes/contracts/enums"
import { db } from "@carlnotes/db"
import { podcastEpisodes, topicPodcastEpisodeVideos } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { deleteStoredObjects, uploadAttachment } from "@carlnotes/db/store"
import {
	toTopicPodcastEpisodeVideoImageKey,
	toTopicPodcastEpisodeVideoImageLargeOriginalKey,
} from "@carlnotes/db/topicPodcastEpisodeVideoKeys"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { topicImageCostDollars, topicImageRegenerateModel } from "@carlnotes/models/topicImageModel"
import { reportError } from "@carlnotes/server/monitoring"
import { runWithRetries } from "@carlnotes/server/retry"
import { and, eq, isNull, sql } from "drizzle-orm"
import { loadPodcastEpisodeImageSceneInput, purgePublicImageFiles } from "../podcast/podcastEpisodeImageRenders"
import { startTopicPodcastEpisodeVideoRebuild } from "../temporalClient"
import { renderTopicImageOriginal, TopicImageRenderFailure } from "../topicImages/renderTopicImageOriginal"
import { type TopicImageFormat, type TopicImageOriginal, toTopicImageHash } from "../topicImages/topicImageFiles"
import { recordReplacedImageDeletions, succeedTopicImageRender } from "../topicImages/topicImageRenders"
import { type TopicImageSceneInput, writeTopicImageScene } from "../topicImages/writeTopicImageScene"
import { VIDEO_HEIGHT, VIDEO_WIDTH } from "./videoFrames"

// the format of a chapter's generated image: the film house style, drawn wide, at the film's frame size
export const GENERATED_CHAPTER_IMAGE_FORMAT: TopicImageFormat = {
	stylePromptName: "topic-podcast-episode-video-image-style",
	aspectRatio: "16:9",
	width: VIDEO_WIDTH,
	height: VIDEO_HEIGHT,
}

// the format of a film's own image: the same, drawn at the 2K size, with the larger original kept for the zoom of the
// intro and the sign-off
export const TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_FORMAT: TopicImageFormat = {
	...GENERATED_CHAPTER_IMAGE_FORMAT,
	drawSize: "2K",
	largeOriginalWidth: 2752,
	largeOriginalHeight: 1536,
}

// the framing a film image's scene takes, which keeps the lower third clear for the title
export const TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_FRAMING =
	"a wide establishing shot, with the focal subject in the upper two thirds and open ground, water, or shadow along the bottom"

// a draw gets two attempts, ten seconds apart
const DRAW_ATTEMPTS = 2
const DRAW_RETRY_DELAY_MS = 10 * 1000

// the podcast episode whose film gets its image, and whether the platform pays for it, as the backfill does
type DrawTopicPodcastEpisodeVideoImageOptions = { podcastEpisodeId: string; isPlatformBilled?: boolean }

/**
 * Draws and stores the image of a podcast episode's film, unless the film already has one, and adds its cost to the
 * film row unless the platform pays. Returns the image's hash, or null if nothing was drawn. A failed draw throws an
 * error.
 */
export async function drawTopicPodcastEpisodeVideoImage({
	podcastEpisodeId,
	isPlatformBilled = false,
}: DrawTopicPodcastEpisodeVideoImageOptions): Promise<string | null> {
	// the film's image and its podcast episode's owner
	const [topicPodcastEpisodeVideo] = await db
		.select({ imageHash: topicPodcastEpisodeVideos.imageHash, ownerId: podcastEpisodes.ownerId })
		.from(topicPodcastEpisodeVideos)
		.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, topicPodcastEpisodeVideos.podcastEpisodeId))
		.where(eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeId))

	// a film that has an image, or a podcast episode with no title, has nothing to draw
	const isDrawn = Boolean(topicPodcastEpisodeVideo?.imageHash)
	const sceneInput = isDrawn ? null : await loadPodcastEpisodeImageSceneInput(podcastEpisodeId)
	if (!topicPodcastEpisodeVideo || !sceneInput) {
		return null
	}

	// the original from a scene of the podcast episode's own words, on the owner's key or the master key for the
	// platform, on the model that draws at the film image's size
	const litellmApiKey = isPlatformBilled
		? undefined
		: await loadOrProvisionUserLiteLLMKey(topicPodcastEpisodeVideo.ownerId)
	const model = topicImageRegenerateModel()
	const original = await drawTopicPodcastEpisodeVideoImageOriginal({ sceneInput, model, litellmApiKey })

	// the files, then the image's hash on the film row with the cost. a film that got its image meanwhile keeps it
	const imageHash = await storeTopicPodcastEpisodeVideoImage(podcastEpisodeId, original)
	const { drawSize } = TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_FORMAT
	const imageCostDollars = isPlatformBilled ? 0 : topicImageCostDollars(model, drawSize)
	const updatedRows = await db
		.update(topicPodcastEpisodeVideos)
		.set({
			imageHash,
			imageOrigin: "generated",
			cost: sql`${topicPodcastEpisodeVideos.cost} + ${imageCostDollars.toFixed(6)}`,
		})
		.where(
			and(
				eq(topicPodcastEpisodeVideos.podcastEpisodeId, podcastEpisodeId),
				isNull(topicPodcastEpisodeVideos.imageHash),
			),
		)
		.returning({ id: topicPodcastEpisodeVideos.id })

	// no row changed, so this draw's files go
	if (updatedRows.length === 0) {
		await deleteStoredObjects(toImageObjectKeys(podcastEpisodeId, imageHash))
		return null
	}
	return imageHash
}

// what one draw reads: the scene's words, the framing its scene takes, which is the film image's if none is given, the
// format, which is the film image's if none is given, the model, and the key it bills, or the master key if no key is
// given
type DrawImageOriginalOptions = {
	sceneInput: TopicImageSceneInput
	framing?: string
	format?: TopicImageFormat
	model: string
	litellmApiKey?: string
}

/**
 * Draws an image in the film house style in a format, from a scene written in a framing over the given words. A spent
 * budget and a rejection are final, and anything else gets a second attempt before it throws.
 */
export function drawTopicPodcastEpisodeVideoImageOriginal(
	drawImageOriginalOptions: DrawImageOriginalOptions,
): Promise<TopicImageOriginal> {
	return runWithRetries({
		attempts: DRAW_ATTEMPTS,
		delayMs: DRAW_RETRY_DELAY_MS,
		runAttempt: () => drawImageOriginal(drawImageOriginalOptions),
		isRetryable: (error) => !(error instanceof TopicImageRenderFailure) || error.outcome === "retryable",
	})
}

// write the scene in the framing, and draw it in the film house style in the format
async function drawImageOriginal({
	sceneInput,
	framing = TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_FRAMING,
	format = TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_FORMAT,
	model,
	litellmApiKey,
}: DrawImageOriginalOptions): Promise<TopicImageOriginal> {
	const scene = await writeTopicImageScene({ ...sceneInput, framing, litellmApiKey })
	return renderTopicImageOriginal({ scene, isHouseStyle: true, model, format, litellmApiKey })
}

/**
 * Returns what a film image's scene is written from: its podcast episode's title, description, topic tags, and first
 * chapter titles, in the film's framing. Returns null for a film that is gone or a podcast episode with no title.
 */
export async function loadTopicPodcastEpisodeVideoImageSceneInput(
	topicPodcastEpisodeVideoId: string,
): Promise<TopicImageSceneInput | null> {
	const podcastEpisodeId = await loadTopicPodcastEpisodeVideoPodcastEpisodeId(topicPodcastEpisodeVideoId)
	const sceneInput = podcastEpisodeId ? await loadPodcastEpisodeImageSceneInput(podcastEpisodeId) : null
	return sceneInput && { ...sceneInput, framing: TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_FRAMING }
}

// a new image for a film: the film, the original, the render that drew it or null for an upload, its origin, the
// editor's image prompt, and what the render cost
export type ReplaceTopicPodcastEpisodeVideoImageOptions = {
	topicPodcastEpisodeVideoId: string
	original: TopicImageOriginal
	renderId: string | null
	origin: TopicImageOrigin
	imagePrompt: string | null
	costDollars: number
}

/**
 * Stores an original as a film's own image, makes it the film's current one, schedules the replaced image for deletion
 * after a grace, closes the render row as succeeded with its cost, and starts the rebuild of the film's intro and
 * sign-off. Returns the image's hash, or null for a film that is gone.
 */
export async function replaceTopicPodcastEpisodeVideoImage({
	topicPodcastEpisodeVideoId,
	original,
	renderId,
	origin,
	imagePrompt,
	costDollars,
}: ReplaceTopicPodcastEpisodeVideoImageOptions): Promise<string | null> {
	// the film's podcast episode, which names the image's key
	const podcastEpisodeId = await loadTopicPodcastEpisodeVideoPodcastEpisodeId(topicPodcastEpisodeVideoId)
	if (!podcastEpisodeId) {
		return null
	}

	// the file under its hash, then the row that makes it current
	const imageHash = await storeTopicPodcastEpisodeVideoImage(podcastEpisodeId, original)
	const replacedImage = await db.transaction(async (transaction) => {
		// the image this one replaces, and the topic whose visibility decides the edge purge
		const [topicPodcastEpisodeVideo] = await transaction
			.select({ previousHash: topicPodcastEpisodeVideos.imageHash, topicId: topics.id, visibility: topics.visibility })
			.from(topicPodcastEpisodeVideos)
			.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, topicPodcastEpisodeVideos.podcastEpisodeId))
			.leftJoin(topics, eq(topics.id, podcastEpisodes.topicId))
			.where(eq(topicPodcastEpisodeVideos.id, topicPodcastEpisodeVideoId))
			.for("no key update", { of: topicPodcastEpisodeVideos })

		// the new image is the current one
		await transaction
			.update(topicPodcastEpisodeVideos)
			.set({ imageHash, imageOrigin: origin, imagePrompt })
			.where(eq(topicPodcastEpisodeVideos.id, topicPodcastEpisodeVideoId))

		// the replaced image goes after the grace, unless the same bytes came back under the same hash
		if (topicPodcastEpisodeVideo?.previousHash && topicPodcastEpisodeVideo.previousHash !== imageHash) {
			const replacedImageKeys = toImageObjectKeys(podcastEpisodeId, topicPodcastEpisodeVideo.previousHash)
			await recordReplacedImageDeletions(transaction, replacedImageKeys)
		}

		// the render that drew it is done
		await succeedTopicImageRender({ transaction, renderId, costDollars })
		return topicPodcastEpisodeVideo
	})

	// a public topic's replaced image leaves the edge
	if (replacedImage?.previousHash && replacedImage.previousHash !== imageHash) {
		await purgePublicImageFiles(replacedImage)
	}

	// the intro and the sign-off are drawn again from the new image. a failed start is reported, and the next play
	// starts the rebuild
	await startTopicPodcastEpisodeVideoRebuild(podcastEpisodeId).catch((error: unknown) => {
		reportError(error, "topic-podcast-episode-video", { podcastEpisodeId, step: "rebuild" })
	})
	return imageHash
}

// store a film image's jpeg at the film's size under its content hash, with its larger original beside it if it has
// one, and return the hash
async function storeTopicPodcastEpisodeVideoImage(
	podcastEpisodeId: string,
	original: TopicImageOriginal,
): Promise<string> {
	// the jpeg the poster shows, which names the image
	const imageHash = toTopicImageHash(original.jpegBytes)
	const [imageKey, imageOriginalKey] = toImageObjectKeys(podcastEpisodeId, imageHash)
	await uploadAttachment(imageKey, original.jpegBytes, "image/jpeg")

	// the larger original that the intro and the sign-off zoom into
	if (original.largeOriginalJpegBytes) {
		await uploadAttachment(imageOriginalKey, original.largeOriginalJpegBytes, "image/jpeg")
	}
	return imageHash
}

// the keys of a film image's two files: the jpeg at the film's size, then its larger original
function toImageObjectKeys(podcastEpisodeId: string, imageHash: string): [string, string] {
	return [
		toTopicPodcastEpisodeVideoImageKey(podcastEpisodeId, imageHash),
		toTopicPodcastEpisodeVideoImageLargeOriginalKey(podcastEpisodeId, imageHash),
	]
}

// the podcast episode of a film row, or null for a film that is gone
async function loadTopicPodcastEpisodeVideoPodcastEpisodeId(
	topicPodcastEpisodeVideoId: string,
): Promise<string | null> {
	const [topicPodcastEpisodeVideo] = await db
		.select({ podcastEpisodeId: topicPodcastEpisodeVideos.podcastEpisodeId })
		.from(topicPodcastEpisodeVideos)
		.where(eq(topicPodcastEpisodeVideos.id, topicPodcastEpisodeVideoId))
	return topicPodcastEpisodeVideo?.podcastEpisodeId ?? null
}
