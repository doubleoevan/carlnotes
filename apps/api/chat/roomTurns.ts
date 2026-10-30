// carl's chat turn in a team chat room
import type { RoomTopicToolCalls } from "@carlnotes/contracts/chatTurns"
import type { ChatAttachment } from "@carlnotes/contracts/payloads"
import { PODCAST_EPISODE_SPEAKER_NAMES } from "@carlnotes/contracts/podcastEpisodes"
import { db } from "@carlnotes/db"
import { chatRoomAttachments, chatRoomMessages } from "@carlnotes/db/schema/chat"
import type { topics } from "@carlnotes/db/schema/topics"
import { getAttachmentBytes } from "@carlnotes/db/store"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { MODEL_CHAT_TURN_FAILED_REJECTION } from "@carlnotes/models/models"
import { type ChatReplyPart, type ChatReplyStream, streamChatReply } from "@carlnotes/pipeline/chat/index"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq, ne, sql } from "drizzle-orm"
import { isAllowed } from "../authorization"
import { type ChatTurnToolCalls, toEmptyChatTurnToolCalls, toTopicEditPreviewTools } from "../tool/chatTools"
import type { ChatProposalResult } from "./chatProposals"
import { recordChatRoomTurn } from "./chatTurns"
import { decryptChatText, encryptChatText } from "./encryption"
import { saveLinkPreviews } from "./linkPreviews"
import { answerChatRoomProposal, recordChatRoomProposal } from "./roomProposals"
import { buildModelRoomQuestion } from "./roomQuestion"
import { notifyChatRoomMessage } from "./roomStream"

/**
 * Runs Carl's chat room turn from the window, the running summary, and the topic's findings.
 * The turn is billed in a chat turn row to the member whose chat message addressed him.
 */
