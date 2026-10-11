// carl's question for one chat room turn, written from the chat window, the running summary it rolls,
// and the room's shared files
import { and, asc, desc, eq, gt, inArray, lt } from "drizzle-orm"
import type { DbTransaction } from "../../db"
import { chatRoomAttachments, chatRoomMessages, chatRoomSummaries } from "../../db/schema/chat"
import { fetchPromptTemplate } from "../../worker/prompts/fetch"
import { writePrompt } from "../../worker/prompts/write"
import { decryptChatText } from "./encryption"
import { toTopicFilter } from "./roomAccess"

// how many chat messages the window includes before the summary takes over
const CHAT_ROOM_WINDOW_MESSAGES = 30

// how much of each rolled-out chat message the running summary keeps
const SUMMARY_MESSAGE_CHARS = 200
const SUMMARY_MAX_CHARS = 8000

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
	const chatMessages = await toChatRoomMessages(transaction, topicId, windowChatMessages)
	const chatRoomAttachmentsBlock = await toChatRoomAttachmentsBlock(transaction, topicId, teamId)

	// one question through the versioned template: the summary, the attachments, and the chat messages
	return toModelRoomQuestion({ summary: summaryRow?.summary ?? "Nothing yet.", chatRoomAttachmentsBlock, chatMessages })
}

// the template variables of a room turn's question, with the running summary, the room's shared files, and the transcript
type ModelRoomQuestionVariables = { summary: string; chatRoomAttachmentsBlock: string; chatMessages: string }

/**
 * Writes a room turn's question from the chat-room-turn template.
 */
export async function toModelRoomQuestion(modelRoomQuestionVariables: ModelRoomQuestionVariables): Promise<string> {
	const { template } = await fetchPromptTemplate("chat-room-turn")
	return writePrompt(template, {}, modelRoomQuestionVariables)
}

// the chat messages put each author's username into the content which tells carl who asked what
async function toChatRoomMessages(
	transaction: DbTransaction,
	topicId: string | null,
	windowChatMessages: (typeof chatRoomMessages.$inferSelect)[],
): Promise<string> {
	// the replied-to ids the window itself does not include
	const messageRowByMessageId = new Map(windowChatMessages.map((chatMessageRow) => [chatMessageRow.id, chatMessageRow]))
	const answeredMessageIds = windowChatMessages
		.map((chatMessageRow) => chatMessageRow.replyToMessageId)
		.filter(
			(chatMessageId): chatMessageId is number => chatMessageId !== null && !messageRowByMessageId.has(chatMessageId),
		)

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
			const replyMessageDetails = answeredChatMessageRow
				? ` (replying to ${answeredChatMessageRow.authorUsername}: "${toClippedLine(decryptChatText(answeredChatMessageRow.content) ?? "")}")`
				: ""
			// one transcript line: the author, who they answered, and what they said
			return `${chatMessageRow.authorUsername}${replyMessageDetails}: ${decryptChatText(chatMessageRow.content) ?? ""}`
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
