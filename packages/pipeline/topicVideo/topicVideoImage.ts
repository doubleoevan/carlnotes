// a film's own image: a wide scene generated in the film house style and stored beside the film's parts, at the film's
// size for the poster and as a larger original that the intro and the sign-off zoom into. they show it in place of the
// podcast episode's image

import type { TopicImageOrigin } from "@carlnotes/contracts/enums"
import { type DbTransaction, db } from "@carlnotes/db"
import { podcastEpisodes, topicVideos } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { deleteStoredObjects, recordPendingObjectDeletions, uploadAttachment } from "@carlnotes/db/store"
import { toTopicVideoImageKey, toTopicVideoImageLargeOriginalKey } from "@carlnotes/db/topicVideoKeys"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { topicImageCostDollars, topicImageRegenerateModel } from "@carlnotes/models/topicImageModel"
import { reportError } from "@carlnotes/server/monitoring"
import { runWithRetries } from "@carlnotes/server/retry"
import { and, eq, isNull, sql } from "drizzle-orm"
import { clearReplacedImageCopies, loadPodcastEpisodeImageSceneInput } from "../podcast/podcastEpisodeImageRenders"
import {
	deleteDrawnImage,
	renderTopicImageOriginal,
	TopicImageRenderFailure,
	toDrawnImageKey,
} from "../topicImages/renderTopicImageOriginal"
import { type TopicImageFormat, type TopicImageOriginal, toTopicImageHash } from "../topicImages/topicImageFiles"
import { recordReplacedImageDeletions, succeedTopicImageRender } from "../topicImages/topicImageRenders"
import { type TopicImageSceneInput, writeTopicImageScene } from "../topicImages/writeTopicImageScene"
import { recordPlatformTopicVideoSpend } from "./topicVideoRows"
import { startTopicVideoRebuild } from "./topicVideoWorkflowClient"
import { VIDEO_HEIGHT, VIDEO_WIDTH } from "./videoFrames"

// the format of a chapter's generated image: the film house style, generated wide, at the film's frame size
export const GENERATED_CHAPTER_IMAGE_FORMAT: TopicImageFormat = {
	stylePromptName: "topic-video-image-style",
	aspectRatio: "16:9",
	width: VIDEO_WIDTH,
	height: VIDEO_HEIGHT,
}

// the format of a film's own image: the same, generated at the 2K size, with the larger original kept for the zoom of
// the intro and the sign-off
export const TOPIC_VIDEO_IMAGE_FORMAT: TopicImageFormat = {
	...GENERATED_CHAPTER_IMAGE_FORMAT,
	drawSize: "2K",
	largeOriginalWidth: 2752,
	largeOriginalHeight: 1536,
}

// the framing a film image's scene takes
export const TOPIC_VIDEO_IMAGE_FRAMING = "a wide establishing shot, with the focal subject in the upper two thirds"

// an image generation gets two attempts, ten seconds apart
const DRAW_ATTEMPTS = 2
const DRAW_RETRY_DELAY_MS = 10 * 1000

// the podcast episode whose film gets its image, and whether the platform pays for it, as the backfill does
type GenerateTopicVideoImageOptions = { podcastEpisodeId: string; isPlatformBilled?: boolean }

/**
 * Draws and stores the image of a podcast episode's film, unless the film already has one, and adds its cost to the
 * film row unless the platform pays. Returns the image's hash, or null if nothing was generated. A failed image
 * generation throws an error.
 */
