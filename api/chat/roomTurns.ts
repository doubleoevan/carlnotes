// carl's turn in a team room
import { and, asc, desc, eq, gt, inArray, isNull, lt, type SQL, sql } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import { db } from "../../db"
import { chatRoomAttachments, chatRoomMessages, chatRoomSummaries, type topics, users } from "../../db/schema"
import { streamChatReply } from "../../worker/chat"
import { fetchPromptTemplate } from "../../worker/prompts/fetch"
import { writePrompt } from "../../worker/prompts/write"
import { decryptChatText, encryptChatText } from "./encryption"
import { notifyChatRoomMessage } from "./roomStream"
import { recordChatRoomTurn } from "./turns"

// how many messages the window includes before the summary takes over
const CHAT_ROOM_WINDOW_MESSAGES = 30

// how much of each rolled-out message the running summary keeps
const SUMMARY_MESSAGE_CHARS = 200
const SUMMARY_MAX_CHARS = 8000

type ChatRoomTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

// the room's topic side of a filter: one topic's room, or the team's own room stored with no topic
export function toTopicFilter(column: PgColumn, topicId: string | null): SQL {
	return topicId === null ? isNull(column) : eq(column, topicId)
}

/**
 * Carl's completion: billed through the chat ledger to the member whose message addressed him,
 * including the window plus the running summary plus the topic's retrieved findings.
 */
export async function runCarlChatRoomTurn(
	billedUserId: string,
	// null is the team's own room, whose reply reads across every topic the team holds
	topic: typeof topics.$inferSelect | null,
	teamId: string,
	promptMessageId: number,
): Promise<void> {
	// the billed member's LiteLLM key. carl's completion spends on their account
	const [billedMember] = await db
		.select({ litellmVirtualKey: users.litellmVirtualKey })
		.from(users)
		.where(eq(users.id, billedUserId))
	if (!billedMember?.litellmVirtualKey) {
		return
	}
	const litellmApiKey = billedMember.litellmVirtualKey

	// the lock serializes the chat messages read and the summary roll
	const question = await db.transaction(async (transaction) => {
		await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`${topic?.id ?? "team"}:${teamId}`}))`)
		return buildCarlRoomQuestion(transaction, topic?.id ?? null, teamId)
	})

	// retrieval embeds the mentioning message alone. the composed question above would dilute its similarity
	const [promptMessage] = await db
		.select({ content: chatRoomMessages.content })
		.from(chatRoomMessages)
		.where(eq(chatRoomMessages.id, promptMessageId))

	// the same reply path the private chat uses
	const replyStream = await streamChatReply({
		topicId: topic?.id,
		teamId: topic ? undefined : teamId,
		userId: billedUserId,
		isOwner: topic ? topic.ownerId === billedUserId : false,
		litellmApiKey,
		question,
		retrievalQuestion: promptMessage ? (decryptChatText(promptMessage.content) ?? undefined) : undefined,
		history: [],
		// the billed member's privately kept attachments stay out. this answer posts to the whole room
		includeAttachments: false,
	})
	if (!replyStream) {
		return
	}

	// drain the stream into the one message the room posts
	let answer = ""
	for await (const chunk of replyStream.textStream) {
		answer += chunk
	}
	const completion = await replyStream.completion

	// carl's answer is stored once the completion is done
	const [carlMessage] = await db
		.insert(chatRoomMessages)
		.values({
			topicId: topic?.id ?? null,
			teamId,
			authorUsername: "Carl",
			replyToMessageId: promptMessageId,
			content: encryptChatText(answer.trim()),
		})
		.returning({ id: chatRoomMessages.id })
	if (!carlMessage) {
		return
	}

	// the ledger is updated after carl's answer is stored, naming the message carl answered
	await recordChatRoomTurn(billedUserId, topic?.id ?? null, teamId, promptMessageId, completion)
	// the fan-out runs only after the insert commits, so every listener's re-read finds the message
	await notifyChatRoomMessage(topic?.id ?? null, teamId, carlMessage.id)
}

// carl's question for one chat turn
async function buildCarlRoomQuestion(
	transaction: ChatRoomTransaction,
	topicId: string | null,
	teamId: string,
): Promise<string> {
	// the window reads newest first under its limit, so a turn never loads the entire history
	const newestChatWindowMessages = await transaction
		.select()
		.from(chatRoomMessages)
		.where(and(toTopicFilter(chatRoomMessages.topicId, topicId), eq(chatRoomMessages.teamId, teamId)))
		.orderBy(desc(chatRoomMessages.id))
		.limit(CHAT_ROOM_WINDOW_MESSAGES)
	const chatWindowMessages = newestChatWindowMessages.reverse()

	// everything older than the window joins the running summary before the turn reads it
	await addChatRoomSummary(transaction, topicId, teamId, chatWindowMessages[0]?.id ?? 0)
	const [summaryRow] = await transaction
		.select({ summary: chatRoomSummaries.summary })
		.from(chatRoomSummaries)
		.where(and(toTopicFilter(chatRoomSummaries.topicId, topicId), eq(chatRoomSummaries.teamId, teamId)))

	// the chat messages and the room's attachments, in the shapes the template reads
	const chatMessages = await toChatRoomMessages(transaction, topicId, chatWindowMessages)
	const chatRoomAttachmentsBlock = await toChatRoomAttachmentsBlock(transaction, topicId, teamId)

	// one question through the versioned template: the summary, the attachments, and the chat messages
	const { template } = await fetchPromptTemplate("chat-room-turn")
	return writePrompt(
		template,
		{},
		{ summary: summaryRow?.summary ?? "Nothing yet.", chatRoomAttachmentsBlock, chatMessages },
	)
}

// the chat messages put each author's username into the content which tells carl who asked what
async function toChatRoomMessages(
	transaction: ChatRoomTransaction,
	topicId: string | null,
	chatWindowMessages: (typeof chatRoomMessages.$inferSelect)[],
): Promise<string> {
	// the replied-to ids the window itself does not include
	const messageRowByMessageId = new Map(chatWindowMessages.map((messageRow) => [messageRow.id, messageRow]))
	const answeredMessageIds = chatWindowMessages
		.map((messageRow) => messageRow.replyToMessageId)
		.filter((messageId): messageId is number => messageId !== null && !messageRowByMessageId.has(messageId))

	// a reply may answer a line older than the window, so those rows are read by id in one batch
	const answeredMessageRows =
		answeredMessageIds.length === 0
			? []
			: await transaction
					.select()
					.from(chatRoomMessages)
					.where(
						and(toTopicFilter(chatRoomMessages.topicId, topicId), inArray(chatRoomMessages.id, answeredMessageIds)),
					)

	// the fetched rows join the window's map, so every reference resolves the same way
	for (const answeredMessageRow of answeredMessageRows) {
		messageRowByMessageId.set(answeredMessageRow.id, answeredMessageRow)
	}

	// each line names its author, then quotes whichever earlier line it answers
	return chatWindowMessages
		.map((messageRow) => {
			// the answered messageRow still names itself when it sits past newer chatter or before the window
			const answeredMessageRow = messageRow.replyToMessageId
				? messageRowByMessageId.get(messageRow.replyToMessageId)
				: undefined
			const replyMessageDetails = answeredMessageRow
				? ` (replying to ${answeredMessageRow.authorUsername}: "${toClippedLine(decryptChatText(answeredMessageRow.content) ?? "")}")`
				: ""
			return `${messageRow.authorUsername}${replyMessageDetails}: ${decryptChatText(messageRow.content) ?? ""}`
		})
		.join("\n")
}

// the room's attachments, each with the words or description carl reads them by
async function toChatRoomAttachmentsBlock(
	transaction: ChatRoomTransaction,
	topicId: string | null,
	teamId: string,
): Promise<string> {
	const chatRoomAttachmentRows = await transaction
		.select()
		.from(chatRoomAttachments)
		.where(
			and(
				toTopicFilter(chatRoomAttachments.topicId, topicId),
				eq(chatRoomAttachments.teamId, teamId),
				eq(chatRoomAttachments.status, "ready"),
			),
		)
		.orderBy(asc(chatRoomAttachments.createdAt))

	// a room with nothing shared says so in the template's slot
	if (chatRoomAttachmentRows.length === 0) {
		return "None yet."
	}

	// each file leads with its name and uploader
	return chatRoomAttachmentRows
		.map((chatRoomAttachmentRow) => {
			// an image whose description has not arrived yet still names itself
			const attachmentFileContext = decryptChatText(chatRoomAttachmentRow.context) ?? ""
			return `### ${chatRoomAttachmentRow.name} (shared by ${chatRoomAttachmentRow.uploaderUsername})\n${attachmentFileContext || "An image with no description yet."}`
		})
		.join("\n\n")
}

