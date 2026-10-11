// streaming a chat turn's reply to the user, then saving its row, its topic draft, and its sent attachments
import { toChatReplyLineText } from "@shared/contracts/chat"
import { reportError } from "@shared/monitoring"
import type { ChatAttachment } from "@shared/payloads"
import type { Context } from "hono"
import { stream } from "hono/streaming"
import { type ChatReplyStream, isBudgetRejection, SPENT_BUDGET_REJECTION } from "../../worker"
import type { AnalyticsProperties } from "../currentUser"
import type { ChatTurnToolCalls } from "../tool/chatTools"
import { saveTopicDraft } from "../topic/topicDrafts"
import { storeTopicChatAttachments } from "./attachments"
import { type ChatPage, saveChatTurn, toChatPageId } from "./chatTurns"
import { saveLinkPreviews } from "./linkPreviews"
import { writeReplyStream } from "./replyStream"

// one chat turn whose reply is streaming
export type StreamedChatTurn = {
	chatReply: ChatReplyStream
	// who asked on which page, and what they sent
	userId: string
	page: ChatPage
	question: string
	attachments: ChatAttachment[]
	// whether the gate keeps the text, and what the topic tools did
	isPersisted: boolean
	toolCalls: ChatTurnToolCalls
	// the properties that the analytics event is sent with, and the LiteLLM key for the attachment summaries
	analyticsProperties: AnalyticsProperties
	litellmApiKey: string
}

/** Streams a chat reply to the user, then saves the chat turn whether the stream finished or broke. */
export function streamChatTurn(context: Context, chatTurn: StreamedChatTurn): Response {
	return stream(context, async (writeStream) => {
		// forward the reply, with the tool calls as each tool returns
		try {
			await writeReplyStream(writeStream, chatTurn.chatReply, chatTurn.toolCalls)
		} catch (error) {
			// log the broken stream. it still spent tokens, so the save below still runs
			console.error(`chat stream failed for ${toChatPageId(chatTurn.page)}`, error)
			// close with the spent budget's text. the stream is the only place left to show it.
			// report any other failure and close with the failed line
			let closingLine = toChatReplyLineText({ type: "text", text: `\n\n${SPENT_BUDGET_REJECTION}` })
			if (!isBudgetRejection(error)) {
				reportError(error, "chat", { topicId: toChatPageId(chatTurn.page) })
				closingLine = toChatReplyLineText({ type: "failed" })
			}

			// write the closing line. a user who already left cannot be written to, and that must not skip the save below
			try {
				await writeStream.write(closingLine)
			} catch (closingError) {
				console.error("chat stream close failed", closingError)
			}
		}

		// save the spend whether the stream finished or broke. a partial chat turn is never free
		const chatTurnId = await saveFinishedChatTurn(chatTurn)

		// store the topic draft that the chat turn wrote. a chat turn that created the topic already deleted it
		if (chatTurn.toolCalls.topicDraft && !chatTurn.toolCalls.createdTopicId) {
			await saveTopicDraft(chatTurn.userId, chatTurn.toolCalls.topicDraft).catch((error) => {
				console.error("topic draft save failed", error)
				reportError(error, "chat")
			})
		}

		// store the sent attachments in the background once the reply has finished. their summaries take seconds.
		// a team or new-topic conversation stores none
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

// save the finished chat turn's spend and text, and fetch the answer's link preview in the background.
// return null if the chat turn stored no text or the save failed
async function saveFinishedChatTurn(chatTurn: StreamedChatTurn): Promise<string | null> {
	try {
		// save the chat turn. a topic tool call keeps the chat turn's text even if the gate rejects persistence
		const { text, totalTokens, searchCount, toolCalls } = await chatTurn.chatReply.completion
		const isChatTurnPersisted = chatTurn.isPersisted || chatTurn.toolCalls.count > 0
		const savedChatTurnId = await saveChatTurn({
			userId: chatTurn.userId,
			page: chatTurn.page,
			totalTokens,
			searchCount,
			isPersisted: isChatTurnPersisted,
			question: chatTurn.question,
			answer: text,
			toolCalls,
			analyticsProperties: chatTurn.analyticsProperties,
		})

		// fetch the answer's first link preview card in the background, like the question's
		if (isChatTurnPersisted) {
			void saveLinkPreviews(text).catch((error) => console.error("chat link preview failed", error))
		}

		// return the id only if the chat turn stored text. without text there is no bubble for an attachment to show in
		return isChatTurnPersisted ? savedChatTurnId : null
	} catch (error) {
		console.error(`chat turn save failed for ${toChatPageId(chatTurn.page)}`, error)
		reportError(error, "chat", { topicId: toChatPageId(chatTurn.page) })
		return null
	}
}