export async function generateTopicVideoImage({
	podcastEpisodeId,
	isPlatformBilled = false,
}: GenerateTopicVideoImageOptions): Promise<string | null> {
	// the film's image and its podcast episode's owner
	const [topicVideo] = await db
		.select({ imageHash: topicVideos.imageHash, ownerId: podcastEpisodes.ownerId })
		.from(topicVideos)
		.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, topicVideos.podcastEpisodeId))
		.where(eq(topicVideos.podcastEpisodeId, podcastEpisodeId))

	// a film that has an image, or a podcast episode with no title, has nothing to generate
	const isNewlyGenerated = Boolean(topicVideo?.imageHash)
	const sceneInput = isNewlyGenerated ? null : await loadPodcastEpisodeImageSceneInput(podcastEpisodeId)
	if (!topicVideo || !sceneInput) {
		return null
	}

	// the original from a scene of the podcast episode's own words, on the owner's key or the master key for the
	// platform, on the model that generates at the film image's size. the drawn bytes are kept under the film's key,
	// so a render's next attempt after a failed store draws nothing
	const litellmApiKey = isPlatformBilled ? undefined : await loadOrProvisionUserLiteLLMKey(topicVideo.ownerId)
	const model = topicImageRegenerateModel()
	const drawnImageKey = toDrawnImageKey("topic-video", podcastEpisodeId)
	const original = await generateTopicVideoImageOriginal({ sceneInput, model, litellmApiKey, drawnImageKey })

	// the files, then the image's hash on the film row with the cost. a film that got its image meanwhile keeps it
	const imageHash = await storeTopicVideoImage(podcastEpisodeId, original)
	// the platform's image is a row of its own, and the film row's cost takes an owner's image alone
	const { drawSize } = TOPIC_VIDEO_IMAGE_FORMAT
	const dollars = topicImageCostDollars(model, drawSize)
	if (isPlatformBilled) {
		await recordPlatformTopicVideoSpend({ podcastEpisodeId, kind: "topicVideoImage", dollars })
	}

	// the image's hash on the film row, with an owner's cost. a film that got its image meanwhile keeps it
	const imageCostDollars = isPlatformBilled ? 0 : dollars
	const updatedRows = await db
		.update(topicVideos)
		.set({
			imageHash,
			imageOrigin: "generated",
			cost: sql`${topicVideos.cost} + ${imageCostDollars.toFixed(6)}`,
		})
		.where(and(eq(topicVideos.podcastEpisodeId, podcastEpisodeId), isNull(topicVideos.imageHash)))
		.returning({ id: topicVideos.id })

	// the film has its image either way, so the kept bytes go. no row changed, so this image generation's files go too
	await deleteDrawnImage(drawnImageKey)
	if (updatedRows.length === 0) {
		await deleteStoredObjects(toTopicVideoImageObjectKeys(podcastEpisodeId, imageHash))
		return null
	}
	return imageHash
}

// what one image generation reads: the scene's words, the framing its scene takes, which is the film image's if none is
// given, the format, which is the film image's if none is given, the model, the key it bills, or the master key if
// no key is given, and the key its drawn bytes are kept under, if a later attempt should draw nothing
type GenerateImageOriginalOptions = {
	sceneInput: TopicImageSceneInput
	framing?: string
	format?: TopicImageFormat
	model: string
	litellmApiKey?: string
	drawnImageKey?: string
}

/**
 * Draws an image in the film house style in a format, from a scene written in a framing over the given words. A spent
 * budget and a rejection are final, and anything else gets a second attempt before it throws.
 */
export function generateTopicVideoImageOriginal(
	generateImageOriginalOptions: GenerateImageOriginalOptions,
): Promise<TopicImageOriginal> {
	return runWithRetries({
		attempts: DRAW_ATTEMPTS,
		delayMs: DRAW_RETRY_DELAY_MS,
		runAttempt: () => generateImageOriginal(generateImageOriginalOptions),
		isRetryable: (error) => !(error instanceof TopicImageRenderFailure) || error.outcome === "retryable",
	})
}

// write the scene in the framing, and generate it in the film house style in the format
async function generateImageOriginal({
	sceneInput,
	framing = TOPIC_VIDEO_IMAGE_FRAMING,
	format = TOPIC_VIDEO_IMAGE_FORMAT,
	model,
	litellmApiKey,
	drawnImageKey,
}: GenerateImageOriginalOptions): Promise<TopicImageOriginal> {
	const scene = await writeTopicImageScene({ ...sceneInput, framing, litellmApiKey })
	return renderTopicImageOriginal({ scene, isHouseStyle: true, model, format, litellmApiKey, drawnImageKey })
}

