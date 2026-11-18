import type { DbTransaction } from "@carlnotes/db"
import { podcastEpisodeChapters, podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { findings, resourceImages, resources } from "@carlnotes/db/schema/scans"
import { lockTopicImageVisibility } from "@carlnotes/db/uncheckedImages"
import { and, eq, gte, inArray } from "drizzle-orm"
import { RESOURCE_IMAGE_FILTER_VERSION } from "../resourceImages/resourceImageFilter"
import { loadTopicVideoPodcastEpisode, type TopicVideoPodcastEpisode } from "./topicVideoInputs"

// the image a film was drawn from is the one it shows now: the film's podcast episode and Topic, and the image's hash
type ShownImageCheck = Pick<TopicVideoPodcastEpisode, "podcastEpisodeId" | "topicId" | "imageHash">

// throw an error unless a film still shows the image it was drawn from, read on a transaction that takes the Topic's
// image visibility lock shared. no unchecked image under the Topic is unpublished until that transaction ends
export async function checkTopicVideoImage(
	transaction: DbTransaction,
	{ podcastEpisodeId, topicId, imageHash }: ShownImageCheck,
): Promise<void> {
	await lockTopicImageVisibility(transaction, topicId, "shared")
	const topicVideoPodcastEpisode = await loadTopicVideoPodcastEpisode(podcastEpisodeId, transaction)
	if (topicVideoPodcastEpisode?.imageHash !== imageHash) {
		throw new Error("the film's image changed during its rebuild")
	}
}

export type VideoSceneSource = { position: number; resourceId: string; resourceImageKeys: string[] }

/** Rechecks the public Finding association and every fetched image before the new film becomes readable. */
export async function checkVideoSceneSources(
	transaction: DbTransaction,
	episode: string,
	expected: VideoSceneSource[],
): Promise<void> {
	if (!expected.length) {
		return
	}
	// Hold the contributing Finding and Resource through the same commit that publishes the film.
	const chapters = await transaction
		.select({
			position: podcastEpisodeChapters.position,
			resourceId: resources.id,
		})
		.from(podcastEpisodeChapters)
		.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, podcastEpisodeChapters.podcastEpisodeId))
		.innerJoin(resources, eq(resources.id, podcastEpisodeChapters.resourceId))
		.innerJoin(
			findings,
			and(
				eq(findings.id, podcastEpisodeChapters.findingId),
				eq(findings.topicId, podcastEpisodes.topicId),
				eq(findings.resourceId, resources.id),
			),
		)
		.where(
			and(
				eq(podcastEpisodes.id, episode),
				eq(resources.isUnsafe, false),
				eq(findings.sourceVisibility, "public"),
				inArray(
					podcastEpisodeChapters.position,
					expected.map((row) => row.position),
				),
			),
		)
		.orderBy(podcastEpisodeChapters.position)
		.for("share")
	const keys = expected.flatMap((chapter) => chapter.resourceImageKeys)
	const images = keys.length
		? await transaction
				.select({ resourceId: resources.id, key: resourceImages.objectKey })
				.from(resourceImages)
				.innerJoin(resources, eq(resources.id, resourceImages.resourceId))
				.where(
					and(
						inArray(
							resourceImages.resourceId,
							expected.map((row) => row.resourceId),
						),
						inArray(resourceImages.objectKey, keys),
						gte(resources.imagesFilterVersion, RESOURCE_IMAGE_FILTER_VERSION),
					),
				)
				.orderBy(resourceImages.resourceId, resourceImages.position)
				.for("share")
		: []
	for (const { position, resourceId, resourceImageKeys } of expected) {
		if (
			!chapters.some((chapter) => chapter.position === position && chapter.resourceId === resourceId) ||
			resourceImageKeys.some((key) => !images.some((image) => image.resourceId === resourceId && image.key === key))
		) {
			throw new Error("A chapter Finding or its image lost approval during rendering")
		}
	}
}
