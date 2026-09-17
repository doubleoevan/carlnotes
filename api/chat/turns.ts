// one chat turn end to end: authorizing it, streaming the worker's reply, sending the tool calls, and metering it
import { zValidator } from "@hono/zod-validator"
import { trackEvent } from "@shared/analytics"
import {
	type ChatAttachment,
	type ChatConversation,
	type ChatToolCall,
	type ChatTurnPayload,
	type ChatTurnRow,
	chatTurnPayload,
	EMPTY_TOPIC_DRAFT,
	type TopicDraft,
	type TopicDraftTeam,
	type TopicToolCalls,
	toChatReplyLineText,
	withAttachmentNote,
} from "@shared/contracts"
import { reportError } from "@shared/monitoring"
import { ADMIN_QUOTA } from "@shared/plans"
import type { Tool } from "ai"
import { and, desc, eq, isNull, type SQL } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { stream } from "hono/streaming"
import { db } from "../../db"
import { chatTurns, topics, users } from "../../db/schema"
import { type ChatReplyStream, isBudgetRejection, SPENT_BUDGET_REJECTION, streamChatReply } from "../../worker"
import { CHAT_COST_PER_MILLION_TOKENS, EXA_COST_PER_SEARCH, tokenCost } from "../../worker/budget"
import { isAllowed, isLeaderRole, isMonthlySpendExhausted, topicLimit, topicsRemaining } from "../authorization"
import type { AnalyticsProperties } from "../currentUser"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { toolCallerRateLimiter } from "../rateLimit"
import { loadTeamSummaries } from "../team/helpers"
import { toTeamRole } from "../team/members"
import {
	type ChatTurnToolCalls,
	toChatTopicTools,
	toNewTopicChatTools,
	toOpenNewTopicChatTool,
	toSuggestTopicSourcesTool,
	toTopicEditPreviewTools,
} from "../tool/chatTools"
import { deleteTopicDraft, loadTopicDraft, saveTopicDraft } from "../topic/topicDrafts"
import {
	deleteChatAttachments,
	loadKeptTopicAttachments,
	loadTopicChatTurnAttachments,
	resolveChatAttachments,
	storeTopicChatAttachments,
} from "./attachments"
import { decryptChatText, encryptChatText } from "./encryption"
import { loadChatLinkPreviews, saveLinkPreviews } from "./linkPreviews"

// one body limit for every chat post, sized for a question plus its data url attachments
export const chatBodyLimit = bodyLimit({
	maxSize: 26 * 1024 * 1024,
	onError: (context) => context.json({ error: "Those attachments are too large." }, 413),
})

// the outcomes of a chat turn request
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type ChatTurnAuthorization = { status: "allowed"; isTopicOwner: boolean; isPersisted: boolean; canEditTopic: boolean; litellmApiKey?: string; topicsRemaining?: number; leaderTeams?: TopicDraftTeam[] } | { status: "signup" } | { status: "forbidden" } | { status: "budget" }

// the page a private conversation lives under: one topic, a whole team, or the new-topic chat, bound to neither
export type ChatPage =
	| { topicId: string; teamId?: undefined; newTopic?: undefined }
	| { teamId: string; topicId?: undefined; newTopic?: undefined }
	| { newTopic: true; topicId?: undefined; teamId?: undefined }

// pick the page's filter over the ledger: a topic's chat turns, a team's own with no topic set, or the user's with neither
function toPageFilter(page: ChatPage): SQL | undefined {
	if (page.topicId !== undefined) {
		return eq(chatTurns.topicId, page.topicId)
	}
	// filter to the user's turns with no topic and no team for the new-topic chat
	if (page.teamId === undefined) {
		return and(isNull(chatTurns.topicId), isNull(chatTurns.teamId))
	}
	return and(eq(chatTurns.teamId, page.teamId), isNull(chatTurns.topicId))
}

/**
 * Whether this user may take a chat turn on the topic right now, and how that chat turn should be saved.
 * A signed-out visitor on a visible topic is sent to signup, so no anonymous chat turn ever spends.
 */
