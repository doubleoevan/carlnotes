// streaming a chat turn's reply to the user, then saving its row, the proposal it leaves standing, and its topic draft,
// then marking the reply's end, writing its suggested reply, and storing its sent attachments

import { withPodcastEpisodeNote } from "@carlnotes/contracts/chatQuestionNotes"
import { toChatReplyLineText } from "@carlnotes/contracts/chatTurns"
import type { PodcastEpisodeSpeaker } from "@carlnotes/contracts/enums"
import type { ChatToolCall } from "@carlnotes/contracts/payloads"
import type { TopicDraft } from "@carlnotes/contracts/topicPayloads"
import { isBudgetRejection, SPENT_BUDGET_REJECTION } from "@carlnotes/models/models"
import { reserveUserSpend, type SpendReservation } from "@carlnotes/models/spendReservations"
import type { ChatReplyStream } from "@carlnotes/pipeline/chat/index"
import type { PodcastEpisodeChapterContext } from "@carlnotes/pipeline/chat/retrievePodcastEpisodeChapter"
import {
	MAX_SUGGESTED_REPLY_DOLLARS,
	type SuggestedReplyChatTurn,
	writeSuggestedReply,
} from "@carlnotes/pipeline/chat/suggestedReply"
import { reportError } from "@carlnotes/server/monitoring"
import { isSuggestedReplyOn } from "@carlnotes/server/suggestedReplySettings"
import type { Context } from "hono"
import { stream } from "hono/streaming"
import type { AnalyticsProperties } from "../currentUser"
import type { ChatTurnToolCalls } from "../tool/chatTools"
import { saveTopicDraft } from "../topic/topicDrafts"
import { storeTopicChatAttachments } from "./attachments"
import type { StorableChatAttachment } from "./chatAttachmentParts"
import { type ChatPage, toChatPageId } from "./chatPages"
import { isInvitingProposal, recordChatProposal, toStandingChatProposal } from "./chatProposals"
import { addChatTurnSpend } from "./chatSpendRows"
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
	// the chat turns before this one that the suggested reply reads, oldest first
	recentChatTurns?: SuggestedReplyChatTurn[]
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

		// save the turn, release its reservation, mark the reply's end, write its suggested reply, and store its files
		await finishStreamedChatTurn({ writeStream, chatTurn, loadedChatReply, isReplyFinished })
	})
}

// the response stream a finished chat turn writes its last lines to: its write, whether the user left, and the call
// that runs once they do
type ChatTurnWriteStream = {
	write: (text: string) => Promise<unknown>
	aborted: boolean
	onAbort: (listener: () => void) => void
}

// the response stream, and the chat turn with its reply
type FinishStreamedChatTurnOptions = SaveFinishedChatTurnOptions & { writeStream: ChatTurnWriteStream }

// what follows the reply: the save, the topic draft, the reservation's release, the saved line, the suggested reply, and the
// sent attachments in the background
async function finishStreamedChatTurn({
	writeStream,
	chatTurn,
	loadedChatReply,
	isReplyFinished,
}: FinishStreamedChatTurnOptions): Promise<void> {
	// save the spend whether the stream finished or broke, then the topic draft the chat turn wrote. a chat turn that
	// created the topic already deleted it
	const savedChatTurn = await saveFinishedChatTurn({ chatTurn, loadedChatReply, isReplyFinished })
	if (chatTurn.toolCalls.topicDraft && !chatTurn.toolCalls.createdTopicId) {
		await saveTopicDraft(chatTurn.userId, chatTurn.toolCalls.topicDraft).catch((error) => {
			console.error("topic draft save failed", error)
			reportError(error, "chat")
		})
	}

	// release the turn's reservation, which the saved row now counts, before the reply's end
	await chatTurn.reservation.release()

	// mark the reply's end, then write the suggested reply under its own reservation and add its spend to the row
	if (isReplyFinished && savedChatTurn) {
		await writeClosingLine(writeStream, toChatReplyLineText({ type: "saved" }))
		await writeSuggestedReplyLine({ writeStream, chatTurn, savedChatTurn })
	}

	// store the sent attachments in the background once the reply has finished. their summaries take seconds.
	// a team or new-topic conversation stores none
	const storedTopicId = chatTurn.page.topicId
	if (storedTopicId !== undefined) {
		storeTopicChatAttachments(
			chatTurn.userId,
			storedTopicId,
			savedChatTurn?.isPersisted ? savedChatTurn.chatTurnId : null,
			chatTurn.attachments,
			chatTurn.litellmApiKey,
		).catch((error) => {
			console.error(`storing chat attachments failed for topic ${storedTopicId}`, error)
			reportError(error, "chat", { topicId: storedTopicId })
		})
	}
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

// a saved chat turn: its row's id, whether the row kept its text, and what carl answered and called
type SavedChatTurn = { chatTurnId: string; isPersisted: boolean; answer: string; chatToolCalls: ChatToolCall[] }

// save the finished chat turn's spend and text, record the proposal a finished reply leaves standing, and fetch the
// answer's link preview in the background. return null if the save failed
async function saveFinishedChatTurn({
	chatTurn,
	loadedChatReply,
	isReplyFinished,
}: SaveFinishedChatTurnOptions): Promise<SavedChatTurn | null> {
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

		// return the row's id, whether it kept its text, and what carl answered and called
		return savedChatTurnId
			? { chatTurnId: savedChatTurnId, isPersisted: isChatTurnPersisted, answer: text, chatToolCalls: toolCalls }
			: null
	} catch (error) {
		// report a failed save
		console.error(`chat turn save failed for ${toChatPageId(chatTurn.page)}`, error)
		reportError(error, "chat", { topicId: toChatPageId(chatTurn.page) })
		return null
	}
}

