// a topic image render's rows: the render row that charges for it, the scene input read from the topic, and the write
// that makes a stored image the topic's current one

import type { TopicImageOrigin, TopicImageRenderKind } from "@carlnotes/contracts/enums"
import { type DbTransaction, db, isFindingShown } from "@carlnotes/db"
import { findings, resources } from "@carlnotes/db/schema/scans"
import { topicImageRenders, topicImages } from "@carlnotes/db/schema/topicImages"
import { topics } from "@carlnotes/db/schema/topics"
import { recordPendingObjectDeletions } from "@carlnotes/db/store"
import { purgeEdgeCacheTagAfterDeletion, toTopicImageCacheTag } from "@carlnotes/server/edgePurge"
import { and, desc, eq, getTableColumns } from "drizzle-orm"
import { startTopicImageWorkflow } from "../temporalClient"
import { forgetTopicCovers } from "./topicCovers"
import { toTopicImageObjectKeys } from "./topicImageFiles"
import { MAX_SCENE_FINDING_TITLES, type TopicImageSceneInput } from "./writeTopicImageScene"

// how long a replaced image's objects stay before the sweep deletes them
export const REPLACED_IMAGE_GRACE_MS = 60 * 60 * 1000

// a render row
export type TopicImageRenderRow = typeof topicImageRenders.$inferSelect & { topicOwnerId: string }

// a new render: its topic, the podcast episode, the Topic Post, or the film whose image it draws or none for the
// topic's own, the user it bills or null for the platform, why it runs, the model that draws it, and the editor's
// image prompt, which goes to the workflow and never to a row
export type StartTopicImageRenderOptions = {
	topicId: string
	podcastEpisodeId?: string
	topicPostId?: string
	topicPodcastEpisodeVideoId?: string
	// who is billed, why it runs, the model, and the editor's image prompt
	userId: string | null
	kind: Exclude<TopicImageRenderKind, "resize">
	model: string
	imagePrompt?: string
}

/**
 * Writes a pending render row and starts its workflow. Returns the render's id.
 */
export async function startTopicImageRender({
	topicId,
	podcastEpisodeId,
	topicPostId,
	topicPodcastEpisodeVideoId,
	userId,
	kind,
	model,
	imagePrompt,
}: StartTopicImageRenderOptions): Promise<string> {
	// the row first, so the workflow finds it, then the workflow named by the row
	const [renderRow] = await db
		.insert(topicImageRenders)
		.values({ topicId, podcastEpisodeId, topicPostId, topicPodcastEpisodeVideoId, userId, kind, model })
		.returning()
	if (!renderRow) {
		throw new Error(`no render row was written for topic ${topicId}`)
	}

	// the workflow that draws the image
	await startTopicImageWorkflow({ topicId, renderId: renderRow.id, imagePrompt })
	return renderRow.id
}

/**
 * Returns a render row, or null for an id that is not one.
 */
export async function loadTopicImageRender(renderId: string): Promise<TopicImageRenderRow | null> {
	// the render with its topic's owner, so the event can say whether the user it bills owns the topic
	const [renderRow] = await db
		.select({ ...getTableColumns(topicImageRenders), topicOwnerId: topics.ownerId })
		.from(topicImageRenders)
		.innerJoin(topics, eq(topics.id, topicImageRenders.topicId))
		.where(eq(topicImageRenders.id, renderId))
	return renderRow ?? null
}

/**
 * Returns what a topic's scene is written from: its name, prompt, tags, and its newest shown finding titles.
 */
export async function loadTopicImageSceneInput(topicId: string): Promise<TopicImageSceneInput | null> {
	// the topic's own words, then the titles of what it found most recently
	const [topic] = await db
		.select({ name: topics.name, prompt: topics.prompt, tags: topics.tags })
		.from(topics)
		.where(eq(topics.id, topicId))
	if (!topic) {
		return null
	}

	// the newest shown findings' titles, through their resources
	const titleRows = await db
		.select({ title: resources.title })
		.from(findings)
		.innerJoin(resources, eq(resources.id, findings.resourceId))
		.where(and(eq(findings.topicId, topicId), isFindingShown))
		.orderBy(desc(findings.createdAt))
		.limit(MAX_SCENE_FINDING_TITLES)
	return {
		topicName: topic.name,
		topicPrompt: topic.prompt,
		tags: topic.tags,
		findingTitles: titleRows.flatMap((titleRow) => titleRow.title ?? []),
	}
}

/**
 * Keeps the scene the writer returned on the render row, so a retried render draws the same scene.
 */
export async function recordTopicImageScene(renderId: string, scene: string): Promise<void> {
	await db.update(topicImageRenders).set({ scene }).where(eq(topicImageRenders.id, renderId))
}

// the transaction that swapped the image, the render that drew it or null for an upload, and what the render cost
type SucceedTopicImageRenderOptions = { transaction: DbTransaction; renderId: string | null; costDollars: number }

/**
 * Closes the render that drew a new image as succeeded with its cost, inside the transaction that made the image
 * current. An upload has no render to close.
 */
export async function succeedTopicImageRender({
	transaction,
	renderId,
	costDollars,
}: SucceedTopicImageRenderOptions): Promise<void> {
	if (!renderId) {
		return
	}

	// close the row with the cost
	await transaction
		.update(topicImageRenders)
		.set({ status: "succeeded", cost: String(costDollars), finishedAt: new Date() })
		.where(eq(topicImageRenders.id, renderId))
}