export async function authorizeChatTurn(userId: string | null, topicId: string): Promise<ChatTurnAuthorization> {
	// a missing topic is rejected the same way an invisible one is
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

	// the one rejection left for a signed-in user who can see the topic is the budget
	if (!(await isAllowed(userId, "chat:send", topic))) {
		return { status: "budget" }
	}

	// the gate decides whether the chat turn keeps its text and whether the user may edit the topic.
	// its model calls bill to the user's own key
	const [isPersisted, canEditTopic, [userRow]] = await Promise.all([
		isAllowed(userId, "chat:persist"),
		isAllowed(userId, "topic:edit", topic),
		db.select({ litellmVirtualKey: users.litellmVirtualKey }).from(users).where(eq(users.id, userId)),
	])
	return {
		status: "allowed",
		isTopicOwner: topic.ownerId === userId,
		isPersisted,
		canEditTopic,
		litellmApiKey: userRow?.litellmVirtualKey ?? undefined,
	}
}

/**
 * Whether this user may take a team-wide chat turn: a signed-in, active member under budget.
 */
export async function authorizeTeamChatTurn(userId: string | null, teamId: string): Promise<ChatTurnAuthorization> {
	if (!userId) {
		return { status: "signup" }
	}
	// membership stands where topic visibility stands for a topic chat
	if ((await toTeamRole(userId, teamId)) === null) {
		return { status: "forbidden" }
	}
	if (await isMonthlySpendExhausted(userId)) {
		return { status: "budget" }
	}

	// the gate decides whether the chat turn keeps its text, and its model calls bill to the user's own key
	const [isPersisted, [userRow]] = await Promise.all([
		isAllowed(userId, "chat:persist"),
		db.select({ litellmVirtualKey: users.litellmVirtualKey }).from(users).where(eq(users.id, userId)),
	])
	return {
		status: "allowed",
		isTopicOwner: false,
		isPersisted,
		canEditTopic: false,
		litellmApiKey: userRow?.litellmVirtualKey ?? undefined,
	}
}

/**
 * Decides whether this user may take a chat turn in the new-topic chat: a visitor is sent to signup, and a signed-in
 * user is gated by their monthly spend alone.
 */
export async function authorizeNewTopicChatTurn(userId: string | null): Promise<ChatTurnAuthorization> {
	if (!userId) {
		return { status: "signup" }
	}
	if (await isMonthlySpendExhausted(userId)) {
		return { status: "budget" }
	}

	// the gate decides whether the chat turn keeps its text and how many more topics the plan holds.
	// the model calls bill to the user's own key
	const [isPersisted, remainingTopics, [userRow], teamSummaries] = await Promise.all([
		isAllowed(userId, "chat:persist"),
		topicsRemaining(userId),
		db.select({ litellmVirtualKey: users.litellmVirtualKey }).from(users).where(eq(users.id, userId)),
		loadTeamSummaries(userId),
	])
	return {
		status: "allowed",
		isTopicOwner: false,
		isPersisted,
		canEditTopic: false,
		litellmApiKey: userRow?.litellmVirtualKey ?? undefined,
		topicsRemaining: remainingTopics,
		// the teams the user leads, which carl may put the topic on
		leaderTeams: teamSummaries
			.filter((teamSummary) => isLeaderRole(teamSummary.role))
			.map((teamSummary) => ({ teamId: teamSummary.teamId, name: teamSummary.name })),
	}
}

// whether the user owns no topic yet
async function ownsNoTopic(userId: string | null): Promise<boolean> {
	if (!userId) {
		return false
	}
	const [ownedTopic] = await db.select({ id: topics.id }).from(topics).where(eq(topics.ownerId, userId)).limit(1)
	return ownedTopic === undefined
}

/**
 * Record a finished chat turn's spend, keeping its text only when the gate allows the user that, and answer its id.
 * A chat turn that streamed and then failed still saves, so a partial chat turn is never free.
 */
export async function saveChatTurn(
	userId: string,
	page: ChatPage,
	totalTokens: number,
	searchCount: number,
	isPersisted: boolean,
	question: string,
	answer: string,
	toolCalls: ChatToolCall[],
	analyticsProperties: AnalyticsProperties,
): Promise<string | null> {
	// the id comes back so the attachments sent with the question can point at this chat turn
	const [chatTurnRow] = await db
		.insert(chatTurns)
		.values(
			toChatTurnRow(
				userId,
				page.topicId ?? null,
				totalTokens,
				searchCount,
				isPersisted,
				question,
				answer,
				page.teamId,
				toolCalls,
			),
		)
		.returning({ id: chatTurns.id })

	// the event is written with the row, so a chat turn is counted exactly when it is metered
	trackEvent("chat_turn_sent", userId, { ...analyticsProperties, topicId: page.topicId ?? page.teamId ?? "" })
	return chatTurnRow?.id ?? null
}