export async function runModelChatRoomTurn(
	billedUserId: string,
	// null is the team's own chat room, whose reply reads across every topic the team holds
	topic: typeof topics.$inferSelect | null,
	teamId: string,
	promptChatMessageId: number,
): Promise<void> {
	// the billed member's LiteLLM key, created first if the member has none. carl's completion spends on that key
	const litellmApiKey = await loadOrProvisionUserLiteLLMKey(billedUserId).catch((error: unknown) => {
		reportError(error, "chat", { teamId, userId: billedUserId })
		return null
	})
	// post carl's own rejection instead of a reply if the member's key could not be loaded or created
	if (!litellmApiKey) {
		await postModelRejection(topic?.id ?? null, teamId, promptChatMessageId, MODEL_CHAT_TURN_FAILED_REJECTION)
		return
	}

	// the lock serializes the chat messages read and the summary roll
	const question = await db.transaction(async (transaction) => {
		await transaction.execute(sql`select pg_advisory_xact_lock(hashtext(${`${topic?.id ?? "team"}:${teamId}`}))`)
		return buildModelRoomQuestion(transaction, topic?.id ?? null, teamId)
	})

	// retrieval embeds the mentioning chat message alone. the composed question above would dilute its similarity.
	// a spoken chat message has carl answer out loud, and marks his reply
	const [promptChatMessage] = await db
		.select({ content: chatRoomMessages.content, isSpoken: chatRoomMessages.isSpoken })
		.from(chatRoomMessages)
		.where(eq(chatRoomMessages.id, promptChatMessageId))
	const isSpoken = promptChatMessage?.isSpoken ?? false

	// the images shared with the prompt chat message, read back for carl's reply
	const promptImages = await loadPromptMessageImages(promptChatMessageId)

	// read the member's own words, and answer their standing preview if they may edit the topic
	const toolCalls = toEmptyChatTurnToolCalls()
	const promptChatMessageText = promptChatMessage
		? (decryptChatText(promptChatMessage.content) ?? undefined)
		: undefined
	const { isTopicEditor, chatProposalResult } = await answerChatRoomTopicEdit({
		billedUserId,
		topic,
		teamId,
		question: promptChatMessageText ?? "",
		toolCalls,
		litellmApiKey,
	})

	// the same reply path the private chat uses
	const replyStream = await streamChatReply({
		// the tools that put a proposed change on the topic's card and take it back off
		...(isTopicEditor ? toTopicEditPreviewTools({ toolCalls }) : {}),
		topicId: topic?.id,
		teamId: topic ? undefined : teamId,
		userId: billedUserId,
		isTopicOwner: topic ? topic.ownerId === billedUserId : false,
		litellmApiKey,
		question,
		retrievalQuestion: promptChatMessageText,
		isSpoken,
		history: [],
		chatAttachments: promptImages,
		// the billed member's privately kept attachments stay out. this answer posts to the whole chat room
		includeAttachments: false,
		serverToolCalls: chatProposalResult?.serverToolCalls,
		proposalOutcome: chatProposalResult?.proposalOutcome,
	})
	if (!replyStream) {
		return
	}

	// read the whole stream into the one chat message the chat room posts
	const reply = await toReplyText(replyStream.replyParts)
	const completion = await replyStream.completion

	// carl's answer is stored once the completion is done, marked spoken if the chat message it answers was
	const [modelChatMessage] = await db
		.insert(chatRoomMessages)
		.values({
			topicId: topic?.id ?? null,
			teamId,
			authorUsername: PODCAST_EPISODE_SPEAKER_NAMES.host,
			replyToMessageId: promptChatMessageId,
			content: encryptChatText(reply.trim()),
			isSpoken,
		})
		.returning({ id: chatRoomMessages.id })
	if (!modelChatMessage) {
		return
	}

	// carl's first link fetches its link preview card in the background, like a member's chat message
	void saveLinkPreviews(reply, teamId).catch((error) => console.error("chat room link preview failed", error))

	// save the chat turn row after carl's answer is stored, then the preview left standing for this member
	await saveFinishedChatRoomTurn({
		billedUserId,
		topicId: topic?.id ?? null,
		teamId,
		promptChatMessageId,
		completion,
		agreementTokens: chatProposalResult?.agreementTokens ?? 0,
	})
	// the fan-out runs only after the insert commits. every listener's re-read finds the chat message
	await notifyChatRoomMessage(
		topic?.id ?? null,
		teamId,
		modelChatMessage.id,
		toChatRoomToolCalls(toolCalls, billedUserId),
	)
}

// the member who addressed carl, the chat room's topic and team, and the member's words that may answer their preview
type AnswerChatRoomTopicEditOptions = {
	billedUserId: string
	topic: typeof topics.$inferSelect | null
	teamId: string
	question: string
	toolCalls: ChatTurnToolCalls
	litellmApiKey: string
}

// answer the preview standing for the member who addressed carl, if that member may edit the topic
async function answerChatRoomTopicEdit({
	billedUserId,
	topic,
	teamId,
	question,
	toolCalls,
	litellmApiKey,
}: AnswerChatRoomTopicEditOptions): Promise<{ isTopicEditor: boolean; chatProposalResult?: ChatProposalResult }> {
	// the team's own chat room has no topic, and a member who may not edit gets no preview tools
	if (!topic || !(await isAllowed(billedUserId, "topic:edit", topic))) {
		return { isTopicEditor: false }
	}

	// answer the preview standing for this editor
	const chatProposalResult = await answerChatRoomProposal({
		userId: billedUserId,
		topicId: topic.id,
		teamId,
		question,
		toolCalls,
		litellmApiKey,
	})
	return { isTopicEditor: true, chatProposalResult }
}

// the member billed for the chat room turn, where it ran, the chat message carl answered, and what the reply spent
type SaveFinishedChatRoomTurnOptions = {
	billedUserId: string
	topicId: string | null
	teamId: string
	promptChatMessageId: number
	completion: Awaited<ChatReplyStream["completion"]>
	agreementTokens: number
}