// the first stretch of a replied-to line, enough to recognize it without repeating it whole
function toClippedLine(content: string): string {
	const singleLine = content.replaceAll("\n", " ")
	return singleLine.length > 100 ? `${singleLine.slice(0, 100)}…` : singleLine
}

// add the messages that left the window to the running summary, each clipped, the whole limited
async function addChatRoomSummary(
	transaction: ChatRoomTransaction,
	topicId: string | null,
	teamId: string,
	endMessageId: number,
): Promise<void> {
	// an empty room has nothing before the window to roll
	if (endMessageId === 0) {
		return
	}

	// only what the stored summary does not already cover
	const [storedSummaryRows] = await transaction
		.select()
		.from(chatRoomSummaries)
		.where(and(toTopicFilter(chatRoomSummaries.topicId, topicId), eq(chatRoomSummaries.teamId, teamId)))
	const startMessageId = storedSummaryRows?.summarizedThroughMessageId ?? 0

	// the rolled-out rows read by id range, so the roll never loads the window or the covered stretch
	const earlierMessageRows = await transaction
		.select()
		.from(chatRoomMessages)
		.where(
			and(
				toTopicFilter(chatRoomMessages.topicId, topicId),
				eq(chatRoomMessages.teamId, teamId),
				gt(chatRoomMessages.id, startMessageId),
				lt(chatRoomMessages.id, endMessageId),
			),
		)
		.orderBy(asc(chatRoomMessages.id))
	if (earlierMessageRows.length === 0) {
		return
	}

	// each rolled-out message keeps its opening, and the whole summary keeps its newest end
	const earlierMessages = earlierMessageRows
		.map(
			(messageRow) =>
				`${messageRow.authorUsername}: ${(decryptChatText(messageRow.content) ?? "").slice(0, SUMMARY_MESSAGE_CHARS)}`,
		)
		.join("\n")
	const summary = `${storedSummaryRows?.summary ? `${storedSummaryRows.summary}\n` : ""}${earlierMessages}`.slice(
		-SUMMARY_MAX_CHARS,
	)
	const summarizedThroughMessageId = earlierMessageRows[earlierMessageRows.length - 1]?.id ?? startMessageId

	// save one row per chat room summary, moved forward with what the chat window covers
	await transaction
		.insert(chatRoomSummaries)
		.values({ topicId, teamId, summary, summarizedThroughMessageId })
		.onConflictDoUpdate({
			target: [chatRoomSummaries.topicId, chatRoomSummaries.teamId],
			set: { summary, summarizedThroughMessageId },
		})
}
