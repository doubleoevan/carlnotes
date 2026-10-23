// carl's question for one chat room turn, written from the chat window, the running summary it rolls,
// and the room's shared files

import { type DbTransaction, db } from "@carlnotes/db"
import { chatRoomAttachments, chatRoomMessages, chatRoomSummaries } from "@carlnotes/db/schema/chat"
import { fetchPromptTemplate } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { and, asc, desc, eq, gt, inArray, lt, sql } from "drizzle-orm"
import { decryptChatText, toDecryptedLengthSql } from "./encryption"
import { toTopicFilter } from "./roomAccess"

// how many chat messages the window includes before the summary takes over
const CHAT_ROOM_WINDOW_MESSAGES = 30

// how much of each rolled-out chat message the running summary keeps
const SUMMARY_MESSAGE_CHARS = 200
const SUMMARY_MAX_CHARS = 8000

// the characters a turn question holds beside its chat messages and shared files: the template and the running summary
const MAX_ROOM_QUESTION_TEMPLATE_CHARS = 4000 + SUMMARY_MAX_CHARS

// the characters each transcript line and each shared file adds beside its own words: an author, a quoted line it
// answers, and a file's name and uploader
const ROOM_LINE_LABEL_CHARS = 200

// what the template's summary slot says for a chat room with no running summary yet
export const EMPTY_CHAT_ROOM_SUMMARY = "Nothing yet."

// what the template's attachments slot says for a chat room with nothing shared
export const EMPTY_CHAT_ROOM_ATTACHMENTS_BLOCK = "None yet."

// one chat message as the transcript names it: the author, what they wrote, and the chat message it answers, if any
export type ChatRoomTranscriptMessage = {
	authorUsername: string
	content: string
	repliedTo?: { authorUsername: string; content: string }
}

/** Builds carl's question for one chat room turn: the summary, the room's shared files, and the window's transcript. */
export async function buildModelRoomQuestion(
	transaction: DbTransaction,
	topicId: string | null,
	teamId: string,
): Promise<string> {
	// the window reads newest first under its limit, so a chat turn never loads the entire history
	const newestWindowChatMessages = await transaction
		.select()
		.from(chatRoomMessages)
		.where(and(toTopicFilter(chatRoomMessages.topicId, topicId), eq(chatRoomMessages.teamId, teamId)))
		.orderBy(desc(chatRoomMessages.id))
		.limit(CHAT_ROOM_WINDOW_MESSAGES)
	const windowChatMessages = newestWindowChatMessages.reverse()

	// everything older than the window joins the running summary before the chat turn reads it
	await addChatRoomSummary(transaction, topicId, teamId, windowChatMessages[0]?.id ?? 0)
	const [summaryRow] = await transaction
		.select({ summary: chatRoomSummaries.summary })
		.from(chatRoomSummaries)
		.where(and(toTopicFilter(chatRoomSummaries.topicId, topicId), eq(chatRoomSummaries.teamId, teamId)))

	// the chat messages and the chat room's attachments, in the shapes that the template reads
	const chatMessages = await toChatRoomMessages(transaction, topicId, teamId, windowChatMessages)
	const chatRoomAttachmentsBlock = await toChatRoomAttachmentsBlock(transaction, topicId, teamId)

	// one question through the versioned template: the summary, the attachments, and the chat messages
	return toModelRoomQuestion({
		summary: summaryRow?.summary ?? EMPTY_CHAT_ROOM_SUMMARY,
		chatRoomAttachmentsBlock,
		chatMessages,
	})
}

/**
 * Returns the most characters carl's question for the chat room's next turn holds, from what the chat room stores now:
 * the window's chat messages, the chat room's shared files, and the template and summary around them. The lengths are
 * summed in the database, so no stored text is read or decrypted.
 */
export async function loadModelRoomQuestionChars(topicId: string | null, teamId: string): Promise<number> {
	// the window's chat messages, newest first under the window's limit, each with its line's label
	const windowChatMessages = db
		.select({
			lineChars: sql<number>`${toDecryptedLengthSql(chatRoomMessages.content)} + ${ROOM_LINE_LABEL_CHARS}`.as(
				"line_chars",
			),
		})
		.from(chatRoomMessages)
		.where(and(toTopicFilter(chatRoomMessages.topicId, topicId), eq(chatRoomMessages.teamId, teamId)))
		.orderBy(desc(chatRoomMessages.id))
		.limit(CHAT_ROOM_WINDOW_MESSAGES)
		.as("window_chat_messages")

	// sum the window's lines and the chat room's ready files, each file with its own label
	const fileCharsSql = sql<number>`${toDecryptedLengthSql(chatRoomAttachments.context)} + ${ROOM_LINE_LABEL_CHARS}`
	const [[windowRow], [attachmentsRow]] = await Promise.all([
		db.select({ chars: sql<string>`coalesce(sum(${windowChatMessages.lineChars}), 0)` }).from(windowChatMessages),
		db
			.select({ chars: sql<string>`coalesce(sum(${fileCharsSql}), 0)` })
			.from(chatRoomAttachments)
			.where(
				and(
					toTopicFilter(chatRoomAttachments.topicId, topicId),
					eq(chatRoomAttachments.teamId, teamId),
					eq(chatRoomAttachments.status, "ready"),
				),
			),
	])
	return MAX_ROOM_QUESTION_TEMPLATE_CHARS + Number(windowRow?.chars ?? 0) + Number(attachmentsRow?.chars ?? 0)
}

