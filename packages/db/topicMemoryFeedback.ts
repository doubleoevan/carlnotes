import { toOneLineText } from "@carlnotes/contracts/text"
import type { TopicMemoryFeedback } from "@carlnotes/contracts/topicMemories"
import { and, eq, inArray } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { canRateTopicMemories } from "./findingPermissions"
import { type DbTransaction, db } from "./index"
import { lockPersonalSourcesTopic } from "./personalSourcesLocks"
import { topicMemories, topicMemoryFeedback } from "./schema/topicMemories"
import { toActiveTopicMemories, topicMemoryGroupingColumns } from "./topicMemories"
import { groupTopicMemories } from "./topicMemoryGroups"

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
		if (!(await canRateTopicMemories(userId, topic, transaction))) {
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

	// both thumbs save their own note on one line. only a downvote's note corrects the topic memory
	const note = toOneLineText(feedback.note ?? "") || null
	const updatedAt = new Date()
	const values = { rating: feedback.rating, note, updatedAt }
	await transaction
		.insert(topicMemoryFeedback)
		.values({ topicMemoryId, userId, ...values })
		.onConflictDoUpdate({ target: [topicMemoryFeedback.topicMemoryId, topicMemoryFeedback.userId], set: values })
	// clearing a topic memory requires an explicit downvote without a correction. it clears every statement of the
	// fact that the Journal shows as one, so the fact does not stay under another wording
	const isRejected = feedback.rating === "down" && !note
	const memoryIds = isRejected ? await loadTopicMemoryGroupIds(transaction, topicId, topicMemoryId) : [topicMemoryId]
	await transaction
		.update(topicMemories)
		.set({ updatedAt, status: isRejected ? "rejected" : "active" })
		.where(inArray(topicMemories.id, memoryIds))
	return "saved"
}

// the ids of the active topic memories that the Journal groups with the given one, itself among them
async function loadTopicMemoryGroupIds(
	transaction: DbTransaction,
	topicId: string,
	topicMemoryId: string,
): Promise<string[]> {
	// the rows that share the topic memory's subject, claim type, and value, which are the only ones it can group with
	const rated = alias(topicMemories, "rated_topic_memory")
	const peers = await transaction
		.select({ id: topicMemories.id, factDate: topicMemories.factDate, ...topicMemoryGroupingColumns() })
		.from(topicMemories)
		.innerJoin(
			rated,
			and(
				eq(rated.id, topicMemoryId),
				eq(rated.subject, topicMemories.subject),
				eq(rated.claimType, topicMemories.claimType),
				eq(rated.value, topicMemories.value),
			),
		)
		.where(toActiveTopicMemories(topicId))
	// a topic memory with no subject or value groups with nothing
	const group = groupTopicMemories(peers).find((members) => members.some(({ id }) => id === topicMemoryId))
	return group ? group.map(({ id }) => id) : [topicMemoryId]
}
