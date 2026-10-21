// the chat_turns rows: saving one for every chat turn, chat room turn, transcription, and speech call, and reading or
// clearing a user's conversation

import type { ChatTurnRow } from "@carlnotes/contracts/chat"
import { type ChatTurnKind, conversationChatTurnKinds, type PodcastEpisodeSpeaker } from "@carlnotes/contracts/enums"
import type { ChatToolCall, PodcastEpisodeChapterRef, VoiceChatPage } from "@carlnotes/contracts/payloads"
import { db } from "@carlnotes/db"
import { chatTurns } from "@carlnotes/db/schema/chat"
import { CHAT_COST_PER_MILLION_TOKENS, EXA_COST_PER_SEARCH, tokenCost } from "@carlnotes/models/budget"
import { trackEvent } from "@carlnotes/server/analytics"
import { and, desc, eq, inArray, isNotNull, isNull, type SQL } from "drizzle-orm"
import { isAllowed } from "../authorization"
import type { AnalyticsProperties } from "../currentUser"
import { deleteChatAttachments } from "./attachments"
import { loadTopicChatTurnAttachments } from "./chatAttachmentReads"
import { decryptChatJson, decryptChatText, encryptChatJson, encryptChatText } from "./encryption"
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

// which chat a page holds, as an analytics event names it
export type ChatKind = "topic" | "team" | "new_topic" | "room"

/**
 * Returns which chat a page holds: a topic's, a team's, the new-topic chat, or a chat room.
 */