// the template variables of a room turn's question, with the running summary, the room's shared files, and the transcript
type ModelRoomQuestionVariables = { summary: string; chatRoomAttachmentsBlock: string; chatMessages: string }

/**
 * Writes a room turn's question from the chat-room-turn template, with everything the members wrote fenced as data.
 */
export async function toModelRoomQuestion(modelRoomQuestionVariables: ModelRoomQuestionVariables): Promise<string> {
	const { template } = await fetchPromptTemplate("chat-room-turn")
	return writePrompt(template, modelRoomQuestionVariables)
}

/**
 * Returns one transcript line: the author, a clipped quote of the chat message they answered, if any, and what they
 * wrote.
 */
export function toChatRoomTranscriptLine({ authorUsername, content, repliedTo }: ChatRoomTranscriptMessage): string {
	// the answered chat message's author and opening, then the author and what they wrote
	const replyMessageDetails = repliedTo
		? ` (replying to ${repliedTo.authorUsername}: "${toClippedLine(repliedTo.content)}")`
		: ""
	return `${authorUsername}${replyMessageDetails}: ${content}`
}

// the chat messages put each author's username into the content which tells carl who asked what
async function toChatRoomMessages(
	transaction: DbTransaction,
	topicId: string | null,
	teamId: string,
	windowChatMessages: (typeof chatRoomMessages.$inferSelect)[],
): Promise<string> {
	// the replied-to ids the window itself does not include
	const messageRowByMessageId = new Map(windowChatMessages.map((chatMessageRow) => [chatMessageRow.id, chatMessageRow]))
	const answeredMessageIds = windowChatMessages
		.map((chatMessageRow) => chatMessageRow.replyToMessageId)
		.filter(
			(chatMessageId): chatMessageId is number => chatMessageId !== null && !messageRowByMessageId.has(chatMessageId),
		)

	// a reply may answer a line older than the window, so those rows are read by id in one batch, within this room's team
	const answeredMessageRows =
		answeredMessageIds.length === 0
			? []
			: await transaction
					.select()
					.from(chatRoomMessages)
					.where(
						and(
							toTopicFilter(chatRoomMessages.topicId, topicId),
							eq(chatRoomMessages.teamId, teamId),
							inArray(chatRoomMessages.id, answeredMessageIds),
						),
					)

	// the fetched rows join the window's map, so every reference resolves the same way
	for (const answeredChatMessageRow of answeredMessageRows) {
		messageRowByMessageId.set(answeredChatMessageRow.id, answeredChatMessageRow)
	}

	// each line names its author, then quotes whichever earlier line it answers
	return windowChatMessages
		.map((chatMessageRow) => {
			// the answered chatMessageRow still names itself when it sits past newer chatter or before the window
			const answeredChatMessageRow = chatMessageRow.replyToMessageId
				? messageRowByMessageId.get(chatMessageRow.replyToMessageId)
				: undefined
			// one transcript line: the author, who they answered, and what they said
			return toChatRoomTranscriptLine({
				authorUsername: chatMessageRow.authorUsername,
				content: decryptChatText(chatMessageRow.content) ?? "",
				repliedTo: answeredChatMessageRow
					? {
							authorUsername: answeredChatMessageRow.authorUsername,
							content: decryptChatText(answeredChatMessageRow.content) ?? "",
						}
					: undefined,
			})
		})
		.join("\n")
}

// the chat room's attachments, each with the words or description carl reads them by
async function toChatRoomAttachmentsBlock(
	transaction: DbTransaction,
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

	// a chat room with nothing shared says so in the template's slot
	if (chatRoomAttachmentRows.length === 0) {
		return EMPTY_CHAT_ROOM_ATTACHMENTS_BLOCK
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

// add the chat messages that left the window to the running summary, each clipped, the whole limited
async function addChatRoomSummary(
	transaction: DbTransaction,
	topicId: string | null,
	teamId: string,
	endMessageId: number,
): Promise<void> {
	// an empty chat room has nothing before the window to roll
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
	const earlierChatMessageRows = await transaction
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
	if (earlierChatMessageRows.length === 0) {
		return
	}

	// each rolled-out chat message keeps its opening, and the whole summary keeps its newest end
	const earlierChatMessages = earlierChatMessageRows
		.map(
			(chatMessageRow) =>
				`${chatMessageRow.authorUsername}: ${(decryptChatText(chatMessageRow.content) ?? "").slice(0, SUMMARY_MESSAGE_CHARS)}`,
		)
		.join("\n")
	const summary = `${storedSummaryRows?.summary ? `${storedSummaryRows.summary}\n` : ""}${earlierChatMessages}`.slice(
		-SUMMARY_MAX_CHARS,
	)
	const summarizedThroughChatMessageId = earlierChatMessageRows[earlierChatMessageRows.length - 1]?.id ?? startMessageId

	// save one row per chat room summary, moved forward with what the chat window covers
	await transaction
		.insert(chatRoomSummaries)
		.values({ topicId, teamId, summary, summarizedThroughMessageId: summarizedThroughChatMessageId })
		.onConflictDoUpdate({
			target: [chatRoomSummaries.topicId, chatRoomSummaries.teamId],
			set: { summary, summarizedThroughMessageId: summarizedThroughChatMessageId },
		})
}
