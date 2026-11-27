// the chat_turns rows that record spend with no text: a transcription's and a spoken part's, a chat room completion's,
// and the suggested reply's tokens added to the private chat turn it followed

import type { ChatTurnKind } from "@carlnotes/contracts/enums"
import type { VoiceChatPage } from "@carlnotes/contracts/payloads"
import { db } from "@carlnotes/db"
import { chatTurns } from "@carlnotes/db/schema/chat"
import { CHAT_COST_PER_MILLION_TOKENS, EXA_COST_PER_SEARCH, tokenCost } from "@carlnotes/models/budget"
import { eq, sql } from "drizzle-orm"

// what a completion spent: its tokens and its web searches
export type ChatTurnSpend = { totalTokens: number; searchCount: number }

/**
 * Adds tokens and their cost at the chat rate to a saved chat turn's row.
 */
export async function addChatTurnSpend(chatTurnId: string, totalTokens: number): Promise<void> {
	const cost = toChatTurnCost({ totalTokens, searchCount: 0 }).toFixed(6)
	await db
		.update(chatTurns)
		.set({
			totalTokens: sql`coalesce(${chatTurns.totalTokens}, 0) + ${totalTokens}`,
			cost: sql`${chatTurns.cost} + ${cost}`,
		})
		.where(eq(chatTurns.id, chatTurnId))
}

// the chat turn kinds that record a voice call's spend: a transcription and a spoken part
export type VoiceSpendChatTurnKind = Extract<ChatTurnKind, "transcription" | "speech">

// one transcription or speech call to record as chat spend: which call it was, who it bills, the chat page it was
// on, and what it cost
export type RecordChatSpendRowOptions = {
	kind: VoiceSpendChatTurnKind
	userId: string
	page: VoiceChatPage
	cost: number
	totalTokens: number
}

/**
 * Records a transcription or a spoken part as a chat turn row with no text.
 */
export async function recordChatSpendRow({
	kind,
	userId,
	page,
	cost,
	totalTokens,
}: RecordChatSpendRowOptions): Promise<void> {
	await db.insert(chatTurns).values({
		kind,
		userId,
		...toVoiceChatPageColumns(page),
		...toSpendColumns({ totalTokens, cost }),
	})
}

// the topic and the team a voice page's spend row names, as the chat turn rows name them
function toVoiceChatPageColumns(page: VoiceChatPage): Pick<typeof chatTurns.$inferInsert, "topicId" | "teamId"> {
	// a topic's page names its topic alone, and a team's page names its team
	if (page.kind === "topic") {
		return { topicId: page.topicId, teamId: null }
	}
	if (page.kind === "team") {
		return { topicId: null, teamId: page.teamId }
	}
	// the new-topic chat names neither
	if (page.kind === "newTopic") {
		return { topicId: null, teamId: null }
	}
	return toChatRoomPageColumns(page.topicId, page.teamId)
}

// the topic and the team a chat room's row names: the topic alone, or the team for the team's own chat room
function toChatRoomPageColumns(
	topicId: string | null,
	teamId: string,
): Pick<typeof chatTurns.$inferInsert, "topicId" | "teamId"> {
	return { topicId, teamId: topicId === null ? teamId : null }
}

/**
 * Returns what a chat turn's completion cost: its tokens priced as a scan does, plus what the web searches cost.
 */
export function toChatTurnCost({ totalTokens, searchCount }: ChatTurnSpend): number {
	return tokenCost(totalTokens, CHAT_COST_PER_MILLION_TOKENS) + searchCount * EXA_COST_PER_SEARCH
}

type ToSpendColumnsOptions = { totalTokens: number; cost: number }

/**
 * Returns the spend that every chat turn row stores: its token total and its cost, to six decimals.
 */
export function toSpendColumns({
	totalTokens,
	cost,
}: ToSpendColumnsOptions): Pick<typeof chatTurns.$inferInsert, "totalTokens" | "cost"> {
	return { totalTokens, cost: cost.toFixed(6) }
}

// one chat room completion to record: the member it bills, the chat room it ran in,
// the chat message that carl answered, and what it spent
type RecordChatRoomTurnOptions = {
	userId: string
	topicId: string | null
	teamId: string
	chatRoomMessageId: number
	completion: ChatTurnSpend
}

/**
 * Records a chat room completion as a chat turn row that names the chat room message that carl answered, and returns
 * the row's id.
 */
export async function recordChatRoomTurn({
	userId,
	topicId,
	teamId,
	chatRoomMessageId,
	completion,
}: RecordChatRoomTurnOptions): Promise<string | null> {
	// save the spend and the chat message that carl answered, with no text.
	// the text lives in the chat room's messages
	const [chatRoomTurnRow] = await db
		.insert(chatTurns)
		.values({
			kind: "chat_room",
			userId,
			...toChatRoomPageColumns(topicId, teamId),
			...toSpendColumns({ totalTokens: completion.totalTokens, cost: toChatTurnCost(completion) }),
			roomMessageId: chatRoomMessageId,
		})
		.returning({ id: chatTurns.id })
	return chatRoomTurnRow?.id ?? null
}
