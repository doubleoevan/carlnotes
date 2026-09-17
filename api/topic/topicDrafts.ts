// the new-topic chat's draft, stored per user so it survives a reload
import { type TopicDraft, topicDraftPayload } from "@shared/contracts"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { topicDrafts } from "../../db/schema"

/**
 * The draft this user's new-topic chat has written so far, or null for a visitor and a chat that has written none.
 * A stored draft that no longer matches the current shape reads back as null.
 */
export async function loadTopicDraft(userId: string | null): Promise<TopicDraft | null> {
	if (!userId) {
		return null
	}
	// read this user's stored topic draft, and drop one the current shape rejects
	const [topicDraftRow] = await db.select().from(topicDrafts).where(eq(topicDrafts.userId, userId))
	const topicDraftResult = topicDraftPayload.safeParse(topicDraftRow?.topicDraft)
	return topicDraftResult.success ? topicDraftResult.data : null
}

/**
 * Saves the topic draft this user's new-topic chat has written.
 */
export async function saveTopicDraft(userId: string, topicDraft: TopicDraft): Promise<void> {
	await db
		.insert(topicDrafts)
		.values({ userId, topicDraft })
		.onConflictDoUpdate({ target: topicDrafts.userId, set: { topicDraft, updatedAt: new Date() } })
}

/**
 * Deletes this user's topic draft.
 */
export async function deleteTopicDraft(userId: string): Promise<void> {
	await db.delete(topicDrafts).where(eq(topicDrafts.userId, userId))
}