/**
 * Record a chat room completion into the same chat ledger a private chat turn writes, with the chat room message it
 * answered and its token total. The billed member's monthly budget reads this row like any other.
 */
export async function recordChatRoomTurn(
	userId: string,
	topicId: string | null,
	teamId: string,
	chatRoomMessageId: number,
	completion: { totalTokens: number; searchCount: number },
): Promise<void> {
	// the text lives in the chat room's messages, so the ledger row stores only the meter and the reference
	const chatTurnRow = toChatTurnRow(userId, topicId, completion.totalTokens, completion.searchCount, false, "", "")
	await db.insert(chatTurns).values({
		...chatTurnRow,
		roomMessageId: chatRoomMessageId,
		teamId: topicId === null ? teamId : null,
		totalTokens: completion.totalTokens,
	})
}

/**
 * The row one finished chat turn writes. Its cost is the same best-effort token total a scan uses plus what its
 * web searches cost.
 */
export function toChatTurnRow(
	userId: string,
	topicId: string | null,
	totalTokens: number,
	searchCount: number,
	isPersisted: boolean,
	question: string,
	answer: string,
	teamId?: string,
	toolCalls: ChatToolCall[] = [],
): typeof chatTurns.$inferInsert {
	// a chat turn that does not persist stores null text, so its row is a meter entry and nothing more
	return {
		userId,
		topicId,
		teamId: teamId ?? null,
		cost: (tokenCost(totalTokens, CHAT_COST_PER_MILLION_TOKENS) + searchCount * EXA_COST_PER_SEARCH).toFixed(6),
		question: isPersisted ? encryptChatText(question) : null,
		answer: isPersisted ? encryptChatText(answer) : null,
		// the tool calls as encrypted json
		toolCalls: isPersisted && toolCalls.length > 0 ? encryptChatText(JSON.stringify(toolCalls)) : null,
	}
}

/**
 * The user's stored chat turns for a topic, oldest first. The whole conversation.
 */
