// commit a confirmed MCP Topic Draft and its receipt in the same transaction
import type { DbHandle, DbTransaction } from "@carlnotes/db"
import { topics } from "@carlnotes/db/schema/topics"
import { verifications } from "@carlnotes/db/schema/users"
import { and, eq, lte } from "drizzle-orm"

// the existing expiring verification records also hold one-time Topic Draft confirmations
const TOPIC_DRAFT_RECEIPT = "mcp-topic-draft"
export type TopicDraftReceipt = { id: string; expiresAt: Date }
type UsedTopicDraft = { status: "created"; id: string } | { status: "confirmationUsed" }

/**
 * Returns the owned Topic for a retried creation. A deleted or transferred Topic consumes the confirmation too.
 */
export async function readUsedTopicDraft(
	handle: DbHandle,
	userId: string,
	receipt: TopicDraftReceipt,
): Promise<UsedTopicDraft | null> {
	const [used] = await handle
		.select({ topicId: topics.id })
		.from(verifications)
		.leftJoin(topics, and(eq(topics.id, verifications.value), eq(topics.ownerId, userId)))
		.where(eq(verifications.id, receipt.id))
	if (!used) {
		return null
	}
	return used.topicId ? { status: "created", id: used.topicId } : { status: "confirmationUsed" }
}

/**
 * Claims the confirmation in the Topic insert's transaction. A failed insert rolls back the claim.
 */
export async function claimTopicDraftReceipt(
	transaction: DbTransaction,
	userId: string,
	receipt: TopicDraftReceipt,
	topicId: string,
): Promise<UsedTopicDraft | null> {
	const now = new Date()
	if (receipt.expiresAt <= now) {
		return { status: "confirmationUsed" }
	}
	// expire only this flow's old receipts, then let the primary key serialize concurrent confirmations
	await transaction
		.delete(verifications)
		.where(and(eq(verifications.identifier, TOPIC_DRAFT_RECEIPT), lte(verifications.expiresAt, now)))
	const [claimed] = await transaction
		.insert(verifications)
		.values({ id: receipt.id, identifier: TOPIC_DRAFT_RECEIPT, value: topicId, expiresAt: receipt.expiresAt })
		.onConflictDoNothing({ target: verifications.id })
		.returning({ id: verifications.id })
	return claimed ? null : ((await readUsedTopicDraft(transaction, userId, receipt)) ?? { status: "confirmationUsed" })
}
