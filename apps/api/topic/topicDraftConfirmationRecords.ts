// commit a confirmed MCP Topic Draft and its confirmation in the same transaction
import type { DbHandle, DbTransaction } from "@carlnotes/db"
import { topics } from "@carlnotes/db/schema/topics"
import { verifications } from "@carlnotes/db/schema/users"
import { and, eq, lte } from "drizzle-orm"

// the existing expiring verification records also hold one-time Topic Draft confirmations
const TOPIC_DRAFT_CONFIRMATION = "mcp-topic-draft"
export type TopicDraftConfirmationRecord = { id: string; expiresAt: Date }
type UsedTopicDraft = { status: "created"; id: string } | { status: "confirmationUsed" }

/**
 * Returns the owned Topic for a retried creation. A deleted or transferred Topic consumes the confirmation too.
 */
export async function readUsedTopicDraft(
	handle: DbHandle,
	userId: string,
	confirmationRecord: TopicDraftConfirmationRecord,
): Promise<UsedTopicDraft | null> {
	const [used] = await handle
		.select({ topicId: topics.id })
		.from(verifications)
		.leftJoin(topics, and(eq(topics.id, verifications.value), eq(topics.ownerId, userId)))
		.where(eq(verifications.id, confirmationRecord.id))
	// a used confirmation returns its Topic if the user still owns it
	if (!used) {
		return null
	}
	return used.topicId ? { status: "created", id: used.topicId } : { status: "confirmationUsed" }
}

/**
 * Claims the confirmation in the Topic insert's transaction. A failed insert rolls back the claim.
 */
export async function claimTopicDraftConfirmation(
	transaction: DbTransaction,
	userId: string,
	confirmationRecord: TopicDraftConfirmationRecord,
	topicId: string,
): Promise<UsedTopicDraft | null> {
	const now = new Date()
	if (confirmationRecord.expiresAt <= now) {
		return { status: "confirmationUsed" }
	}
	// expire only this flow's old confirmations, then let the primary key serialize concurrent confirmations
	await transaction
		.delete(verifications)
		.where(and(eq(verifications.identifier, TOPIC_DRAFT_CONFIRMATION), lte(verifications.expiresAt, now)))
	const [claimed] = await transaction
		.insert(verifications)
		.values({
			id: confirmationRecord.id,
			identifier: TOPIC_DRAFT_CONFIRMATION,
			value: topicId,
			expiresAt: confirmationRecord.expiresAt,
		})
		.onConflictDoNothing({ target: verifications.id })
		.returning({ id: verifications.id })
	return claimed
		? null
		: ((await readUsedTopicDraft(transaction, userId, confirmationRecord)) ?? { status: "confirmationUsed" })
}
