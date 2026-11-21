// streaming a chat turn's reply to the user, then saving its row, the proposal it leaves standing, its topic draft, and
// its sent attachments

import { withPodcastEpisodeNote } from "@carlnotes/contracts/chatQuestionNotes"
import { toChatReplyLineText } from "@carlnotes/contracts/chatTurns"
import type { PodcastEpisodeSpeaker } from "@carlnotes/contracts/enums"
import type { TopicDraft } from "@carlnotes/contracts/topicPayloads"
import { isBudgetRejection, SPENT_BUDGET_REJECTION } from "@carlnotes/models/models"
import type { SpendReservation } from "@carlnotes/models/spendReservations"
import type { ChatReplyStream } from "@carlnotes/pipeline/chat/index"
import type { PodcastEpisodeChapterContext } from "@carlnotes/pipeline/chat/retrievePodcastEpisodeChapter"
import { reportError } from "@carlnotes/server/monitoring"
import type { Context } from "hono"
import { stream } from "hono/streaming"
import type { AnalyticsProperties } from "../currentUser"
import type { ChatTurnToolCalls } from "../tool/chatTools"
import { saveTopicDraft } from "../topic/topicDrafts"
import { storeTopicChatAttachments } from "./attachments"
import type { StorableChatAttachment } from "./chatAttachmentParts"
import { type ChatPage, toChatPageId } from "./chatPages"
import { recordChatProposal } from "./chatProposals"
import { saveChatTurn } from "./chatTurns"
import { saveLinkPreviews } from "./linkPreviews"
import { writeReplyStream } from "./replyStream"

// a chat turn's reply once its retrieval returned, and the tokens the agreement check spent before it
export type LoadedChatReply = { chatReply: ChatReplyStream; agreementTokens: number }

// one chat turn whose reply is streaming
export type StreamedChatTurn = {
	// the reply, which loads after the response's headers are sent, or null if the page has nothing to chat about
	loadedChatReply: Promise<LoadedChatReply | null>
	// who asked on which page, and what they sent
	userId: string
	page: ChatPage
	question: string
	attachments: StorableChatAttachment[]
	// whether the gate keeps the text, whether the question was spoken, and what the topic tools did
	isPersisted: boolean
	isSpoken: boolean
	toolCalls: ChatTurnToolCalls
	// the podcast episode chapter that a podcast player question was asked during
	podcastEpisodeChapter?: PodcastEpisodeChapterContext
	// the Topic Post that a question asked from its page was about, and whether the user owns its topic
	topicPostId?: string
	isTopicOwner?: boolean
	// the properties that the analytics event is sent with, and the LiteLLM key for the attachment summaries
	analyticsProperties: AnalyticsProperties
	litellmApiKey: string
	// the new-topic chat's draft as the turn started
	topicDraft?: TopicDraft
	// the turn's reservation against the user's budget, released once the turn's spend row is saved
	reservation: SpendReservation
}

// the blank line a reply stream opens with, so its headers reach the client before the retrieval returns
export const OPENING_LINE = "\n"

/**
 * Sends the response's headers, waits for the reply's retrieval, streams the reply to the user, then saves the chat
 * turn whether the stream finished or broke. A reply that never starts releases the reservation and saves nothing.
 */