/**
 * Returns what a film image's scene is written from: its podcast episode's title, description, topic tags, and first
 * chapter titles, in the film's framing. Returns null for a film that is gone or a podcast episode with no title.
 */
export async function loadTopicVideoImageSceneInput(topicVideoId: string): Promise<TopicImageSceneInput | null> {
	const podcastEpisodeId = await loadTopicVideoPodcastEpisodeId(topicVideoId)
	const sceneInput = podcastEpisodeId ? await loadPodcastEpisodeImageSceneInput(podcastEpisodeId) : null
	return sceneInput && { ...sceneInput, framing: TOPIC_VIDEO_IMAGE_FRAMING }
}

// a new image for a film: the film, the original, the render that generated it or null for an upload, its origin, the
// editor's image prompt, and what the render cost
export type ReplaceTopicVideoImageOptions = {
	topicVideoId: string
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
export async function replaceTopicVideoImage({
	topicVideoId,
	original,
	...publishedImage
}: ReplaceTopicVideoImageOptions): Promise<string | null> {
	// the film's podcast episode, which names the image's key
	const podcastEpisodeId = await loadTopicVideoPodcastEpisodeId(topicVideoId)
	if (!podcastEpisodeId) {
		return null
	}

	// the file under its hash, then the row that makes it current
	const imageHash = await storeTopicVideoImage(podcastEpisodeId, original)
	await publishTopicVideoImage({
		topicVideoId,
		podcastEpisodeId,
		imageHash,
		...publishedImage,
	})
	return imageHash
}

// a stored image to make a film's current one: the film and its podcast episode, the image's hash, the render that
// generated it or null for an upload, its origin, the editor's image prompt, and what the render cost
export type PublishTopicVideoImageOptions = Omit<ReplaceTopicVideoImageOptions, "original"> & {
	podcastEpisodeId: string
	imageHash: string
}

/**
 * Makes a stored image the film's current one, schedules the replaced image for deletion after a grace, closes the
 * render row as succeeded with its cost, and starts the rebuild of the film's intro and sign-off.
 */
export async function publishTopicVideoImage({
	topicVideoId,
	podcastEpisodeId,
	imageHash,
	renderId,
	origin,
	imagePrompt,
	costDollars,
}: PublishTopicVideoImageOptions): Promise<void> {
	const replacedImage = await db.transaction(async (transaction) => {
		// the image this one replaces, and the topic whose visibility decides the edge purge
		const [topicVideo] = await transaction
			.select({ previousHash: topicVideos.imageHash, topicId: topics.id, visibility: topics.visibility })
			.from(topicVideos)
			.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, topicVideos.podcastEpisodeId))
			.leftJoin(topics, eq(topics.id, podcastEpisodes.topicId))
			.where(eq(topicVideos.id, topicVideoId))
			.for("no key update", { of: topicVideos })

		// the new image is the current one
		await transaction
			.update(topicVideos)
			.set({ imageHash, imageOrigin: origin, imagePrompt })
			.where(eq(topicVideos.id, topicVideoId))

		// the replaced image goes after the grace, unless the same bytes came back under the same hash
		if (topicVideo?.previousHash && topicVideo.previousHash !== imageHash) {
			const replacedImageKeys = toTopicVideoImageObjectKeys(podcastEpisodeId, topicVideo.previousHash)
			await recordReplacedImageDeletions(transaction, replacedImageKeys)
		}

		// the render that generated it is done
		await succeedTopicImageRender({ transaction, renderId, costDollars })
		return topicVideo
	})

	// the topic's visitor pages and a public topic's replaced image leave the caches, after a first image too
	if (replacedImage && replacedImage.previousHash !== imageHash) {
		await clearReplacedImageCopies(replacedImage)
	}

	// the intro and the sign-off are rendered again from the new image. a failed start is reported, and the next play
	// starts the rebuild
	await startTopicVideoRebuild(podcastEpisodeId).catch((error: unknown) => {
		reportError(error, "topic-video", { podcastEpisodeId, step: "rebuild" })
	})
}