/**
 * Schedules a replaced image's objects for deletion after the grace, inside the transaction that replaced it, so the
 * image a reader is still loading stays readable for an hour.
 */
export function recordReplacedImageDeletions(transaction: DbTransaction, objectKeys: string[]): Promise<void> {
	return recordPendingObjectDeletions({
		handle: transaction,
		objectKeys,
		nextTryAt: new Date(Date.now() + REPLACED_IMAGE_GRACE_MS),
	})
}

// a stored image to make current: its topic, the render that drew it or null for an upload, its hash, origin, scene,
// model, image prompt, pixel size, and cost
export type ReplaceTopicImageOptions = {
	topicId: string
	renderId: string | null
	hash: string
	origin: TopicImageOrigin
	// the writer's scene and the model, both null for an upload
	scene: string | null
	model: string | null
	// the owner's image prompt, null for the house style and an upload
	imagePrompt: string | null
	// the original's pixel size and what the render cost
	width: number
	height: number
	costDollars: number
}

/**
 * Makes a stored image the topic's current one, schedules the replaced image's objects for deletion after a grace, and
 * closes the render row as succeeded with its cost.
 */
export async function replaceTopicImage({
	topicId,
	renderId,
	hash,
	origin,
	scene,
	model,
	imagePrompt,
	width,
	height,
	costDollars,
}: ReplaceTopicImageOptions): Promise<void> {
	const topicRow = await db.transaction(async (transaction) => {
		// the image this one replaces, if any, and whether the topic is public
		const [topicRow] = await transaction
			.select({ previousHash: topicImages.hash, visibility: topics.visibility })
			.from(topics)
			.leftJoin(topicImages, eq(topicImages.topicId, topics.id))
			.where(eq(topics.id, topicId))
			.for("no key update", { of: topics })

		// the new image is the current one, as of now
		const imageRow = { topicId, hash, origin, scene, model, imagePrompt, width, height, updatedAt: new Date() }
		await transaction
			.insert(topicImages)
			.values(imageRow)
			.onConflictDoUpdate({ target: topicImages.topicId, set: imageRow })
		await transaction.update(topics).set({ imageHash: hash }).where(eq(topics.id, topicId))

		// the replaced objects go after the grace, unless the same bytes came back under the same hash
		if (topicRow?.previousHash && topicRow.previousHash !== hash) {
			await recordReplacedImageDeletions(transaction, toTopicImageObjectKeys(topicId, topicRow.previousHash))
		}

		// the render that drew it is done
		await succeedTopicImageRender({ transaction, renderId, costDollars })
		return topicRow
	})

	// the covers drawn over the replaced image, or over the illustration before a first image, go, and a public
	// topic's replaced files leave the edge
	if (topicRow && topicRow.previousHash !== hash) {
		await forgetTopicCovers(topicId)
		if (topicRow.previousHash && topicRow.visibility === "public") {
			await purgeEdgeCacheTagAfterDeletion(toTopicImageCacheTag(topicId))
		}
	}
}

/**
 * Clears a topic's current image on the caller's transaction, its image row and the hash on the topic's own row, and
 * keeps the image's files.
 */
export async function clearTopicImage(transaction: DbTransaction, topicId: string): Promise<void> {
	await transaction.delete(topicImages).where(eq(topicImages.topicId, topicId))
	await transaction.update(topics).set({ imageHash: null }).where(eq(topics.id, topicId))
}

/**
 * Deletes a topic's uploaded image, its row and its objects, so the drawn covers show until the next render lands.
 * Returns whether the current image was an upload.
 */
export async function removeTopicImageUpload(topicId: string): Promise<boolean> {
	const removedUpload = await db.transaction(async (transaction) => {
		// the current image, which has to be an upload, and whether the topic is public
		const [topicImage] = await transaction
			.select({ hash: topicImages.hash, origin: topicImages.origin, visibility: topics.visibility })
			.from(topicImages)
			.innerJoin(topics, eq(topics.id, topicImages.topicId))
			.where(eq(topicImages.topicId, topicId))
		if (topicImage?.origin !== "uploaded") {
			return null
		}

		// the row goes with its objects
		await clearTopicImage(transaction, topicId)
		await recordPendingObjectDeletions({
			handle: transaction,
			objectKeys: toTopicImageObjectKeys(topicId, topicImage.hash),
		})
		return topicImage
	})

	// the covers drawn over the upload go, and a public topic's removed files leave the edge
	if (removedUpload) {
		await forgetTopicCovers(topicId)
		if (removedUpload.visibility === "public") {
			await purgeEdgeCacheTagAfterDeletion(toTopicImageCacheTag(topicId))
		}
	}
	return removedUpload !== null
}

/**
 * Closes a render row as failed with why, which leaves the topic's current image as it was.
 */
export async function failTopicImageRender(renderId: string, error: string): Promise<void> {
	await db
		.update(topicImageRenders)
		.set({ status: "failed", error: error.slice(0, 500), finishedAt: new Date() })
		.where(and(eq(topicImageRenders.id, renderId), eq(topicImageRenders.status, "pending")))
}
