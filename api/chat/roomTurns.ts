// carl's chat turn in a team chat room

import type { ChatAttachment } from "@shared/contracts"
import { and, asc, desc, eq, gt, inArray, isNull, lt, type SQL, sql } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"
import { db } from "../../db"
import { chatRoomAttachments, chatRoomMessages, chatRoomSummaries, type topics, users } from "../../db/schema"
import { getAttachmentBytes } from "../../worker"
import { streamChatReply } from "../../worker/chat"
import { fetchPromptTemplate } from "../../worker/prompts/fetch"
import { writePrompt } from "../../worker/prompts/write"
import { decryptChatText, encryptChatText } from "./encryption"
import { saveLinkPreviews } from "./linkPreviews"
import { notifyChatRoomMessage } from "./roomStream"
import { recordChatRoomTurn } from "./turns"

// how many chat messages the window includes before the summary takes over
const CHAT_ROOM_WINDOW_MESSAGES = 30

// how much of each rolled-out chat message the running summary keeps
const SUMMARY_MESSAGE_CHARS = 200
const SUMMARY_MAX_CHARS = 8000

type ChatRoomTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

// the chat room's topic side of a filter: one topic's chat room, or the team's own chat room stored with no topic
export function toTopicFilter(column: PgColumn, topicId: string | null): SQL {
	return topicId === null ? isNull(column) : eq(column, topicId)
}

/**
 * Carl's completion: billed through the chat ledger to the member whose chat message addressed him,
 * including the window plus the running summary plus the topic's retrieved findings.
 */
export async function runModelChatRoomTurn(
	billedUserId: string,
	// null is the team's own chat room, whose reply reads across every topic the team holds
	topic: typeof topics.$inferSelect | null,
	teamId: string,
	promptChatMessageId: number,
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
		return buildModelRoomQuestion(transaction, topic?.id ?? null, teamId)
	})

	// retrieval embeds the mentioning chat message alone. the composed question above would dilute its similarity
	const [promptChatMessage] = await db
		.select({ content: chatRoomMessages.content })
		.from(chatRoomMessages)
		.where(eq(chatRoomMessages.id, promptChatMessageId))

	// the images shared with the prompt chat message, read back for carl's reply
	const promptImages = await loadPromptMessageImages(promptChatMessageId)

	// the same reply path the private chat uses
	const replyStream = await streamChatReply({
		topicId: topic?.id,
		teamId: topic ? undefined : teamId,
		userId: billedUserId,
		isOwner: topic ? topic.ownerId === billedUserId : false,
		litellmApiKey,
		question,
		retrievalQuestion: promptChatMessage ? (decryptChatText(promptChatMessage.content) ?? undefined) : undefined,
		history: [],
		attachments: promptImages,
		// the billed member's privately kept attachments stay out. this answer posts to the whole chat room
		includeAttachments: false,
	})
	if (!replyStream) {
		return
	}

	// drain the stream into the one chat message the chat room posts
	let answer = ""
	for await (const chunk of replyStream.textStream) {
		answer += chunk
	}
	const completion = await replyStream.completion

	// carl's answer is stored once the completion is done
	const [modelChatMessage] = await db
		.insert(chatRoomMessages)
		.values({
			topicId: topic?.id ?? null,
			teamId,
			authorUsername: "Carl",
			replyToMessageId: promptChatMessageId,
			content: encryptChatText(answer.trim()),
		})
		.returning({ id: chatRoomMessages.id })
	if (!modelChatMessage) {
		return
	}

	// carl's first link fetches its link preview card in the background, like a member's chat message
	void saveLinkPreviews(answer, teamId).catch((error) => console.error("chat room link preview failed", error))

	// the ledger is updated after carl's answer is stored, naming the chat message carl answered
	await recordChatRoomTurn(billedUserId, topic?.id ?? null, teamId, promptChatMessageId, completion)
	// the fan-out runs only after the insert commits. every listener's re-read finds the chat message
	await notifyChatRoomMessage(topic?.id ?? null, teamId, modelChatMessage.id)
}

// the images stored with one chat room message, rebuilt as the data urls the model reads
async function loadPromptMessageImages(promptChatMessageId: number): Promise<ChatAttachment[]> {
	// only an image with stored bytes can be shown to the model
	const imageRows = await db
		.select({
			name: chatRoomAttachments.name,
			objectKey: chatRoomAttachments.objectKey,
			contentType: chatRoomAttachments.contentType,
		})
		.from(chatRoomAttachments)
		.where(and(eq(chatRoomAttachments.messageId, promptChatMessageId), eq(chatRoomAttachments.kind, "image")))

	// each image reads back from storage into the data url shape the shared reply path takes
	const promptImages: ChatAttachment[] = []
	for (const imageRow of imageRows) {
		if (!imageRow.objectKey) {
			continue
		}
		// a failed read skips that image instead of failing carl's whole chat turn
		try {
			const imageBytes = await getAttachmentBytes(imageRow.objectKey)
			const dataUrl = `data:${imageRow.contentType ?? "image/png"};base64,${Buffer.from(imageBytes).toString("base64")}`
			promptImages.push({ kind: "image", name: imageRow.name, keep: false, dataUrl })
		} catch (error) {
			console.error(`room image read failed for chat message ${promptChatMessageId}`, error)
		}
	}

	// an image that failed to read is left out, so the chat turn goes on without it
	return promptImages
}

/**
 * Post Carl's own refusal into the chat room, so a chat turn that failed mid-flight still answers the chat room.
 */
export async function postModelRefusal(
	topicId: string | null,
	teamId: string,
	promptChatMessageId: number,
	refusalReason: string,
): Promise<void> {
	const [modelChatMessage] = await db
		.insert(chatRoomMessages)
		.values({
			topicId,
			teamId,
			authorUsername: "Carl",
			replyToMessageId: promptChatMessageId,
			content: encryptChatText(refusalReason),
		})
		.returning({ id: chatRoomMessages.id })
	if (!modelChatMessage) {
		return
	}

	// the fan-out runs only after the insert commits. every listener's re-read finds the chat message
	await notifyChatRoomMessage(topicId, teamId, modelChatMessage.id)
}

// carl's question for one chat turn
async function buildModelRoomQuestion(
	transaction: ChatRoomTransaction,
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
	transaction: ChatRoomTransaction,
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