// save a chat room turn's spend row, the agreement check's tokens included, and the preview the chat room turn leaves
// standing for the member who addressed carl. a failed preview record is reported and the chat room turn goes on
async function saveFinishedChatRoomTurn({
	billedUserId,
	topicId,
	teamId,
	promptChatMessageId,
	completion,
	agreementTokens,
}: SaveFinishedChatRoomTurnOptions): Promise<void> {
	// the spend row names the chat message that carl answered
	const chatRoomTurnId = await recordChatRoomTurn({
		userId: billedUserId,
		topicId,
		teamId,
		chatRoomMessageId: promptChatMessageId,
		completion: { ...completion, totalTokens: completion.totalTokens + agreementTokens },
	})
	if (!topicId || !chatRoomTurnId) {
		return
	}

	// the preview the chat room turn leaves standing, recorded for this member alone
	await recordChatRoomProposal({
		userId: billedUserId,
		topicId,
		teamId,
		chatTurnId: chatRoomTurnId,
		chatToolCalls: completion.toolCalls,
	}).catch((error: unknown) => {
		console.error(`recording the chat room proposal failed for topic ${topicId}`, error)
		reportError(error, "chat", { topicId, teamId })
	})
}

// the reply's text alone, read from its parts
async function toReplyText(replyParts: AsyncIterable<ChatReplyPart>): Promise<string> {
	let replyText = ""
	// keep the text parts and drop the tool results
	for await (const replyPart of replyParts) {
		if (replyPart.type === "text") {
			replyText += replyPart.text
		}
	}
	return replyText
}

/**
 * What the room is told about carl's topic tools: the toast lines every member reads, and the preview named for the
 * member who asked, since a proposal and its cancellation are theirs alone.
 */
function toChatRoomToolCalls(toolCalls: ChatTurnToolCalls, billedUserId: string): RoomTopicToolCalls {
	const isTopicEditPreviewChanged = Boolean(toolCalls.proposedTopicEdit || toolCalls.isTopicEditCancelled)
	return {
		topicSaves: toolCalls.topicSaves,
		topicSaveRejections: toolCalls.topicSaveRejections,
		proposedToUserId: isTopicEditPreviewChanged ? billedUserId : undefined,
		proposedTopicEdit: toolCalls.proposedTopicEdit,
		isTopicEditCancelled: toolCalls.isTopicEditCancelled,
	}
}

/**
 * Loads the images stored with one chat room message as the data urls the model reads.
 * An image whose description failed to generate is left out.
 */
export async function loadPromptMessageImages(promptChatMessageId: number): Promise<ChatAttachment[]> {
	// only an image with stored bytes can be shown to the model, and never one whose description failed
	const imageRows = await db
		.select({
			name: chatRoomAttachments.name,
			objectKey: chatRoomAttachments.objectKey,
			contentType: chatRoomAttachments.contentType,
		})
		.from(chatRoomAttachments)
		.where(
			and(
				eq(chatRoomAttachments.messageId, promptChatMessageId),
				eq(chatRoomAttachments.kind, "image"),
				ne(chatRoomAttachments.status, "failed"),
			),
		)

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
 * Post Carl's own rejection into the chat room, so a chat turn that failed mid-flight still answers the chat room.
 */
export async function postModelRejection(
	topicId: string | null,
	teamId: string,
	promptChatMessageId: number,
	rejectionReason: string,
): Promise<void> {
	const [modelChatMessage] = await db
		.insert(chatRoomMessages)
		.values({
			topicId,
			teamId,
			authorUsername: PODCAST_EPISODE_SPEAKER_NAMES.host,
			replyToMessageId: promptChatMessageId,
			content: encryptChatText(rejectionReason),
		})
		.returning({ id: chatRoomMessages.id })
	if (!modelChatMessage) {
		return
	}

	// the fan-out runs only after the insert commits. every listener's re-read finds the chat message
	await notifyChatRoomMessage(topicId, teamId, modelChatMessage.id)
}