export async function loadChatTurns(userId: string | null, page: ChatPage): Promise<ChatTurnRow[]> {
	// a visitor, or anyone the gate rejects persistence, has nothing stored to read
	if (!userId || !(await isAllowed(userId, "chat:persist"))) {
		return []
	}

	// the conversation newest first off the index, beside the attachments that were sent with it.
	// a team conversation stores no attachments, so its lookup is an empty map
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

	// decrypt each stored pair back into reading order, dropping the meter-only rows and any text that fails to verify
	const decryptedChatTurns = chatTurnRows.reverse().flatMap((chatTurnRow) => {
		if (chatTurnRow.question === null || chatTurnRow.answer === null) {
			return []
		}

		// a pair is replayed only when both sides decrypt
		const question = decryptChatText(chatTurnRow.question)
		const answer = decryptChatText(chatTurnRow.answer)
		if (question === null || answer === null) {
			return []
		}

		// what was sent with this question, which the bubble shows again
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

	// each question's and answer's first link resolves against the shared link preview cache in one query.
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

// the tool calls a stored chat turn made, empty when the chat turn row has none or the text does not decrypt
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
 * Clear the user's conversation with a topic: every chat turn's text is set to null,
 * and everything they kept for the topic is deleted with it. The chat turn rows stay as the spend ledger,
 * because deleting them would let a cleared chat reset the month's budget meter.
 */
export async function clearChatTurns(userId: string, chatPage: ChatPage): Promise<void> {
	await db
		.update(chatTurns)
		.set({ question: null, answer: null, toolCalls: null })
		.where(and(eq(chatTurns.userId, userId), toPageFilter(chatPage)))

	// a team conversation stores no attachments, so only a topic clear has files to take with it
	if (chatPage.topicId) {
		await deleteChatAttachments(chatPage.topicId, userId)
	}
}

// stream a chat reply to the user
function streamChatTurn(
	context: Context,
	reply: ChatReplyStream,
	chatTurn: {
		userId: string
		page: ChatPage
		question: string
		isPersisted: boolean
		// what the topic tools did
		toolCalls: ChatTurnToolCalls
		attachments: ChatAttachment[]
		litellmApiKey?: string
		analyticsProperties: AnalyticsProperties
	},
): Response {
	return stream(context, async (writeStream) => {
		// forward the reply, with the tool calls as each tool returns
		try {
			await writeReplyStream(writeStream, reply, chatTurn.toolCalls)
		} catch (error) {
			// a stream that breaks partway still spent tokens, so it falls through to the save below
			console.error(`chat stream failed for ${chatTurn.page.topicId ?? chatTurn.page.teamId}`, error)
			// a spent budget is the user's to know about, and the stream is the only place left to show it.
			// anything else closes with the failed line
			let closingLine = toChatReplyLineText({ type: "text", text: `\n\n${SPENT_BUDGET_REJECTION}` })
			if (!isBudgetRejection(error)) {
				reportError(error, "chat", { topicId: chatTurn.page.topicId ?? chatTurn.page.teamId ?? "" })
				closingLine = toChatReplyLineText({ type: "failed" })
			}

			// a user who already left cannot be written to, and that must not skip the save below
			try {
				await writeStream.write(closingLine)
			} catch (closingError) {
				console.error("chat stream close failed", closingError)
			}
		}

		// save the spend whether the stream finished or broke, so a partial chat turn is never free
		const chatTurnId = await saveFinishedChatTurn(reply, chatTurn)

		// store the topic draft the chat turn wrote. a chat turn that created the topic already deleted it
		if (chatTurn.toolCalls.topicDraft && !chatTurn.toolCalls.createdTopicId) {
			await saveTopicDraft(chatTurn.userId, chatTurn.toolCalls.topicDraft).catch((error) => {
				console.error("topic draft save failed", error)
				reportError(error, "chat")
			})
		}

		// store what was sent once the reply has finished. the summaries take seconds, so they run on
		// past the closed stream. a team conversation stores none
		const storedTopicId = chatTurn.page.topicId
		if (storedTopicId !== undefined) {
			storeTopicChatAttachments(
				chatTurn.userId,
				storedTopicId,
				chatTurnId,
				chatTurn.attachments,
				chatTurn.litellmApiKey,
			).catch((error) => {
				console.error(`storing chat attachments failed for topic ${storedTopicId}`, error)
				reportError(error, "chat", { topicId: storedTopicId })
			})
		}
	})
}

/**
 * Forwards each text part as it arrives, and the tool calls the api client has not been sent each time a tool returns.
 */
export async function writeReplyStream(
	writeStream: { write: (text: string) => Promise<unknown> },
	reply: Pick<ChatReplyStream, "replyParts">,
	toolCalls: ChatTurnToolCalls,
): Promise<void> {
	const sentToolCalls: SentToolCalls = {
		topicSaveCount: 0,
		topicSaveRejectionCount: 0,
		chatToolCallCount: 0,
		isCreatedTopicSent: false,
		isNewTopicChatSent: false,
		isTopicEditCancelledSent: false,
	}
	// collect the tool calls in the order they returned
	const chatToolCalls: ChatToolCall[] = []
	// forward each text part, and write the tool calls the api client has not been sent when a tool returns
	for await (const replyPart of reply.replyParts) {
		if (replyPart.type === "text") {
			await writeStream.write(toChatReplyLineText({ type: "text", text: replyPart.text }))
			continue
		}
		chatToolCalls.push(replyPart.toolCall)
		await writeUnsentToolCalls(writeStream, toolCalls, chatToolCalls, sentToolCalls)
	}
	// write again, so a tool that returned after the last part still reaches the api client
	await writeUnsentToolCalls(writeStream, toolCalls, chatToolCalls, sentToolCalls)
}

// the tool calls the api client has been sent so far
type SentToolCalls = {
	// how much of each list the api client already has
	topicSaveCount: number
	topicSaveRejectionCount: number
	chatToolCallCount: number
	// the ones that go out once each
	isCreatedTopicSent: boolean
	isNewTopicChatSent: boolean
	isTopicEditCancelledSent: boolean
	// the two compared by their json, so carl rewriting one sends it again
	topicDraftJson?: string
	proposedTopicEditJson?: string
}

// write the tool calls the api client has not been sent, and count them as sent
async function writeUnsentToolCalls(
	writeStream: { write: (text: string) => Promise<unknown> },
	toolCalls: ChatTurnToolCalls,
	chatToolCalls: ChatToolCall[],
	sentToolCalls: SentToolCalls,
): Promise<void> {
	const unsentToolCalls = toUnsentToolCalls(toolCalls, chatToolCalls, sentToolCalls)
	if (!unsentToolCalls) {
		return
	}
	// read the two compared by their json before the write, since a tool may rewrite either one during it
	const writtenTopicDraftJson = unsentToolCalls.topicDraft ? JSON.stringify(unsentToolCalls.topicDraft) : undefined
	const writtenProposedTopicEditJson = unsentToolCalls.proposedTopicEdit
		? JSON.stringify(unsentToolCalls.proposedTopicEdit)
		: undefined
	await writeStream.write(toChatReplyLineText({ type: "toolCalls", toolCalls: unsentToolCalls }))
	// count only what was just written as sent. a tool that finished during the write goes out with the next line
	sentToolCalls.topicSaveCount += unsentToolCalls.topicSaves.length
	sentToolCalls.topicSaveRejectionCount += unsentToolCalls.topicSaveRejections.length
	sentToolCalls.chatToolCallCount += unsentToolCalls.chatToolCalls?.length ?? 0
	// mark the topic draft as sent until it changes, and the created topic once
	if (writtenTopicDraftJson) {
		sentToolCalls.topicDraftJson = writtenTopicDraftJson
	}
	if (unsentToolCalls.createdTopicId) {
		sentToolCalls.isCreatedTopicSent = true
	}
	// mark the opened new-topic chat as sent once
	if (unsentToolCalls.isNewTopicChatOpened) {
		sentToolCalls.isNewTopicChatSent = true
	}
	// mark the cancelled edit as sent once
	if (unsentToolCalls.isTopicEditCancelled) {
		sentToolCalls.isTopicEditCancelledSent = true
	}
	// mark the proposed edit as sent until carl revises it
	if (writtenProposedTopicEditJson) {
		sentToolCalls.proposedTopicEditJson = writtenProposedTopicEditJson
	}
}

// the tool calls the api client has not been sent, null when nothing new happened
function toUnsentToolCalls(
	toolCalls: ChatTurnToolCalls,
	chatToolCalls: ChatToolCall[],
	sentToolCalls: SentToolCalls,
): TopicToolCalls | null {
	const topicSaves = toolCalls.topicSaves.slice(sentToolCalls.topicSaveCount)
	const topicSaveRejections = toolCalls.topicSaveRejections.slice(sentToolCalls.topicSaveRejectionCount)
	const unsentChatToolCalls = chatToolCalls.slice(sentToolCalls.chatToolCallCount)
	// a topic draft and a proposal each count as unsent until carl rewrites them, so both compare by their json
	const topicDraftJson = toolCalls.topicDraft ? JSON.stringify(toolCalls.topicDraft) : undefined
	const topicDraft = topicDraftJson !== sentToolCalls.topicDraftJson ? toolCalls.topicDraft : undefined
	// the created topic, the opened new-topic chat and a cancelled edit each go out once
	const createdTopicId = sentToolCalls.isCreatedTopicSent ? undefined : toolCalls.createdTopicId
	const isNewTopicChatOpened = !sentToolCalls.isNewTopicChatSent && toolCalls.isNewTopicChatOpened ? true : undefined
	const isTopicEditCancelled =
		!sentToolCalls.isTopicEditCancelledSent && toolCalls.isTopicEditCancelled ? true : undefined
	const proposedTopicEditJson = toolCalls.proposedTopicEdit ? JSON.stringify(toolCalls.proposedTopicEdit) : undefined
	const proposedTopicEdit =
		proposedTopicEditJson !== sentToolCalls.proposedTopicEditJson ? toolCalls.proposedTopicEdit : undefined
	// whether every one of them has already gone out
	const isEveryToolCallSent =
		topicSaves.length === 0 &&
		topicSaveRejections.length === 0 &&
		unsentChatToolCalls.length === 0 &&
		// and none of the tool calls that go out once each is still waiting
		!topicDraft &&
		!createdTopicId &&
		!isNewTopicChatOpened &&
		!proposedTopicEdit &&
		!isTopicEditCancelled
	if (isEveryToolCallSent) {
		return null
	}
	// return only what is new, so the api client applies each tool call once
	return {
		topicSaves,
		topicSaveRejections,
		topicDraft,
		createdTopicId,
		isNewTopicChatOpened,
		proposedTopicEdit,
		isTopicEditCancelled,
		chatToolCalls: unsentChatToolCalls.length > 0 ? unsentChatToolCalls : undefined,
	}
}

// save the finished chat turn's spend and text, and fetch the answer's link preview in the background.
// null if the chat turn stored no text or the save failed
async function saveFinishedChatTurn(
	reply: ChatReplyStream,
	chatTurn: {
		userId: string
		page: ChatPage
		question: string
		isPersisted: boolean
		// what the topic tools did
		toolCalls: ChatTurnToolCalls
		analyticsProperties: AnalyticsProperties
	},
): Promise<string | null> {
	try {
		// save the chat turn. a topic tool call keeps the chat turn's text even when the gate rejects persistence
		const { text, totalTokens, searchCount, toolCalls } = await reply.completion
		const isChatTurnPersisted = chatTurn.isPersisted || chatTurn.toolCalls.count > 0
		const savedChatTurnId = await saveChatTurn(
			chatTurn.userId,
			chatTurn.page,
			totalTokens,
			searchCount,
			isChatTurnPersisted,
			chatTurn.question,
			text,
			toolCalls,
			chatTurn.analyticsProperties,
		)

		// the answer's first link fetches its link preview card in the background, like the question's
		if (isChatTurnPersisted) {
			void saveLinkPreviews(text).catch((error) => console.error("chat link preview failed", error))
		}

		// a chat turn that stored no text has no bubble for an attachment to show in
		return isChatTurnPersisted ? savedChatTurnId : null
	} catch (error) {
		console.error(`chat turn save failed for ${chatTurn.page.topicId ?? chatTurn.page.teamId}`, error)
		reportError(error, "chat", { topicId: chatTurn.page.topicId ?? chatTurn.page.teamId ?? "" })
		return null
	}
}

// the response each unallowed authorization status answers with
function toChatRejection(context: Context, status: "budget" | "signup" | "forbidden"): Response {
	if (status === "budget") {
		return context.json({ error: "budget exhausted" }, 402)
	}
	if (status === "signup") {
		return context.json({ error: "sign up required" }, 401)
	}

	// anything else is a topic this user may not chat on
	return context.json({ error: "forbidden" }, 403)
}

// the tools one turn offers: the topic tools to an editor's turn on a topic, the draft tools to the new-topic chat,
// and none to anyone else
function toChatTurnTools(
	userId: string,
	page: ChatPage,
	canEditTopic: boolean,
	topicDraft: TopicDraft | undefined,
	toolCalls: ChatTurnToolCalls,
	analyticsProperties: AnalyticsProperties,
): { tools?: ReturnType<typeof toChatTopicTools>; suggestSourcesTool?: Tool } {
	if (page.newTopic) {
		// copy the empty topic draft. the tools write into this object, and EMPTY_TOPIC_DRAFT is frozen
		const chatTurnTopicDraft = topicDraft ?? { ...EMPTY_TOPIC_DRAFT }
		const newTopicToolBinding = { userId, toolCalls, topicDraft: chatTurnTopicDraft, analyticsProperties }
		return {
			tools: toNewTopicChatTools(newTopicToolBinding),
			suggestSourcesTool: toSuggestTopicSourcesTool(newTopicToolBinding),
		}
	}
	// the suggestion tool belongs to the new-topic chat alone
	return {
		tools: canEditTopic && page.topicId ? toChatTopicTools({ userId, topicId: page.topicId, toolCalls }) : undefined,
	}
}

// how many more topics the plan allows, as the prompt states it. an admin's unlimited marker reads as no limit at all
function toPromptTopicsRemaining(remainingTopics: number | undefined): number | undefined {
	return remainingTopics === undefined || remainingTopics >= ADMIN_QUOTA ? undefined : remainingTopics
}

/**
 * The topic draft the new-topic chat starts a chat turn from. A stored draft replaces the browser's copy. The team comes
 * from the browser when it sends one.
 */
async function toNewTopicChatDraft(userId: string, browserTopicDraft?: TopicDraft): Promise<TopicDraft | undefined> {
	const storedTopicDraft = await loadTopicDraft(userId)
	if (!storedTopicDraft) {
		return browserTopicDraft
	}
	return { ...storedTopicDraft, team: browserTopicDraft?.team ?? storedTopicDraft.team }
}

// the reply every chat POST route streams once authorization allows
async function answerChatTurn(
	context: Context,
	userId: string,
	page: ChatPage,
	authorization: {
		isTopicOwner: boolean
		isPersisted: boolean
		canEditTopic: boolean
		litellmApiKey?: string
		topicsRemaining?: number
		leaderTeams?: TopicDraftTeam[]
	},
	payload: ChatTurnPayload,
	includeAttachments: boolean,
): Promise<Response> {
	// an attached file becomes its extracted text here, and an unreadable one rejects the chat turn in words
	const { question, history, attachments } = payload
	const chatAttachments = await resolveChatAttachments(attachments)
	if (chatAttachments === null) {
		return context.json({ error: "That file couldn't be read." }, 422)
	}

	// load the topic draft the new-topic chat's tools read and write
	const topicDraft = page.newTopic ? await toNewTopicChatDraft(userId, payload.topicDraft) : undefined

	// offer the topic tools to an editor's turn on a topic, and the draft tools to the new-topic chat
	const toolCalls: ChatTurnToolCalls = { count: 0, topicSaves: [], topicSaveRejections: [] }
	const { tools: chatTurnTools, suggestSourcesTool } = toChatTurnTools(
		userId,
		page,
		authorization.canEditTopic,
		topicDraft,
		toolCalls,
		toAnalyticsProperties(context),
	)

	// the reply reads against the page's own material: one topic, every topic the team holds, or nothing but the draft
	const chatReply = await streamChatReply({
		// the tool that opens the new-topic chat
		openNewTopicChatTool: page.newTopic ? undefined : toOpenNewTopicChatTool({ toolCalls }),
		// the tools that put a proposed change on the topic's card and take it back off
		...(authorization.canEditTopic && page.topicId ? toTopicEditPreviewTools({ toolCalls }) : {}),
		topicId: page.topicId,
		teamId: page.teamId,
		newTopic: page.newTopic,
		topicDraft,
		topicsRemaining: toPromptTopicsRemaining(authorization.topicsRemaining),
		leaderTeams: authorization.leaderTeams,
		question,
		history,
		chatAttachments,
		userId,
		isTopicOwner: authorization.isTopicOwner,
		litellmApiKey: authorization.litellmApiKey,
		includeAttachments,
		tools: chatTurnTools,
		suggestSourcesTool,
	})
	if (!chatReply) {
		return context.json({ error: "not found" }, 404)
	}

	// the question's first link fetches its link preview card in the background, never delaying the reply
	if (authorization.isPersisted) {
		void saveLinkPreviews(question).catch((error) => console.error("chat link preview failed", error))
	}

	// the stored question names its attachments
	return streamChatTurn(context, chatReply, {
		userId,
		page,
		question: withAttachmentNote(question, attachments),
		isPersisted: authorization.isPersisted,
		toolCalls,
		attachments,
		litellmApiKey: authorization.litellmApiKey,
		analyticsProperties: toAnalyticsProperties(context),
	})
}

// the chat routes: the conversation, clearing it, and the streamed reply
export const chatRoute = new Hono<AppEnv>()
	.get("/topics/:id/chat", async (context) => {
		// what the panel opens with. the user's stored conversation, what they have kept, and whether they may chat
		const userId = currentUser(context)
		const topicId = context.req.param("id")
		const [chatTurns, authorization, keptAttachments] = await Promise.all([
			loadChatTurns(userId, { topicId }),
			authorizeChatTurn(userId, topicId),
			loadKeptTopicAttachments(userId, topicId),
		])

		// the payload the chat panel renders from
		const chatConversation: ChatConversation = {
			chatTurns,
			canChat: authorization.status === "allowed",
			isSignupRequired: authorization.status === "signup",
			isBudgetExhausted: authorization.status === "budget",
			keptAttachments,
			canEditTopic: authorization.status === "allowed" && authorization.canEditTopic,
		}
		return context.json(chatConversation)
	})
	.get("/teams/:id/chat", async (context) => {
		// the team-wide conversation the panel opens with. a team chat keeps no attachments of its own
		const userId = currentUser(context)
		const teamId = context.req.param("id")
		const [chatTurns, authorization] = await Promise.all([
			loadChatTurns(userId, { teamId }),
			authorizeTeamChatTurn(userId, teamId),
		])

		// the payload the chat panel renders from, in the topic conversation's own shape
		const chatConversation: ChatConversation = {
			chatTurns,
			canChat: authorization.status === "allowed",
			isSignupRequired: authorization.status === "signup",
			isBudgetExhausted: authorization.status === "budget",
			keptAttachments: [],
			canEditTopic: false,
		}
		return context.json(chatConversation)
	})
	.delete("/teams/:id/chat", async (context) => {
		// clear the conversation text and keep the spend rows
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "sign up required" }, 401)
		}
		await clearChatTurns(userId, { teamId: context.req.param("id") })
		return context.json({ ok: true })
	})
	.post(
		"/teams/:id/chat",
		toolCallerRateLimiter,
		chatBodyLimit,
		zValidator("json", chatTurnPayload),
		async (context) => {
			// membership authorizes the chat turn, and each rejection keeps its own status
			const userId = currentUser(context)
			const teamId = context.req.param("id")
			const authorization = await authorizeTeamChatTurn(userId, teamId)
			if (authorization.status !== "allowed" || !userId) {
				return toChatRejection(context, authorization.status === "allowed" ? "signup" : authorization.status)
			}

			// the member's own kept files stay out, matching the chat room
			return answerChatTurn(context, userId, { teamId }, authorization, context.req.valid("json"), false)
		},
	)
	.get("/chat/new-topic", async (context) => {
		// load the new-topic conversation and whether this is the user's first topic
		const userId = currentUser(context)
		const [chatTurns, authorization, isFirstTopic, planTopicLimit, topicDraft] = await Promise.all([
			loadChatTurns(userId, { newTopic: true }),
			authorizeNewTopicChatTurn(userId),
			ownsNoTopic(userId),
			userId ? topicLimit(userId) : Promise.resolve(undefined),
			loadTopicDraft(userId),
		])

		// the payload the chat panel renders from, in the topic conversation's own shape
		const chatConversation: ChatConversation = {
			chatTurns,
			canChat: authorization.status === "allowed",
			isSignupRequired: authorization.status === "signup",
			isBudgetExhausted: authorization.status === "budget",
			keptAttachments: [],
			canEditTopic: false,
			isFirstTopic,
			topicsRemaining: authorization.status === "allowed" ? authorization.topicsRemaining : undefined,
			topicLimit: planTopicLimit,
			topicDraft: topicDraft ?? undefined,
		}
		return context.json(chatConversation)
	})
	.delete("/chat/new-topic", async (context) => {
		// clear the conversation text and keep the spend rows
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "sign up required" }, 401)
		}
		// delete the topic draft with its conversation
		await Promise.all([clearChatTurns(userId, { newTopic: true }), deleteTopicDraft(userId)])
		return context.json({ ok: true })
	})
	.post(
		"/chat/new-topic",
		toolCallerRateLimiter,
		chatBodyLimit,
		zValidator("json", chatTurnPayload),
		async (context) => {
			// authorize the chat turn by session, each rejection with its own status
			const userId = currentUser(context)
			const authorization = await authorizeNewTopicChatTurn(userId)
			if (authorization.status !== "allowed" || !userId) {
				return toChatRejection(context, authorization.status === "allowed" ? "signup" : authorization.status)
			}

			// answer the turn, its files read for the turn and stored nowhere
			return answerChatTurn(context, userId, { newTopic: true }, authorization, context.req.valid("json"), false)
		},
	)
	.delete("/topics/:id/chat", async (context) => {
		// clearing a chat wipes the chat owner's conversation text while the spend rows stay
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "sign up required" }, 401)
		}
		await clearChatTurns(userId, { topicId: context.req.param("id") })
		return context.json({ ok: true })
	})
	.post(
		"/topics/:id/chat",
		toolCallerRateLimiter,
		chatBodyLimit,
		zValidator("json", chatTurnPayload),
		async (context) => {
			// authorize the chat turn first. each rejection reads differently to the user, so each gets its own status
			const userId = currentUser(context)
			const topicId = context.req.param("id")
			const authorization = await authorizeChatTurn(userId, topicId)

			// an exhausted budget is counted before it rejects
			if (authorization.status === "budget" && userId) {
				trackEvent("chat_budget_reached", userId, { ...toAnalyticsProperties(context), topicId })
			}
			if (authorization.status !== "allowed") {
				return toChatRejection(context, authorization.status)
			}

			// the gate already rejected a signed-out visitor with "signup", so this narrows the type alone
			if (!userId) {
				return context.json({ error: "sign up required" }, 401)
			}
			return answerChatTurn(context, userId, { topicId }, authorization, context.req.valid("json"), true)
		},
	)
