// carl's chat turn in a team chat room
import type { RoomTopicToolCalls } from "@shared/contracts/chat"
import { reportError } from "@shared/monitoring"
import type { ChatAttachment } from "@shared/payloads"
import { and, eq, ne, sql } from "drizzle-orm"
import { db } from "../../db"
import { chatRoomAttachments, chatRoomMessages } from "../../db/schema/chat"
import type { topics } from "../../db/schema/topics"
import {
	type ChatReplyPart,
	getAttachmentBytes,
	loadOrProvisionUserLiteLLMKey,
	MODEL_CHAT_TURN_FAILED_REJECTION,
} from "../../worker"
import { streamChatReply } from "../../worker/chat"
import { isAllowed } from "../authorization"
import { type ChatTurnToolCalls, toChatTopicTools, toTopicEditPreviewTools } from "../tool/chatTools"
import { recordChatRoomTurn } from "./chatTurns"
import { decryptChatText, encryptChatText } from "./encryption"
import { saveLinkPreviews } from "./linkPreviews"
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

	// a member with topic:edit gets the edit tools, which check the rights again themselves
	// the saves go out with carl's chat message
	const toolCalls: ChatTurnToolCalls = { count: 0, topicSaves: [], topicSaveRejections: [] }
	const chatTurnTools =
		topic && (await isAllowed(billedUserId, "topic:edit", topic))
			? toChatTopicTools({ userId: billedUserId, topicId: topic.id, toolCalls })
			: undefined

	// the same reply path the private chat uses
	const replyStream = await streamChatReply({
		tools: chatTurnTools,
		// the tools that put a proposed change on the topic's card and take it back off
		...(chatTurnTools ? toTopicEditPreviewTools({ toolCalls }) : {}),
		topicId: topic?.id,
		teamId: topic ? undefined : teamId,
		userId: billedUserId,
		isTopicOwner: topic ? topic.ownerId === billedUserId : false,
		litellmApiKey,
		question,
		retrievalQuestion: promptChatMessage ? (decryptChatText(promptChatMessage.content) ?? undefined) : undefined,
		isSpoken,
		history: [],
		chatAttachments: promptImages,
		// the billed member's privately kept attachments stay out. this answer posts to the whole chat room
		includeAttachments: false,
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
			authorUsername: "Carl",
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

	// save the chat turn row after carl's answer is stored, naming the chat message that carl answered
	await recordChatRoomTurn({
		userId: billedUserId,
		topicId: topic?.id ?? null,
		teamId,
		chatRoomMessageId: promptChatMessageId,
		completion,
	})
	// the fan-out runs only after the insert commits. every listener's re-read finds the chat message
	await notifyChatRoomMessage(
		topic?.id ?? null,
		teamId,
		modelChatMessage.id,
		toChatRoomToolCalls(toolCalls, billedUserId),
	)
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
 * An image whose description the scanner flagged is left out.
 */
export async function loadPromptMessageImages(promptChatMessageId: number): Promise<ChatAttachment[]> {
	// only an image with stored bytes can be shown to the model, and never one whose description the scanner flagged
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
			authorUsername: "Carl",
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
