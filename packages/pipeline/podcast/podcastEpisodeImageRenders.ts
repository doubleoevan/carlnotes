// a podcast episode image's rows: the scene input read from the podcast episode, the write that makes a stored image
// its current one, and the removal of an upload

import type { TopicImageOrigin } from "@carlnotes/contracts/enums"
import { db } from "@carlnotes/db"
import { podcastEpisodeChapters, podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topicImageRenders } from "@carlnotes/db/schema/topicImages"
import { topics } from "@carlnotes/db/schema/topics"
import { recordPendingObjectDeletions } from "@carlnotes/db/store"
import { purgeEdgeCacheTagAfterDeletion, toTopicImageCacheTag } from "@carlnotes/server/edgePurge"
import { asc, eq } from "drizzle-orm"
import { toPodcastEpisodeImageObjectKeys } from "../topicImages/topicImageFiles"
import { MAX_SCENE_FINDING_TITLES, type TopicImageSceneInput } from "../topicImages/writeTopicImageScene"

// how long a replaced image's objects stay before the sweep deletes them
const REPLACED_IMAGE_GRACE_MS = 60 * 60 * 1000

/**
 * Returns what a podcast episode's scene is written from: its title, description, topic tags, and first chapter titles,
 * or null for a podcast episode with no title.
 */
export async function loadPodcastEpisodeImageSceneInput(
	podcastEpisodeId: string,
): Promise<TopicImageSceneInput | null> {
	// the podcast episode's own words and its topic's tags
	const [podcastEpisode] = await db
		.select({ title: podcastEpisodes.title, description: podcastEpisodes.description, tags: topics.tags })
		.from(podcastEpisodes)
		.leftJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(eq(podcastEpisodes.id, podcastEpisodeId))
	if (!podcastEpisode?.title) {
		return null
	}

	// the first chapters' titles, which say what the podcast episode covers
	const chapterRows = await db
		.select({ title: podcastEpisodeChapters.title })
		.from(podcastEpisodeChapters)
		.where(eq(podcastEpisodeChapters.podcastEpisodeId, podcastEpisodeId))
		.orderBy(asc(podcastEpisodeChapters.position))
		.limit(MAX_SCENE_FINDING_TITLES)
	return {
		topicName: podcastEpisode.title,
		topicPrompt: podcastEpisode.description ?? "",
		tags: podcastEpisode.tags ?? [],
		findingTitles: chapterRows.map((chapterRow) => chapterRow.title),
	}
}

// a stored image to make a podcast episode's current one: the render that drew it or null for an upload, its hash,
// origin, the editor's image prompt, and what the render cost
export type ReplacePodcastEpisodeImageOptions = {
	podcastEpisodeId: string
	renderId: string | null
	hash: string
	origin: TopicImageOrigin
	imagePrompt: string | null
	costDollars: number
}

/**
 * Makes a stored image the podcast episode's current one, schedules the replaced image's objects for deletion after a
 * grace, and closes the render row as succeeded with its cost.
 */
export async function replacePodcastEpisodeImage({
	podcastEpisodeId,
	renderId,
	hash,
	origin,
	imagePrompt,
	costDollars,
}: ReplacePodcastEpisodeImageOptions): Promise<void> {
	const replacedImage = await db.transaction(async (transaction) => {
		// the image this one replaces, and the topic whose visibility decides the edge purge
		const [podcastEpisode] = await transaction
			.select({ previousHash: podcastEpisodes.imageHash, topicId: topics.id, visibility: topics.visibility })
			.from(podcastEpisodes)
			.leftJoin(topics, eq(topics.id, podcastEpisodes.topicId))
			.where(eq(podcastEpisodes.id, podcastEpisodeId))
			.for("no key update", { of: podcastEpisodes })

		// the new image is the current one
		await transaction
			.update(podcastEpisodes)
			.set({ imageHash: hash, imageOrigin: origin, imagePrompt })
			.where(eq(podcastEpisodes.id, podcastEpisodeId))

		// the replaced objects go after the grace, unless the same bytes came back under the same hash
		if (podcastEpisode?.previousHash && podcastEpisode.previousHash !== hash) {
			await recordPendingObjectDeletions({
				handle: transaction,
				objectKeys: toPodcastEpisodeImageObjectKeys(podcastEpisodeId, podcastEpisode.previousHash),
				nextTryAt: new Date(Date.now() + REPLACED_IMAGE_GRACE_MS),
			})
		}

		// the render that drew it is done
		if (renderId) {
			await transaction
				.update(topicImageRenders)
				.set({ status: "succeeded", cost: String(costDollars), finishedAt: new Date() })
				.where(eq(topicImageRenders.id, renderId))
		}
		return podcastEpisode
	})

	// a public topic's replaced files leave the edge
	if (replacedImage?.previousHash && replacedImage.previousHash !== hash) {
		await purgePublicImageFiles(replacedImage)
	}
}

/**
 * Deletes a podcast episode's uploaded image and its objects. Returns whether the current image was an upload.
 */
export async function removePodcastEpisodeImageUpload(podcastEpisodeId: string): Promise<boolean> {
	const removedUpload = await db.transaction(async (transaction) => {
		// the current image, which has to be an upload, and the topic whose visibility decides the edge purge
		const [podcastEpisode] = await transaction
			.select({
				hash: podcastEpisodes.imageHash,
				origin: podcastEpisodes.imageOrigin,
				topicId: topics.id,
				visibility: topics.visibility,
			})
			.from(podcastEpisodes)
			.leftJoin(topics, eq(topics.id, podcastEpisodes.topicId))
			.where(eq(podcastEpisodes.id, podcastEpisodeId))
			.for("no key update", { of: podcastEpisodes })
		if (!podcastEpisode?.hash || podcastEpisode.origin !== "uploaded") {
			return null
		}

		// the image goes with its objects
		await transaction
			.update(podcastEpisodes)
			.set({ imageHash: null, imageOrigin: null, imagePrompt: null })
			.where(eq(podcastEpisodes.id, podcastEpisodeId))
		await recordPendingObjectDeletions({
			handle: transaction,
			objectKeys: toPodcastEpisodeImageObjectKeys(podcastEpisodeId, podcastEpisode.hash),
		})
		return podcastEpisode
	})

	// a public topic's removed files leave the edge
	if (removedUpload) {
		await purgePublicImageFiles(removedUpload)
	}
	return removedUpload !== null
}

// purge a public topic's image files from the edge, where the podcast episode's files are tagged with its topic
async function purgePublicImageFiles({
	topicId,
	visibility,
}: {
	topicId: string | null
	visibility: string | null
}): Promise<void> {
	if (topicId && visibility === "public") {
		await purgeEdgeCacheTagAfterDeletion(toTopicImageCacheTag(topicId))
	}
}
