// the chat_turns rows: saving one for every chat turn and chat room turn, and reading or clearing a user's conversation
import { trackEvent } from "@shared/analytics"
import type { ChatToolCall, ChatTurnRow } from "@shared/contracts"
import { and, desc, eq, isNull, type SQL } from "drizzle-orm"
import { db } from "../../db"
import { chatTurns } from "../../db/schema"
import { CHAT_COST_PER_MILLION_TOKENS, EXA_COST_PER_SEARCH, tokenCost } from "../../worker/budget"
import { isAllowed } from "../authorization"
import type { AnalyticsProperties } from "../currentUser"
import { deleteChatAttachments, loadTopicChatTurnAttachments } from "./attachments"
import { decryptChatText, encryptChatText } from "./encryption"
import { loadChatLinkPreviews } from "./linkPreviews"

// the page that a private conversation lives on: one topic, a whole team, or the new-topic chat, bound to neither
export type ChatPage =
	| { topicId: string; teamId?: undefined; newTopic?: undefined }
	| { teamId: string; topicId?: undefined; newTopic?: undefined }
	| { newTopic: true; topicId?: undefined; teamId?: undefined }

/**
 * Returns the id of the topic or the team a chat page is on, or an empty string for the new-topic chat.
 */
export function toChatPageId(page: ChatPage): string {
	return page.topicId ?? page.teamId ?? ""
}

// what a completion spent: its tokens and its web searches
type ChatTurnSpend = { totalTokens: number; searchCount: number }

// what one private chat turn spent and said
export type ToChatTurnRowOptions = ChatTurnSpend & {
	userId: string
	page: ChatPage
	// whether the gate keeps the chat turn's text, and the text itself
	isPersisted: boolean
	question: string
	answer: string
	toolCalls: ChatToolCall[]
}

// a chat turn to save, and the properties that its analytics event is sent with
type SaveChatTurnOptions = ToChatTurnRowOptions & { analyticsProperties: AnalyticsProperties }

/**
 * Saves a finished chat turn's row, with its text only if the gate persists it, and returns the row's id.
 */
export async function saveChatTurn({
	analyticsProperties,
	...chatTurnRowOptions
}: SaveChatTurnOptions): Promise<string | null> {
	// insert the row and return its id
	const [chatTurnRow] = await db
		.insert(chatTurns)
		.values(toChatTurnRow(chatTurnRowOptions))
		.returning({ id: chatTurns.id })

	// count the chat turn exactly when its row is saved
	const { userId, page } = chatTurnRowOptions
	trackEvent("chat_turn_sent", userId, { ...analyticsProperties, topicId: toChatPageId(page) })
	return chatTurnRow?.id ?? null
}

/**
 * Returns the row that one finished private chat turn writes.
 */
export function toChatTurnRow({
	userId,
	page,
	totalTokens,
	searchCount,
	isPersisted,
	question,
	answer,
	toolCalls,
}: ToChatTurnRowOptions): typeof chatTurns.$inferInsert {
	// return the row. a chat turn that does not persist stores null text and only its spend
	return {
		userId,
		topicId: page.topicId ?? null,
		teamId: page.teamId ?? null,
		...toChatTurnSpendColumns({ totalTokens, searchCount }),
		question: isPersisted ? encryptChatText(question) : null,
		answer: isPersisted ? encryptChatText(answer) : null,
		// the tool calls as encrypted json
		toolCalls: isPersisted && toolCalls.length > 0 ? encryptChatText(JSON.stringify(toolCalls)) : null,
	}
}

