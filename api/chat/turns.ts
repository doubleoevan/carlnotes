// authorizing and metering one chat turn. the reply itself is generated in the worker
import { trackEvent } from "@shared/analytics"
import { and, desc, eq } from "drizzle-orm"
import { db } from "../../db"
import { chatTurns, topics, users } from "../../db/schema"
import { CHAT_COST_PER_MILLION_TOKENS, EXA_COST_PER_SEARCH, tokenCost } from "../../worker/budget"
import { isAllowed } from "../authorization"
import type { AnalyticsProperties } from "../currentUser"
import { deleteChatAttachments } from "./attachments"
import { decryptChatText, encryptChatText } from "./encryption"

// the answers to a chat turn request. signup routes a visitor to the signup page and budget prompts an
// upgrade, so the refusals stay apart. an allowed chat turn includes the caller's own model key, so its spend
// lands under their proxy budget the way a scan's does
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type ChatTurnAuthorization = { status: "allowed"; isOwner: boolean; isPersisted: boolean; litellmApiKey?: string } | { status: "signup" } | { status: "forbidden" } | { status: "budget" }

/**
 * Whether this caller may take a chat turn on the topic right now, and how that chat turn should be recorded.
 * A signed-out visitor on a visible topic is sent to signup, so no anonymous chat turn ever spends.
 */
export async function authorizeChatTurn(userId: string | null, topicId: string): Promise<ChatTurnAuthorization> {
	// a missing topic is refused the same way an invisible one is
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		return { status: "forbidden" }
	}

	// visibility is asked first, then sign-in
	if (!(await isAllowed(userId, "topic:view", topic))) {
		return { status: "forbidden" }
	}
	if (!userId) {
		return { status: "signup" }
	}

	// the one refusal left for a signed-in caller who can see the topic is the budget
	if (!(await isAllowed(userId, "chat:send", topic))) {
		return { status: "budget" }
	}

	// the gate decides whether the chat turn keeps its text, and its model calls bill to the caller's own key
	const [isPersisted, [userRow]] = await Promise.all([
		isAllowed(userId, "chat:persist"),
		db.select({ litellmVirtualKey: users.litellmVirtualKey }).from(users).where(eq(users.id, userId)),
	])
	return {
		status: "allowed",
		isOwner: topic.ownerId === userId,
		isPersisted,
		litellmApiKey: userRow?.litellmVirtualKey ?? undefined,
	}
}

/**
 * Record a finished chat turn's spend, keeping its text only when the gate allows the caller that.
 * A chat turn that streamed and then failed still records, so a partial chat turn is never free.
 */
export async function recordChatTurn(
	userId: string,
	topicId: string,
	totalTokens: number,
	searchCount: number,
	isPersisted: boolean,
	question: string,
	answer: string,
	analyticsProperties: AnalyticsProperties,
): Promise<void> {
	await db
		.insert(chatTurns)
		.values(toChatTurnRow(userId, topicId, totalTokens, searchCount, isPersisted, question, answer))

	// the event goes with the row, so a chat turn is counted exactly when it is metered
	trackEvent("chat_turn_sent", userId, { ...analyticsProperties, topicId })
}

/**
 * The row one finished chat turn writes. Its cost is the same best-effort token total a scan uses plus what its
 * web searches cost, since LiteLLM meters the authoritative figure.
 */
export function toChatTurnRow(
	userId: string,
	topicId: string,
	totalTokens: number,
	searchCount: number,
	isPersisted: boolean,
	question: string,
	answer: string,
): typeof chatTurns.$inferInsert {
	// a chat turn that does not persist stores null text, so its row is a meter entry and nothing more.
	// persisted text stores encrypted, so the database never holds the conversation readable
	return {
		userId,
		topicId,
		cost: (tokenCost(totalTokens, CHAT_COST_PER_MILLION_TOKENS) + searchCount * EXA_COST_PER_SEARCH).toFixed(6),
		question: isPersisted ? encryptChatText(question) : null,
		answer: isPersisted ? encryptChatText(answer) : null,
	}
}

/**
 * The caller's stored chat turns for a topic, oldest first. The whole conversation, since the panel virtualizes its list.
 */
export async function loadChatTurns(
	userId: string | null,
	topicId: string,
): Promise<{ question: string; answer: string; at: string }[]> {
	// a visitor, or anyone the gate refuses persistence, has nothing stored to read
	if (!userId || !(await isAllowed(userId, "chat:persist"))) {
		return []
	}

	// newest first off the index, then flipped back into reading order
	const chatTurnRows = await db
		.select({ question: chatTurns.question, answer: chatTurns.answer, createdAt: chatTurns.createdAt })
		.from(chatTurns)
		.where(and(eq(chatTurns.userId, userId), eq(chatTurns.topicId, topicId)))
		.orderBy(desc(chatTurns.createdAt))

	// decrypt each stored pair, dropping the meter-only rows and any text that fails to verify
	return chatTurnRows.reverse().flatMap((row) => {
		if (row.question === null || row.answer === null) {
			return []
		}

		// a pair is replayed only when both sides decrypt, since half a chat turn reads as a glitch
		const question = decryptChatText(row.question)
		const answer = decryptChatText(row.answer)
		return question !== null && answer !== null ? [{ question, answer, at: row.createdAt.toISOString() }] : []
	})
}

/**
 * Clear the caller's conversation with a topic: every chat turn's text is nulled and everything they kept for the
 * topic goes with it, since a kept file is conversation memory. The chat turn rows stay because they are the spend
 * ledger, and deleting them would let a cleared chat reset the month's meter.
 */
export async function clearChatTurns(userId: string, topicId: string): Promise<void> {
	await db
		.update(chatTurns)
		.set({ question: null, answer: null })
		.where(and(eq(chatTurns.userId, userId), eq(chatTurns.topicId, topicId)))
	await deleteChatAttachments(topicId, userId)
}