export function streamChatTurn(context: Context, chatTurn: StreamedChatTurn): Response {
	// a reply that fails before the stream reads it is read below, never left unhandled
	chatTurn.loadedChatReply.catch(() => {})
	return stream(context, async (writeStream) => {
		// send the headers now with a blank line, which a reader skips. Bun sends no header before the first chunk
		await writeStream.write(OPENING_LINE)

		// wait for the reply. one that never starts, or whose page has nothing to chat about, releases the reservation
		// and closes with a failed line
		let loadedChatReply: LoadedChatReply | null = null
		try {
			loadedChatReply = await chatTurn.loadedChatReply
			// a page with nothing to chat about closes with the failed line
			if (!loadedChatReply) {
				await writeClosingLine(writeStream, toChatReplyLineText({ type: "failed" }))
			}
		} catch (error) {
			console.error(`chat reply failed to start for ${toChatPageId(chatTurn.page)}`, error)
			await writeClosingLine(writeStream, toClosingLine(chatTurn, error))
		}

		// a reply that never started, or failed to start, saves nothing
		if (!loadedChatReply) {
			await chatTurn.reservation.release()
			return
		}

		// forward the reply, with the tool calls as each tool returns. only a reply that finished leaves a proposal
		let isReplyFinished = false
		try {
			await writeReplyStream(writeStream, loadedChatReply.chatReply, chatTurn.toolCalls)
			isReplyFinished = true
		} catch (error) {
			// log the broken stream. it still spent tokens, so the save below still runs
			console.error(`chat stream failed for ${toChatPageId(chatTurn.page)}`, error)
			await writeClosingLine(writeStream, toClosingLine(chatTurn, error))
		}

		// save the spend whether the stream finished or broke, then release the reservation. a partial chat turn is never
		// free, and the saved row now counts what the reservation held
		const chatTurnId = await saveFinishedChatTurn({ chatTurn, loadedChatReply, isReplyFinished })
		await chatTurn.reservation.release()

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

// the closing line of a reply that failed. a spent budget closes with its text. any other failure is reported and closes with the failed line
function toClosingLine(chatTurn: StreamedChatTurn, error: unknown): string {
	if (isBudgetRejection(error)) {
		return toChatReplyLineText({ type: "text", text: `\n\n${SPENT_BUDGET_REJECTION}` })
	}
	reportError(error, "chat", { topicId: toChatPageId(chatTurn.page) })
	return toChatReplyLineText({ type: "failed" })
}

// write the closing line. a user who already left cannot be written to, and that must not skip the save after it
async function writeClosingLine(
	writeStream: { write: (text: string) => Promise<unknown> },
	closingLine: string,
): Promise<void> {
	try {
		await writeStream.write(closingLine)
	} catch (closingError) {
		console.error("chat stream close failed", closingError)
	}
}

// the question as it is stored. a question asked from the podcast player ends with the note naming its podcast episode,
// its chapter, and the speaker who answered, host if the chat turn stopped before a speaker was chosen
function toStoredQuestion(chatTurn: StreamedChatTurn, speaker: PodcastEpisodeSpeaker | undefined): string {
	const { podcastEpisodeChapter } = chatTurn
	return podcastEpisodeChapter
		? withPodcastEpisodeNote(chatTurn.question, { ...podcastEpisodeChapter, speaker: speaker ?? "host" })
		: chatTurn.question
}

// the streamed chat turn, its loaded reply, and whether the reply finished
type SaveFinishedChatTurnOptions = {
	chatTurn: StreamedChatTurn
	loadedChatReply: LoadedChatReply
	isReplyFinished: boolean
}

// save the finished chat turn's spend and text, record the proposal a finished reply leaves standing, and fetch the
// answer's link preview in the background. return null if the chat turn stored no text or the save failed
async function saveFinishedChatTurn({
	chatTurn,
	loadedChatReply,
	isReplyFinished,
}: SaveFinishedChatTurnOptions): Promise<string | null> {
	try {
		// save the chat turn, the agreement check's tokens included. a topic save keeps the chat turn's text even if the
		// gate rejects persistence
		const { text, totalTokens, searchCount, toolCalls, speaker } = await loadedChatReply.chatReply.completion
		const isChatTurnPersisted = chatTurn.isPersisted || chatTurn.toolCalls.count > 0
		const savedChatTurnId = await saveChatTurn({
			userId: chatTurn.userId,
			page: chatTurn.page,
			totalTokens: totalTokens + loadedChatReply.agreementTokens,
			searchCount,
			isPersisted: isChatTurnPersisted,
			question: toStoredQuestion(chatTurn, speaker),
			answer: text,
			toolCalls,
			isSpoken: chatTurn.isSpoken,
			podcastEpisodeChapter: chatTurn.podcastEpisodeChapter,
			podcastAnswerSpeaker: speaker,
			topicPostId: chatTurn.topicPostId,
			isTopicOwner: chatTurn.isTopicOwner,
			analyticsProperties: chatTurn.analyticsProperties,
		})

		// record the proposal the turn leaves standing. a failed record is reported and the save goes on
		if (isReplyFinished && savedChatTurnId) {
			await recordChatProposal({
				userId: chatTurn.userId,
				page: chatTurn.page,
				chatTurnId: savedChatTurnId,
				chatToolCalls: toolCalls,
				topicDraft: chatTurn.toolCalls.topicDraft ?? chatTurn.topicDraft,
			}).catch((error: unknown) => {
				console.error(`recording the proposal failed for ${toChatPageId(chatTurn.page)}`, error)
				reportError(error, "chat", { topicId: toChatPageId(chatTurn.page) })
			})
		}

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