// the spend that every chat turn row stores: its token total and its cost.
// the cost prices the tokens as a scan does and adds what the web searches cost
function toChatTurnSpendColumns({
	totalTokens,
	searchCount,
}: ChatTurnSpend): Pick<typeof chatTurns.$inferInsert, "totalTokens" | "cost"> {
	return {
		totalTokens,
		cost: (tokenCost(totalTokens, CHAT_COST_PER_MILLION_TOKENS) + searchCount * EXA_COST_PER_SEARCH).toFixed(6),
	}
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
 * Records a chat room completion as a chat turn row that names the chat room message that carl answered.
 */
export async function recordChatRoomTurn({
	userId,
	topicId,
	teamId,
	chatRoomMessageId,
	completion,
}: RecordChatRoomTurnOptions): Promise<void> {
	// save the spend and the chat message that carl answered, with no text.
	// the text lives in the chat room's messages
	await db.insert(chatTurns).values({
		userId,
		topicId,
		// the team, only for the team's own chat room. a topic's chat room turn names its topic alone
		teamId: topicId === null ? teamId : null,
		...toChatTurnSpendColumns(completion),
		roomMessageId: chatRoomMessageId,
	})
}

/**
 * Loads the user's whole conversation on one page, oldest chat turn first.
 */
export async function loadChatTurns(userId: string | null, page: ChatPage): Promise<ChatTurnRow[]> {
	// return nothing for a visitor, or for a user whose chat text the gate does not keep
	if (!userId || !(await isAllowed(userId, "chat:persist"))) {
		return []
	}

	// read the chat turns newest first, and the attachments sent with them.
	// only a topic conversation stores attachments
	const [chatTurnRows, attachmentsByChatTurnId] = await Promise.all([
		db
			.select({
				id: chatTurns.id,
				question: chatTurns.question,
				answer: chatTurns.answer,
				toolCalls: chatTurns.toolCalls,
				createdAt: chatTurns.createdAt,
			})
			.from(chatTurns)
			.where(and(eq(chatTurns.userId, userId), toPageFilter(page)))
			.orderBy(desc(chatTurns.createdAt)),
		page.topicId ? loadTopicChatTurnAttachments(userId, page.topicId) : new Map<string, never[]>(),
	])

	// decrypt each stored pair in reading order, dropping rows with no text and any text that fails to verify
	const decryptedChatTurns = chatTurnRows.reverse().flatMap((chatTurnRow) => {
		if (chatTurnRow.question === null || chatTurnRow.answer === null) {
			return []
		}

		// keep a pair only if both sides decrypt
		const question = decryptChatText(chatTurnRow.question)
		const answer = decryptChatText(chatTurnRow.answer)
		if (question === null || answer === null) {
			return []
		}

		// add the attachments sent with this question
		const attachments = attachmentsByChatTurnId.get(chatTurnRow.id) ?? []
		return [
			{
				question,
				answer,
				toolCalls: toChatToolCalls(chatTurnRow.toolCalls),
				at: chatTurnRow.createdAt.toISOString(),
				attachments,
			},
		]
	})

	// look up every question's and answer's first link preview in one query.
	// even indexes key the questions and odd ones the answers
	const linkPreviewEntries: [number, string][] = decryptedChatTurns.flatMap((chatTurn, index) => [
		[index * 2, chatTurn.question],
		[index * 2 + 1, chatTurn.answer],
	])
	const linkPreviewsByIndex = await loadChatLinkPreviews(new Map(linkPreviewEntries))
	return decryptedChatTurns.map((chatTurn, index) => ({
		...chatTurn,
		linkPreviews: linkPreviewsByIndex.get(index * 2) ?? [],
		answerLinkPreviews: linkPreviewsByIndex.get(index * 2 + 1) ?? [],
	}))
}

// the filter for a page's chat turn rows: a topic's, a team's own with no topic, or the new-topic chat's with neither
function toPageFilter(page: ChatPage): SQL | undefined {
	if (page.topicId !== undefined) {
		return eq(chatTurns.topicId, page.topicId)
	}
	// filter to the user's chat turns with no topic and no team for the new-topic chat
	if (page.teamId === undefined) {
		return and(isNull(chatTurns.topicId), isNull(chatTurns.teamId))
	}
	return and(eq(chatTurns.teamId, page.teamId), isNull(chatTurns.topicId))
}

// the tool calls that a stored chat turn made, empty if the chat turn row has none or the text does not decrypt
function toChatToolCalls(storedToolCalls: string | null): ChatToolCall[] {
	const toolCallsJson = storedToolCalls === null ? null : decryptChatText(storedToolCalls)
	if (toolCallsJson === null) {
		return []
	}
	// treat text that fails to parse as no tool calls
	try {
		return JSON.parse(toolCallsJson) as ChatToolCall[]
	} catch {
		return []
	}
}

/**
 * Clears the user's conversation on one page, and a topic's kept attachments with it.
 * The rows stay, so a clear never resets the month's spend.
 */
export async function clearChatTurns(userId: string, page: ChatPage): Promise<void> {
	// null the text and keep the rows
	await db
		.update(chatTurns)
		.set({ question: null, answer: null, toolCalls: null })
		.where(and(eq(chatTurns.userId, userId), toPageFilter(page)))

	// delete a topic's kept attachments. only a topic conversation stores any
	if (page.topicId) {
		await deleteChatAttachments(page.topicId, userId)
	}
}