// the stream the suggested reply is written to, the chat turn it follows, and that chat turn's saved row
type WriteSuggestedReplyLineOptions = {
	writeStream: ChatTurnWriteStream
	chatTurn: StreamedChatTurn
	savedChatTurn: SavedChatTurn
}

// write the suggested reply's line and add its spend to the saved row, if the chat turn may have one. a stopped,
// spoken, podcast, or created turn, a chat the setting leaves off, and a proposal that would invite get none
async function writeSuggestedReplyLine({
	writeStream,
	chatTurn,
	savedChatTurn,
}: WriteSuggestedReplyLineOptions): Promise<void> {
	if (!isSuggestedReplyTurn(chatTurn, savedChatTurn) || writeStream.aborted) {
		return
	}

	// the call reserves its own largest cost, and a spent budget makes no call
	const reservation = await reserveUserSpend({
		userId: chatTurn.userId,
		kind: "suggestedReply",
		maxDollars: MAX_SUGGESTED_REPLY_DOLLARS,
	})
	if (reservation === "rejected") {
		return
	}

	// the call stops when the request aborts, and its reservation is released last, whatever happened
	const requestAbortController = new AbortController()
	writeStream.onAbort(() => requestAbortController.abort())
	try {
		await writeSuggestedReplyAndSpend({
			writeStream,
			chatTurn,
			savedChatTurn,
			requestAbortSignal: requestAbortController.signal,
		})
	} finally {
		await reservation.release()
	}
}

// make one call over the recent turns and this one, write its line, and add its tokens to the turn's saved spend
async function writeSuggestedReplyAndSpend({
	writeStream,
	chatTurn,
	savedChatTurn,
	requestAbortSignal,
}: WriteSuggestedReplyLineOptions & { requestAbortSignal: AbortSignal }): Promise<void> {
	const { suggestedReply, totalTokens } = await writeSuggestedReply({
		chatTurns: [...(chatTurn.recentChatTurns ?? []), { question: chatTurn.question, answer: savedChatTurn.answer }],
		topicDraft: chatTurn.page.newTopic ? (chatTurn.toolCalls.topicDraft ?? chatTurn.topicDraft) : undefined,
		litellmApiKey: chatTurn.litellmApiKey,
		requestAbortSignal,
	})
	if (suggestedReply) {
		await writeClosingLine(writeStream, toChatReplyLineText({ type: "suggestedReply", suggestedReply }))
	}

	// add the call's tokens to the turn's saved spend, and report a failed add
	if (totalTokens > 0) {
		await addChatTurnSpend(savedChatTurn.chatTurnId, totalTokens).catch((error: unknown) => {
			console.error(`adding the suggested reply's spend failed for ${toChatPageId(chatTurn.page)}`, error)
			reportError(error, "chat", { topicId: toChatPageId(chatTurn.page) })
		})
	}
}

// whether a finished chat turn may have a suggested reply: typed, asked from a private chat the setting turns on, not
// from the podcast player, not the turn that created the topic, and leaving no proposal that would invite
function isSuggestedReplyTurn(chatTurn: StreamedChatTurn, savedChatTurn: SavedChatTurn): boolean {
	if (chatTurn.isSpoken || chatTurn.podcastEpisodeChapter || chatTurn.toolCalls.createdTopicId) {
		return false
	}
	if (!isSuggestedReplyOn({ isNewTopicChat: chatTurn.page.newTopic === true })) {
		return false
	}
	// a "yes" to a proposal that invites would agree to emailing those people too
	const standingChatProposal = toStandingChatProposal({
		page: chatTurn.page,
		chatToolCalls: savedChatTurn.chatToolCalls,
		topicDraft: chatTurn.toolCalls.topicDraft ?? chatTurn.topicDraft,
	})
	return !standingChatProposal || !isInvitingProposal(standingChatProposal)
}
