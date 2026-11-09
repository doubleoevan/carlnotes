// a published podcast episode's own image: a scene written from the episode's title, description, topic tags, and
// chapter titles, drawn in the topic image's house style with no text, stored at the topic image's sizes, and billed
// to the episode's owner with the rest of the episode's cost

import { db } from "@carlnotes/db"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { deleteStoredObjects } from "@carlnotes/db/store"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { topicImageCostDollars, topicImageModel } from "@carlnotes/models/topicImageModel"
import { and, asc, eq, isNull, sql } from "drizzle-orm"
import { renderTopicImageOriginal, TopicImageRenderFailure } from "../topicImages/renderTopicImageOriginal"
import { storePodcastEpisodeImageFiles, toPodcastEpisodeImageObjectKeys } from "../topicImages/topicImageFiles"
import { writeTopicImageScene } from "../topicImages/writeTopicImageScene"
import { loadPodcastEpisodeImageSceneInput } from "./podcastEpisodeImageRenders"

// why a podcast episode was left without an image: a spent budget or a rejection, which no retry fixes
export class PodcastEpisodeImageRejectedError extends Error {}

// the episode to draw, and whether the platform pays for it, as a backfill does, instead of the episode's owner
type DrawPodcastEpisodeImageOptions = { podcastEpisodeId: string; isPlatformBilled?: boolean }

/**
 * Draws and stores a published podcast episode's image, unless it already has one. A spent budget or a rejection
 * throws a PodcastEpisodeImageRejectedError, and any other failure throws for another attempt.
 */
export async function drawPodcastEpisodeImage({
	podcastEpisodeId,
	isPlatformBilled = false,
}: DrawPodcastEpisodeImageOptions): Promise<void> {
	// the podcast episode's owner and image. one that has an image, or no title yet, has nothing to draw
	const [podcastEpisode] = await db
		.select({ ownerId: podcastEpisodes.ownerId, imageHash: podcastEpisodes.imageHash })
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.id, podcastEpisodeId))
	const sceneInput = podcastEpisode?.imageHash ? null : await loadPodcastEpisodeImageSceneInput(podcastEpisodeId)
	if (!podcastEpisode || !sceneInput) {
		return
	}

	// the scene from the episode's own words, on the owner's key or the master key for the platform
	const litellmApiKey = isPlatformBilled ? undefined : await loadOrProvisionUserLiteLLMKey(podcastEpisode.ownerId)
	const scene = await writeTopicImageScene({ ...sceneInput, litellmApiKey })

	// the original from the scene and the house style. a spent budget and a rejection are final
	const model = topicImageModel()
	const original = await renderTopicImageOriginal({ scene, isHouseStyle: true, model, litellmApiKey }).catch(
		(error: unknown) => {
			if (error instanceof TopicImageRenderFailure && error.outcome !== "retryable") {
				throw new PodcastEpisodeImageRejectedError(error.message)
			}
			throw error
		},
	)

	// the files under the original's hash, then the hash on the episode, with the cost only if the owner pays. an
	// episode that got its image meanwhile keeps it, and this render's files go
	const hash = await storePodcastEpisodeImageFiles(podcastEpisodeId, original)
	const imageCostDollars = isPlatformBilled ? 0 : topicImageCostDollars(model)
	const updatedRows = await db
		.update(podcastEpisodes)
		.set({
			imageHash: hash,
			imageOrigin: "generated",
			cost: sql`${podcastEpisodes.cost} + ${String(imageCostDollars)}`,
		})
		.where(and(eq(podcastEpisodes.id, podcastEpisodeId), isNull(podcastEpisodes.imageHash)))
		.returning({ id: podcastEpisodes.id })
		.catch(async (error: unknown) => {
			// a failed write leaves no files behind
			await deleteStoredObjects(toPodcastEpisodeImageObjectKeys(podcastEpisodeId, hash))
			throw error
		})

	// no row changed: another render stored its image first
	if (updatedRows.length === 0) {
		await deleteStoredObjects(toPodcastEpisodeImageObjectKeys(podcastEpisodeId, hash))
	}
}

/**
 * Returns the ids of the published podcast episodes that have no image yet, oldest first.
 */
export async function loadPodcastEpisodeIdsWithoutImage(): Promise<string[]> {
	const podcastEpisodeRows = await db
		.select({ id: podcastEpisodes.id })
		.from(podcastEpisodes)
		.where(and(eq(podcastEpisodes.status, "published"), isNull(podcastEpisodes.imageHash)))
		.orderBy(asc(podcastEpisodes.publishedAt))
	return podcastEpisodeRows.map((podcastEpisodeRow) => podcastEpisodeRow.id)
}
