// a Topic Post's writes: a save at the version its editor opened at, the publish, a draft's create, and the delete

import { db } from "@carlnotes/db"
import { releaseHomeOrder } from "@carlnotes/db/homeOrder"
import { releaseTopicPostProfileOrder } from "@carlnotes/db/profileOrder"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { recordPendingObjectDeletions } from "@carlnotes/db/store"
import { clearUnseenCommentMentions, loadTopicPostMentionedUserIds } from "@carlnotes/db/unseenCommentMentions"
import { addViewer } from "@carlnotes/db/viewerCounts"
import { toUserViewerElement } from "@carlnotes/server/viewerElements"
import { and, eq, isNull, sql } from "drizzle-orm"
import { loadTopicPostObjectKeys } from "./topicPostObjectKeys"
import type { TopicPostRow } from "./topicPosts"

// what a save writes: the post, its cleaned title and body, the body's word count, and the version its editor opened at
type SaveTopicPostOptions = {
	topicPost: Pick<TopicPostRow["topicPost"], "id" | "publishedAt">
	title: string
	html: string
	wordCount: number
	version: number
}

/**
 * Writes a Topic Post's title and body at the version its editor opened at, in one conditional statement with no
 * lock. Returns the new version, or the stored one if a newer save holds the post.
 */
export async function saveTopicPost({
	topicPost,
	title,
	html,
	wordCount,
	version,
}: SaveTopicPostOptions): Promise<{ status: "saved" | "conflict"; version: number }> {
	// the write holds only while the stored version is the one the editor opened at, and a draft's write only while
	// the post is still a draft. a published post notes its edit
	const isDraftFilter = topicPost.publishedAt ? undefined : isNull(topicPosts.publishedAt)
	const [savedRow] = await db
		.update(topicPosts)
		.set({
			title,
			html,
			wordCount,
			// the next version, and the edit's time on a published post
			version: sql`${topicPosts.version} + 1`,
			...(topicPost.publishedAt ? { editedAt: new Date() } : {}),
		})
		.where(and(eq(topicPosts.id, topicPost.id), eq(topicPosts.version, version), isDraftFilter))
		.returning({ version: topicPosts.version })
	if (savedRow) {
		return { status: "saved", version: savedRow.version }
	}

	// the version moved, so name the stored one
	const [storedRow] = await db
		.select({ version: topicPosts.version })
		.from(topicPosts)
		.where(eq(topicPosts.id, topicPost.id))
	return { status: "conflict", version: storedRow?.version ?? version }
}

/**
 * Publishes a draft at the version that was checked, counts its author among its viewers, and returns whether this
 * request published it. A Topic Post that is already published, or that was saved again since, stays as it is.
 */
export async function publishTopicPost(topicPostId: string, version: number): Promise<boolean> {
	const [publishedRow] = await db
		.update(topicPosts)
		.set({ publishedAt: new Date() })
		.where(and(eq(topicPosts.id, topicPostId), eq(topicPosts.version, version), isNull(topicPosts.publishedAt)))
		.returning({ authorUserId: topicPosts.authorUserId })

	// count the author as the Topic Post's first viewer, and return whether this request published it
	if (publishedRow) {
		void addViewer({ kind: "topicPost", id: topicPostId }, toUserViewerElement(publishedRow.authorUserId))
	}
	return publishedRow !== undefined
}

/**
 * Creates a draft on a Topic for its author and returns its id.
 */
export async function createTopicPostDraft(topicId: string, authorUserId: string): Promise<string> {
	const [createdRow] = await db.insert(topicPosts).values({ topicId, authorUserId }).returning({ id: topicPosts.id })
	if (!createdRow) {
		throw new Error("the topic post draft was not created")
	}
	return createdRow.id
}

/**
 * Deletes a Topic Post, which takes its Comments, its reactions, and its discussions with it, and schedules its image's
 * files and its discussions' audio for deletion. A pinned post leaves the home's pins and its author's profile pins,
 * and each user its Comments mention reads their unseen Comment Mentions again.
 */
export async function deleteTopicPost(topicPostId: string): Promise<void> {
	// the users that the post's Comments mention, read while the Comments exist
	const mentionedUserIds = await loadTopicPostMentionedUserIds(topicPostId)
	await db.transaction(async (transaction) => {
		// the keys first. the delete takes the rows that name them
		const objectKeys = await loadTopicPostObjectKeys({ topicPostId }, transaction)

		// close the gap a pinned post leaves in each order, then delete the row
		await releaseHomeOrder({ table: topicPosts, id: topicPostId, handle: transaction })
		await releaseTopicPostProfileOrder(topicPostId, transaction)
		await transaction.delete(topicPosts).where(eq(topicPosts.id, topicPostId))
		await recordPendingObjectDeletions({ handle: transaction, objectKeys, nextTryAt: new Date() })
	})

	// the deleted Comments' mentions leave each mentioned user's cached read
	await clearUnseenCommentMentions(mentionedUserIds)
}
