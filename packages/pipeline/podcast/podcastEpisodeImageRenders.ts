// a podcast episode image's scene input, and the write that makes a stored image the podcast episode's current one

import type { TopicImageOrigin } from "@carlnotes/contracts/enums"
import { type DbTransaction, db } from "@carlnotes/db"
import { podcastEpisodeChapters, podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { topics } from "@carlnotes/db/schema/topics"
import { recordPendingObjectDeletions } from "@carlnotes/db/store"
import { purgeEdgeCacheTagAfterDeletion, toTopicImageCacheTag } from "@carlnotes/server/edgePurge"
import { asc, eq } from "drizzle-orm"
import { toPodcastEpisodeImageObjectKeys } from "../topicImages/topicImageFiles"
import { recordReplacedImageDeletions, succeedTopicImageRender } from "../topicImages/topicImageRenders"
import { MAX_SCENE_FINDING_TITLES, type TopicImageSceneInput } from "../topicImages/writeTopicImageScene"

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
			const replacedObjectKeys = toPodcastEpisodeImageObjectKeys(podcastEpisodeId, podcastEpisode.previousHash)
			await recordReplacedImageDeletions(transaction, replacedObjectKeys)
		}

		// the render that drew it is done
		await succeedTopicImageRender({ transaction, renderId, costDollars })
		return podcastEpisode
	})

	// a public topic's replaced files leave the edge
	if (replacedImage?.previousHash && replacedImage.previousHash !== hash) {
		await purgePublicImageFiles(replacedImage)
	}
}

/**
 * Clears a podcast episode's current image on the caller's transaction, and keeps the image's files.
 */
export async function clearPodcastEpisodeImage(transaction: DbTransaction, podcastEpisodeId: string): Promise<void> {
	await transaction
		.update(podcastEpisodes)
		.set({ imageHash: null, imageOrigin: null, imagePrompt: null })
		.where(eq(podcastEpisodes.id, podcastEpisodeId))
}

/**
 * Deletes a podcast episode's uploaded image, its hash and its files, so its cards show the topic's image until the
 * next render lands. Returns the podcast episode's topic id if its current image was an upload, or null.
 */
export async function removePodcastEpisodeImageUpload(podcastEpisodeId: string): Promise<string | null> {
	const removedUpload = await db.transaction(async (transaction) => {
		// the current image, which has to be an upload, and the topic whose visibility decides the edge purge
		const [podcastEpisode] = await transaction
			.select({
				imageHash: podcastEpisodes.imageHash,
				imageOrigin: podcastEpisodes.imageOrigin,
				topicId: topics.id,
				visibility: topics.visibility,
			})
			.from(podcastEpisodes)
			.leftJoin(topics, eq(topics.id, podcastEpisodes.topicId))
			.where(eq(podcastEpisodes.id, podcastEpisodeId))
			.for("no key update", { of: podcastEpisodes })
		if (!podcastEpisode?.imageHash || podcastEpisode.imageOrigin !== "uploaded") {
			return null
		}

		// the hash goes with its files
		await clearPodcastEpisodeImage(transaction, podcastEpisodeId)
		await recordPendingObjectDeletions({
			handle: transaction,
			objectKeys: toPodcastEpisodeImageObjectKeys(podcastEpisodeId, podcastEpisode.imageHash),
		})
		return podcastEpisode
	})

	// a public topic's removed files leave the edge
	if (removedUpload) {
		await purgePublicImageFiles(removedUpload)
	}
	return removedUpload?.topicId ?? null
}

/**
 * Purges a public topic's image files from the edge, where a podcast episode's and a film's files are tagged with
 * their topic.
 */
export async function purgePublicImageFiles({
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