/**
 * Clears a film's current image on the caller's transaction, by the film's one podcast episode, and keeps the image's
 * files.
 */
export async function clearTopicVideoImage(transaction: DbTransaction, podcastEpisodeId: string): Promise<void> {
	await transaction
		.update(topicVideos)
		.set({ imageHash: null, imageOrigin: null, imagePrompt: null })
		.where(eq(topicVideos.podcastEpisodeId, podcastEpisodeId))
}

/**
 * Deletes a film's uploaded image, its hash and its files, so the poster shows the podcast episode's image until the
 * next render lands. Returns the film's id if its current image was an upload, or null.
 */
export async function removeTopicVideoImageUpload(podcastEpisodeId: string): Promise<string | null> {
	const removedUpload = await db.transaction(async (transaction) => {
		// the film's current image, which has to be an upload, and the topic whose visibility decides the edge purge
		const [topicVideo] = await transaction
			.select({
				id: topicVideos.id,
				imageHash: topicVideos.imageHash,
				imageOrigin: topicVideos.imageOrigin,
				topicId: topics.id,
				visibility: topics.visibility,
			})
			.from(topicVideos)
			.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, topicVideos.podcastEpisodeId))
			.leftJoin(topics, eq(topics.id, podcastEpisodes.topicId))
			.where(eq(topicVideos.podcastEpisodeId, podcastEpisodeId))
			.for("no key update", { of: topicVideos })

		// a film with no image of its own, or a generated one, has no upload to remove
		if (!topicVideo?.imageHash || topicVideo.imageOrigin !== "uploaded") {
			return null
		}

		// the hash goes with its files
		await clearTopicVideoImage(transaction, podcastEpisodeId)
		await recordPendingObjectDeletions({
			handle: transaction,
			objectKeys: toTopicVideoImageObjectKeys(podcastEpisodeId, topicVideo.imageHash),
		})
		return topicVideo
	})

	// the topic's visitor pages and a public topic's removed image leave the caches
	if (removedUpload) {
		await clearReplacedImageCopies(removedUpload)
	}
	return removedUpload?.id ?? null
}

/**
 * Stores a film image's jpeg at the film's size under its content hash, with its larger original beside it if it has
 * one, and returns the hash.
 */
export async function storeTopicVideoImage(podcastEpisodeId: string, original: TopicImageOriginal): Promise<string> {
	// the jpeg the poster shows, which names the image
	const imageHash = toTopicImageHash(original.jpegBytes)
	const [imageKey, imageOriginalKey] = toTopicVideoImageObjectKeys(podcastEpisodeId, imageHash)
	await uploadAttachment(imageKey, original.jpegBytes, "image/jpeg")

	// the larger original that the intro and the sign-off zoom into
	if (original.largeOriginalJpegBytes) {
		await uploadAttachment(imageOriginalKey, original.largeOriginalJpegBytes, "image/jpeg")
	}
	return imageHash
}

/**
 * Returns the keys of a film image's two files: the jpeg at the film's size, then its larger original.
 */
export function toTopicVideoImageObjectKeys(podcastEpisodeId: string, imageHash: string): [string, string] {
	return [
		toTopicVideoImageKey(podcastEpisodeId, imageHash),
		toTopicVideoImageLargeOriginalKey(podcastEpisodeId, imageHash),
	]
}

// the podcast episode of a film row, or null for a film that is gone
async function loadTopicVideoPodcastEpisodeId(topicVideoId: string): Promise<string | null> {
	const [topicVideo] = await db
		.select({ podcastEpisodeId: topicVideos.podcastEpisodeId })
		.from(topicVideos)
		.where(eq(topicVideos.id, topicVideoId))
	return topicVideo?.podcastEpisodeId ?? null
}
