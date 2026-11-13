// an admin's removal of a reported body image from its Topic Post
import { toTopicPostBodyImageIds } from "@carlnotes/contracts/topicPostBodyImages"
import { db } from "@carlnotes/db"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { recordPendingObjectDeletions } from "@carlnotes/db/store"
import { toTopicPostBodyImageObjectKeys } from "@carlnotes/pipeline/topicPosts/topicPostBodyImageFiles"
import { purgeEdgeCacheTagAfterDeletion, toTopicPostCacheTag } from "@carlnotes/server/edgePurge"
import { and, eq, sql } from "drizzle-orm"
import { sanitizeTopicPostHtml } from "../noteHtml"
import { isTopicPostPublic, purgeTopicPostBodyImagesAtEdge } from "./topicPostBodyImages"
import { loadTopicPostRow, type TopicPostRow } from "./topicPosts"

// the most times a removal reads the post again after a save landed between its read and its write
const REMOVAL_ATTEMPT_LIMIT = 3

/**
 * Removes a reported body image, named "<topicPostId>/<imageId>", as an admin: the body is written again without it at
 * the next version with its files queued for deletion on the same transaction, and a public post's page and image
 * leave the edge. A post that is gone leaves nothing to remove, and an image already gone from the body is purged from
 * the edge again, so a removal whose purge failed purges on its retry.
 */
export async function removeReportedTopicPostBodyImage(subjectId: string): Promise<void> {
	// the body without the image, unless the post is gone
	const [topicPostId = "", imageId = ""] = subjectId.split("/")
	const topicPostRow = await removeImageFromBody(topicPostId, imageId)
	if (!topicPostRow) {
		return
	}

	// a public post's page and the image's files leave the edge
	if (isTopicPostPublic(topicPostRow)) {
		await purgeEdgeCacheTagAfterDeletion(toTopicPostCacheTag(topicPostId))
	}
	await purgeTopicPostBodyImagesAtEdge(topicPostRow)
}

// write a post's body without one image at the next version, with the image's files queued for deletion on the same
// transaction, and return the post as it was read. a save that lands between the
// read and the write sends the removal back to read it again
async function removeImageFromBody(topicPostId: string, imageId: string): Promise<TopicPostRow | null> {
	for (let attempt = 1; attempt <= REMOVAL_ATTEMPT_LIMIT; attempt++) {
		// the post, and a body that no longer shows the image needs no write
		const topicPostRow = await loadTopicPostRow(topicPostId)
		if (!topicPostRow || !toTopicPostBodyImageIds(topicPostRow.topicPost.html, topicPostId).includes(imageId)) {
			return topicPostRow
		}

		// the body without the image
		const { html: previousHtml, version } = topicPostRow.topicPost
		const html = sanitizeTopicPostHtml(previousHtml, topicPostId, { removedImageId: imageId })

		// the write holds only at the version that was read, and queues the files only if it holds
		const isRemoved = await db.transaction(async (transaction) => {
			// the body at the next version, or no row if a save moved the version
			const savedRows = await transaction
				.update(topicPosts)
				.set({ html, version: sql`${topicPosts.version} + 1`, updatedAt: new Date() })
				.where(and(eq(topicPosts.id, topicPostId), eq(topicPosts.version, version)))
				.returning({ id: topicPosts.id })
			if (savedRows.length === 0) {
				return false
			}

			// the removed image's files are queued with the write
			await recordPendingObjectDeletions({
				handle: transaction,
				objectKeys: toTopicPostBodyImageObjectKeys(topicPostId, imageId),
			})
			return true
		})

		// a written body returns the post, and a missed one reads it again
		if (isRemoved) {
			return topicPostRow
		}
	}

	// a post that kept changing is reported as a failed removal
	throw new Error("the post kept changing while its reported image was removed")
}