export function toChatKind(page: ChatPage | VoiceChatPage): ChatKind {
	// a voice page names its kind
	if ("kind" in page) {
		return page.kind === "newTopic" ? "new_topic" : page.kind
	}
	if (page.newTopic) {
		return "new_topic"
	}
	return page.teamId ? "team" : "topic"
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
	// whether the question was spoken and the reply read aloud
	isSpoken: boolean
	// a podcast chat turn's podcast episode and chapter, and the speaker who answered it
	podcastEpisodeChapter?: PodcastEpisodeChapterRef
	podcastAnswerSpeaker?: PodcastEpisodeSpeaker
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
	// build the row and insert it
	const chatTurnRow = toChatTurnRow(chatTurnRowOptions)
	const [savedChatTurnRow] = await db.insert(chatTurns).values(chatTurnRow).returning({ id: chatTurns.id })

	// count the chat turn exactly when its row is saved. a podcast chat turn names who answered it
	const { userId, page, isSpoken } = chatTurnRowOptions
	trackEvent("chat_turn_sent", userId, {
		...analyticsProperties,
		topicId: toChatPageId(page),
		chatKind: toChatKind(page),
		chatTurnKind: chatTurnRow.kind,
		...(chatTurnRow.podcastAnswerSpeaker ? { speaker: chatTurnRow.podcastAnswerSpeaker } : {}),
		isSpoken,
	})
	return savedChatTurnRow?.id ?? null
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
	isSpoken,
	podcastEpisodeChapter,
	podcastAnswerSpeaker,
}: ToChatTurnRowOptions): typeof chatTurns.$inferInsert {
	// return the row. a chat turn that does not persist stores null text and only its spend.
	// a podcast chat turn also names its podcast episode, its chapter, and who answered it
	return {
		kind: podcastEpisodeChapter ? "podcast" : "private",
		userId,
		topicId: page.topicId ?? null,
		teamId: page.teamId ?? null,
		...toSpendColumns({ totalTokens, cost: toChatTurnCost({ totalTokens, searchCount }) }),
		question: isPersisted ? encryptChatText(question) : null,
		answer: isPersisted ? encryptChatText(answer) : null,
		// the tool calls as encrypted json
		toolCalls: isPersisted && toolCalls.length > 0 ? encryptChatJson(toolCalls) : null,
		isSpoken,
		podcastEpisodeId: podcastEpisodeChapter?.podcastEpisodeId ?? null,
		chapterPosition: podcastEpisodeChapter?.chapterPosition ?? null,
		podcastAnswerSpeaker: podcastEpisodeChapter ? (podcastAnswerSpeaker ?? "host") : null,
	}
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

// what a chat turn's completion cost: its tokens priced as a scan does, plus what the web searches cost
function toChatTurnCost({ totalTokens, searchCount }: ChatTurnSpend): number {
	return tokenCost(totalTokens, CHAT_COST_PER_MILLION_TOKENS) + searchCount * EXA_COST_PER_SEARCH
}

type ToSpendColumnsOptions = { totalTokens: number; cost: number }

// the spend that every chat turn row stores: its token total and its cost, to six decimals
function toSpendColumns({
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

/**
 * Loads the user's whole conversation on one page, oldest chat turn first.
 */
export async function loadChatTurns(userId: string | null, page: ChatPage): Promise<ChatTurnRow[]> {
	// return nothing for a visitor, or for a user whose chat text the gate does not keep
	if (!userId || !(await isAllowed(userId, "chat:persist"))) {
		return []
	}

	// read the page's conversation rows that kept their text newest first, and the attachments sent with them.
	// an unpersisted or cleared chat turn has no text. only a topic conversation stores attachments
	const [chatTurnRows, attachmentsByChatTurnId] = await Promise.all([
		db
			.select({
				id: chatTurns.id,
				question: chatTurns.question,
				answer: chatTurns.answer,
				toolCalls: chatTurns.toolCalls,
				isSpoken: chatTurns.isSpoken,
				podcastEpisodeId: chatTurns.podcastEpisodeId,
				chapterPosition: chatTurns.chapterPosition,
				podcastAnswerSpeaker: chatTurns.podcastAnswerSpeaker,
				createdAt: chatTurns.createdAt,
			})
			.from(chatTurns)
			.where(
				and(
					eq(chatTurns.userId, userId),
					toPageFilter(page),
					isNotNull(chatTurns.question),
					isNotNull(chatTurns.answer),
				),
			)
			.orderBy(desc(chatTurns.createdAt)),
		page.topicId ? loadTopicChatTurnAttachments(userId, page.topicId) : new Map<string, never[]>(),
	])

	// decrypt each stored pair in reading order, dropping any text that fails to verify. the null check narrows the
	// row's type, the query already kept the text
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
				isSpoken: chatTurnRow.isSpoken,
				...toChatTurnRowPodcastFields(chatTurnRow),
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

// a stored row's speaker and podcast episode chapter: a podcast chat turn's own, or host and no chapter for a private
// chat turn
function toChatTurnRowPodcastFields({
	podcastEpisodeId,
	chapterPosition,
	podcastAnswerSpeaker,
}: Pick<typeof chatTurns.$inferSelect, "podcastEpisodeId" | "chapterPosition" | "podcastAnswerSpeaker">): Pick<
	ChatTurnRow,
	"speaker" | "podcastEpisodeChapter"
> {
	return {
		speaker: podcastAnswerSpeaker ?? "host",
		podcastEpisodeChapter:
			podcastEpisodeId !== null && chapterPosition !== null ? { podcastEpisodeId, chapterPosition } : null,
	}
}

// the filter for a page's conversation rows: a topic's private and podcast chat turns, a team's own private chat turns
// with no topic, or the new-topic chat's private chat turns with neither
function toPageFilter(page: ChatPage): SQL | undefined {
	if (page.topicId !== undefined) {
		return and(eq(chatTurns.topicId, page.topicId), inArray(chatTurns.kind, conversationChatTurnKinds))
	}
	// filter to the user's chat turns with no topic and no team for the new-topic chat
	if (page.teamId === undefined) {
		return and(isNull(chatTurns.topicId), isNull(chatTurns.teamId), eq(chatTurns.kind, "private"))
	}
	return and(eq(chatTurns.teamId, page.teamId), isNull(chatTurns.topicId), eq(chatTurns.kind, "private"))
}

// the tool calls that a stored chat turn made, empty if the row has none or its text does not decrypt or parse
function toChatToolCalls(storedToolCalls: string | null): ChatToolCall[] {
	return (decryptChatJson(storedToolCalls) as ChatToolCall[] | null) ?? []
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
