// a Topic Post image's scene input, the render a publish starts, and the write that makes a stored image the post's
// current one

import type { TopicImageOrigin } from "@carlnotes/contracts/enums"
import { toHtmlText } from "@carlnotes/contracts/text"
import { type DbTransaction, db } from "@carlnotes/db"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { recordPendingObjectDeletions } from "@carlnotes/db/store"
import { topicImageModel } from "@carlnotes/models/topicImageModel"
import { purgeEdgeCacheTagAfterDeletion, toTopicImageCacheTag, toTopicPostCacheTag } from "@carlnotes/server/edgePurge"
import { eq } from "drizzle-orm"
import { toTopicPostImageObjectKeys } from "../topicImages/topicImageFiles"
import {
	recordReplacedImageDeletions,
	startTopicImageRender,
	succeedTopicImageRender,
} from "../topicImages/topicImageRenders"
import type { TopicImageSceneInput } from "../topicImages/writeTopicImageScene"

// how much of a post's text its scene is written from
const MAX_SCENE_POST_CHARS = 2000

/**
 * Returns what a Topic Post's scene is written from: its title, how its text starts, and its Topic's tags, or null
 * for a post with no title. The scene's writer fences every one of them as untrusted.
 */
export async function loadTopicPostImageSceneInput(topicPostId: string): Promise<TopicImageSceneInput | null> {
	// the post with its Topic's tags. a post with no title has no scene
	const [topicPost] = await db
		.select({ title: topicPosts.title, html: topicPosts.html, tags: topics.tags })
		.from(topicPosts)
		.innerJoin(topics, eq(topics.id, topicPosts.topicId))
		.where(eq(topicPosts.id, topicPostId))
	if (!topicPost?.title) {
		return null
	}

	// the post's own words stand where a Topic's name and prompt do, and it has no findings
	return {
		topicName: topicPost.title,
		topicPrompt: toHtmlText(topicPost.html).slice(0, MAX_SCENE_POST_CHARS),
		tags: topicPost.tags,
		findingTitles: [],
	}
}

/**
 * Starts the render that draws a published Topic Post its first image, billed to its author. Returns the render's
 * id, or null for a draft, a deleted post, and a post that already has an image.
 */
export async function startTopicPostCreateImageRender(topicPostId: string): Promise<string | null> {
	const [topicPost] = await db
		.select({
			topicId: topicPosts.topicId,
			authorUserId: topicPosts.authorUserId,
			publishedAt: topicPosts.publishedAt,
			imageHash: topicPosts.imageHash,
		})
		.from(topicPosts)
		.where(eq(topicPosts.id, topicPostId))
	if (!topicPost?.publishedAt || topicPost.imageHash) {
		return null
	}

	// the render row and its workflow, billed to the author
	return startTopicImageRender({
		topicId: topicPost.topicId,
		topicPostId,
		userId: topicPost.authorUserId,
		kind: "create",
		model: topicImageModel(),
	})
}

// a stored image to make a Topic Post's current one: the render that drew it or null for an upload, its hash, its
// origin, the editor's image prompt, and what the render cost
export type ReplaceTopicPostImageOptions = {
	topicPostId: string
	renderId: string | null
	hash: string
	origin: TopicImageOrigin
	imagePrompt: string | null
	costDollars: number
}

/**
 * Makes a stored image the Topic Post's current one, schedules the replaced image's objects for deletion after a
 * grace, closes the render row as succeeded with its cost, and purges a public Topic's post page at the edge.
 */
export async function replaceTopicPostImage({
	topicPostId,
	renderId,
	hash,
	origin,
	imagePrompt,
	costDollars,
}: ReplaceTopicPostImageOptions): Promise<void> {
	// swap the image and close its render in one transaction
	const replacedImage = await db.transaction(async (transaction) => {
		// the image this one replaces, and the topic whose visibility decides the edge purge
		const [topicPost] = await transaction
			.select({ previousHash: topicPosts.imageHash, topicId: topics.id, visibility: topics.visibility })
			.from(topicPosts)
			.innerJoin(topics, eq(topics.id, topicPosts.topicId))
			.where(eq(topicPosts.id, topicPostId))
			.for("no key update", { of: topicPosts })

		// the new image is the current one
		await transaction
			.update(topicPosts)
			.set({ imageHash: hash, imageOrigin: origin, imagePrompt, imageUpdatedAt: new Date() })
			.where(eq(topicPosts.id, topicPostId))

		// the replaced objects go after the grace, unless the same bytes came back under the same hash
		if (topicPost?.previousHash && topicPost.previousHash !== hash) {
			await recordReplacedImageDeletions(transaction, toTopicPostImageObjectKeys(topicPostId, topicPost.previousHash))
		}

		// the render that drew it is done
		await succeedTopicImageRender({ transaction, renderId, costDollars })
		return topicPost
	})

	// a private topic's post has nothing at the edge, and an image that came back under its own hash changes nothing
	if (!replacedImage || replacedImage.previousHash === hash || replacedImage.visibility !== "public") {
		return
	}

	// the post's page leaves the edge with the image it showed, and so do the replaced files, which are tagged with
	// the post's topic
	await purgeEdgeCacheTagAfterDeletion(toTopicPostCacheTag(topicPostId))
	if (replacedImage.previousHash) {
		await purgeEdgeCacheTagAfterDeletion(toTopicImageCacheTag(replacedImage.topicId))
	}
}

/**
 * Clears a Topic Post's current image on the caller's transaction, with the time it changed, and keeps the image's
 * files.
 */
export async function clearTopicPostImage(transaction: DbTransaction, topicPostId: string): Promise<void> {
	await transaction
		.update(topicPosts)
		.set({ imageHash: null, imageOrigin: null, imagePrompt: null, imageUpdatedAt: new Date() })
		.where(eq(topicPosts.id, topicPostId))
}

/**
 * Deletes a Topic Post's uploaded image, its hash and its objects, so the post shows no image until the next render
 * lands. Returns whether the current image was an upload.
 */
export async function removeTopicPostImageUpload(topicPostId: string): Promise<boolean> {
	const removedUpload = await db.transaction(async (transaction) => {
		// the current image, which has to be an upload, and whether the post's topic is public
		const [topicPost] = await transaction
			.select({
				hash: topicPosts.imageHash,
				origin: topicPosts.imageOrigin,
				topicId: topics.id,
				visibility: topics.visibility,
			})
			.from(topicPosts)
			.innerJoin(topics, eq(topics.id, topicPosts.topicId))
			.where(eq(topicPosts.id, topicPostId))
			.for("no key update", { of: topicPosts })
		if (!topicPost?.hash || topicPost.origin !== "uploaded") {
			return null
		}

		// the hash goes with its objects
		await clearTopicPostImage(transaction, topicPostId)
		await recordPendingObjectDeletions({
			handle: transaction,
			objectKeys: toTopicPostImageObjectKeys(topicPostId, topicPost.hash),
		})
		return topicPost
	})

	// a public topic's post page and its removed files leave the edge
	if (removedUpload?.visibility === "public") {
		await purgeEdgeCacheTagAfterDeletion(toTopicPostCacheTag(topicPostId))
		await purgeEdgeCacheTagAfterDeletion(toTopicImageCacheTag(removedUpload.topicId))
	}
	return removedUpload !== null
}
