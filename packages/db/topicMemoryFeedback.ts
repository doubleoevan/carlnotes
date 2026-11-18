import type { TopicMemoryFeedback } from "@carlnotes/contracts/topicMemories"
import { and, eq } from "drizzle-orm"
import { canRateTopicMemories } from "./findingPermissions"
import { type DbTransaction, db } from "./index"
import { lockPersonalSourcesTopic } from "./personalSourcesLocks"
import { topicMemories, topicMemoryFeedback } from "./schema/topicMemories"
import { toActiveTopicMemories } from "./topicMemories"
import { loadTopicRole } from "./topicPermissions"

type SaveTopicMemoryFeedbackOptions = {
	topicId: string
	topicMemoryId: string
	userId: string
	feedback: TopicMemoryFeedback
}

/** Saves one user's vote on an active topic memory. A downvote without a note retires it immediately. */
export function saveTopicMemoryFeedback(
	options: SaveTopicMemoryFeedbackOptions,
): Promise<"saved" | "missing" | "forbidden"> {
	return db.transaction(async (transaction) => {
		// recheck the sender's authority after waiting for writes on the same Topic
		const { topicId, userId } = options
		const topic = await lockPersonalSourcesTopic(transaction, topicId)
		if (!topic) {
			return "missing"
		}
		// a lead can lose access while this request waits on the lock
		if (!canRateTopicMemories(await loadTopicRole({ userId, topic, handle: transaction }))) {
			return "forbidden"
		}
		return writeTopicMemoryFeedback(transaction, options)
	})
}

// the Topic lock protects the active row and its feedback through this write
async function writeTopicMemoryFeedback(
	transaction: DbTransaction,
	{ topicId, topicMemoryId, userId, feedback }: SaveTopicMemoryFeedbackOptions,
): Promise<"saved" | "missing"> {
	// only the named Topic's active topic memories may change
	const [memory] = await transaction
		.select({ id: topicMemories.id })
		.from(topicMemories)
		.where(and(toActiveTopicMemories(topicId), eq(topicMemories.id, topicMemoryId)))
	if (!memory) {
		return "missing"
	}

	// clear the caller's vote, including any correction it supplied
	if (feedback.rating === null) {
		await transaction
			.delete(topicMemoryFeedback)
			.where(and(eq(topicMemoryFeedback.topicMemoryId, topicMemoryId), eq(topicMemoryFeedback.userId, userId)))
		return "saved"
	}

	// both thumbs save their own note. only a downvote's note corrects the topic memory
	const note = feedback.note?.trim() || null
	const updatedAt = new Date()
	const values = { rating: feedback.rating, note, updatedAt }
	await transaction
		.insert(topicMemoryFeedback)
		.values({ topicMemoryId, userId, ...values })
		.onConflictDoUpdate({ target: [topicMemoryFeedback.topicMemoryId, topicMemoryFeedback.userId], set: values })
	// clearing a topic memory requires an explicit downvote without a correction
	await transaction
		.update(topicMemories)
		.set({ updatedAt, status: feedback.rating === "down" && !note ? "rejected" : "active" })
		.where(eq(topicMemories.id, topicMemoryId))
	return "saved"
}
