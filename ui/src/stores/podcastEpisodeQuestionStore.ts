// a question asked from the podcast player: it pauses the podcast episode, listens, sends the question to the topic's
// private chat with the chapter that was playing, has carl or vienna answer out loud, and resumes the podcast episode
// by its rules
import type { ChatConversation } from "@shared/contracts/chat"
import { withPodcastEpisodeNote } from "@shared/contracts/chatQuestionNotes"
import type { PodcastEpisode } from "@shared/contracts/podcast"
import type { PodcastEpisodeSpeaker } from "@shared/enums"
import { toast } from "sonner"
import { type ChatSendResult, fetchChatConversation, sendChatTurn } from "@/clients/chatClient"
import { type SpokenQuestionTimings, toVoiceChatPage } from "@/clients/voiceClient"
import { toChatHistoryTurns } from "@/components/chat/chatHistoryTurns"
import {
	CHAT_FAILED_TOAST,
	CHAT_REJECTION_COPY,
	PLANS_ACTION_LABEL,
	PLANS_PATH,
	toastChatRejection,
} from "@/components/chat/chatRejectionCopy"
import { type ChatTurn, toFinishedChatTurns, toLoadedChatTurn, toSentChatTurn } from "@/components/chat/chatTurns"
import type { VoiceRecording } from "@/components/chat/useVoiceRecording"
import { toChapterAtPosition, toPodcastEpisodeSpeakerMediaMetadata } from "@/lib/podcastEpisodePlayback"
import {
	pausePodcastEpisode,
	resumePodcastEpisode,
	toPodcastEpisodeQuestionStart,
} from "@/stores/podcastEpisodePlayerStore"
import {
	type PodcastEpisodeQuestionEnding,
	type PodcastEpisodeQuestionPhase,
	type PodcastEpisodeQuestionView,
	RESUME_BEAT_MS,
	toPodcastEpisodeResume,
} from "@/stores/podcastEpisodeQuestionRules"
import type { SpokenAnswerEnd } from "@/stores/spokenAnswerQueue"
import { stopSpokenAnswerKey, subscribeToSpokenAnswerEnd } from "@/stores/spokenAnswerStore"
import { toEventListeners, toStoreListeners } from "@/stores/storeListeners"
import { toStreamedSpokenAnswer } from "@/stores/streamedSpokenAnswer"

// the recording's send that ends it early and its cancel, which the question keeps
type PodcastEpisodeQuestionRecording = Pick<VoiceRecording, "send" | "cancel">

// the question in progress
type PodcastEpisodeQuestion = {
	// where the question is, and the speaker answering once the reply names them
	phase: Exclude<PodcastEpisodeQuestionPhase, "idle">
	speaker: PodcastEpisodeSpeaker | null
	// the podcast episode, the chapter at the playback position, and whether the podcast episode was playing at the tap
	podcastEpisode: PodcastEpisode
	chapterPosition: number
	isPlayingAtTap: boolean
	// the conversation whose history the question sends, the reply's spoken answer key, and what stops the question
	chatConversation: ChatConversation | null
	spokenAnswerKey: string | null
	abortController: AbortController | null
	// the recording's send and cancel, and whether it is recording, so every podcast mic slot shows its send
	voiceRecording: PodcastEpisodeQuestionRecording
	isVoiceRecording: boolean
	// the unsubscribe of the listener that ends the question when its spoken answer ends
	unsubscribeSpokenAnswerEnd: (() => void) | null
}

// one snapshot of a question's chat turn, for a chat panel that shows the topic's private chat, and whether the chat
// turn was dropped, as a stop before any text drops it
export type PodcastEpisodeQuestionChatTurn = { topicId: string; chatTurn: ChatTurn; isDropped: boolean }

// the question in progress, the beat before a resume, and the store's listeners
let podcastEpisodeQuestion: PodcastEpisodeQuestion | null = null
let resumeTimeout: ReturnType<typeof setTimeout> | null = null
const { publish, useStoreVersion } = toStoreListeners()

// the listeners told each time a question's chat turn changes
const podcastEpisodeQuestionChatTurnListeners = toEventListeners<PodcastEpisodeQuestionChatTurn>()

/**
 * Returns the question in progress as the player shows it, with whether its recording runs, and re-renders the
 * component each time it changes.
 */
export function usePodcastEpisodeQuestion(): PodcastEpisodeQuestionView & { isVoiceRecording: boolean } {
	useStoreVersion()
	return {
		phase: podcastEpisodeQuestion?.phase ?? "idle",
		speaker: podcastEpisodeQuestion?.speaker ?? null,
		isVoiceRecording: podcastEpisodeQuestion?.isVoiceRecording ?? false,
	}
}

/**
 * Starts a question in the mic tap with the recording's send and cancel: notes whether the podcast episode was playing
 * and the chapter at the playback position, then pauses the podcast episode. Returns false with no podcast episode
 * loaded or with a question already in progress.
 */
export function startPodcastEpisodeQuestion(voiceRecording: PodcastEpisodeQuestionRecording): boolean {
	// one question at a time, so a second mic on the page never replaces a question in progress
	const podcastEpisodeQuestionStart = toPodcastEpisodeQuestionStart()
	if (!podcastEpisodeQuestionStart || podcastEpisodeQuestion) {
		return false
	}

	// a question asked within an earlier one's beat was asked over a playing podcast episode, and keeps it paused
	const isResumePending = resumeTimeout !== null
	clearResumeTimeout()
	const { podcastEpisode, chapterPosition, isPlaying } = podcastEpisodeQuestionStart
	podcastEpisodeQuestion = {
		phase: "listening",
		speaker: null,
		podcastEpisode,
		chapterPosition,
		isPlayingAtTap: isPlaying || isResumePending,
		chatConversation: null,
		spokenAnswerKey: null,
		abortController: null,
		voiceRecording,
		isVoiceRecording: false,
		unsubscribeSpokenAnswerEnd: null,
	}
	pausePodcastEpisode()
	publish()
	return true
}

/**
 * Marks the question in progress as recording, so every podcast mic slot shows its send, and returns the call that
 * marks the recording done. The returned call leaves a later question alone.
 */
export function markPodcastEpisodeQuestionRecording(): () => void {
	const question = podcastEpisodeQuestion
	if (!question) {
		return () => {}
	}

	// recording until the returned call
	question.isVoiceRecording = true
	publish()

	// the returned call marks the recording done, if the question is still the question in progress
	return () => {
		if (podcastEpisodeQuestion === question) {
			question.isVoiceRecording = false
			publish()
		}
	}
}

/**
 * Sends the question's running recording early, from any podcast mic slot.
 */
export function sendPodcastEpisodeQuestionRecording(): void {
	podcastEpisodeQuestion?.voiceRecording.send()
}

/**
 * Loads the topic's private conversation, whose history the question sends, before the microphone is asked for.
 * Returns false if the question cannot be asked: a spent budget toasts the upgrade line, and anything else the chat's
 * own words.
 */
export async function loadPodcastEpisodeQuestionConversation(): Promise<boolean> {
	const question = podcastEpisodeQuestion
	if (!question) {
		return false
	}

	// the conversation, or the chat's failure if it cannot load. a question ended while it loaded asks nothing
	const chatConversation = await fetchChatConversation({ topicId: question.podcastEpisode.topicId }).catch(() => null)
	if (podcastEpisodeQuestion !== question) {
		return false
	}

	// a spent budget toasts the upgrade line, and any other rejection the chat's failure
	if (!chatConversation?.canChat) {
		if (chatConversation?.isBudgetExhausted) {
			toastSpentBudget()
		} else {
			toast(CHAT_FAILED_TOAST)
		}
		return false
	}

	// the history the question sends
	question.chatConversation = chatConversation
	return true
}

/**
 * Asks the transcript to the topic's private chat with the chapter it was asked during, and has the host the question
 * picks answer out loud. The answer's end resumes the podcast episode.
 */
export async function askPodcastEpisodeQuestion(
	transcript: string,
	spokenQuestionTimings: SpokenQuestionTimings,
): Promise<void> {
	const question = podcastEpisodeQuestion
	if (question?.phase !== "listening") {
		return
	}

	// the question waits for its answer, shown in the chat as a chat turn with its tag
	question.phase = "thinking"
	publish()
	const { podcastEpisode, chapterPosition } = question
	const page = { topicId: podcastEpisode.topicId }
	const podcastEpisodeChapter = { podcastEpisodeId: podcastEpisode.id, chapterPosition }
	let chatTurn: ChatTurn = {
		...toSentChatTurn({ question: withQuestionPodcastEpisodeNote(transcript, question, "host"), attachments: [] }),
		podcastEpisodeChapter,
	}
	question.spokenAnswerKey = chatTurn.spokenAnswerKey
	question.unsubscribeSpokenAnswerEnd = subscribeToSpokenAnswerEnd((spokenAnswerEnd) =>
		endOnSpokenAnswerEnd(question, spokenAnswerEnd),
	)
	announcePodcastEpisodeQuestionChatTurn(page.topicId, chatTurn)

	// the answer is spoken as it streams, in the voice of the host the reply names, and its first word starts answering
	const streamedSpokenAnswer = toStreamedSpokenAnswer({
		spokenAnswerKey: chatTurn.spokenAnswerKey,
		page: toVoiceChatPage(page),
		spokenQuestionTimings,
		chatTurnKind: "podcast",
		onPlaying: () => changePhase(question, "answering"),
	})
	let answer = ""

	// stream under a fresh abort controller, so the stop can cut this question
	question.abortController = new AbortController()
	const chatSendResult = await sendChatTurn({
		page,
		question: transcript,
		history: toChatHistoryTurns((question.chatConversation?.chatTurns ?? []).map(toLoadedChatTurn)),
		attachments: [],
		signal: question.abortController.signal,
		isSpoken: true,
		podcastEpisodeChapter,
		onSpeaker: (speaker) => {
			question.speaker = speaker
			streamedSpokenAnswer.setSpeaker(speaker, toPodcastEpisodeSpeakerMediaMetadata(podcastEpisode, speaker))
			chatTurn = { ...chatTurn, speaker, question: withQuestionPodcastEpisodeNote(transcript, question, speaker) }
			announcePodcastEpisodeQuestionChatTurn(page.topicId, chatTurn)
			publish()
		},
		onChunk: (chunk) => {
			// the answer so far, spoken and shown
			answer += chunk
			streamedSpokenAnswer.appendChunk(answer)
			chatTurn = { ...chatTurn, answer }
			announcePodcastEpisodeQuestionChatTurn(page.topicId, chatTurn)
		},
	})

	// the finished chat turn reaches the chat, a rejected chat turn ends the question saying why, and the answer speaks
	// its rest
	question.abortController = null
	const [finishedChatTurn] = toFinishedChatTurns([chatTurn], {
		spokenAnswerKey: chatTurn.spokenAnswerKey,
		chatSendResult,
	})
	if (finishedChatTurn) {
		announcePodcastEpisodeQuestionChatTurn(page.topicId, finishedChatTurn)
	} else {
		// a stop before any text drops the chat turn, so a chat panel showing it drops it too
		podcastEpisodeQuestionChatTurnListeners.announce({ topicId: page.topicId, chatTurn, isDropped: true })
	}
	finishPodcastEpisodeQuestionChatTurn(question, chatSendResult)
	streamedSpokenAnswer.finish(answer, chatSendResult)
}

/**
 * Ends the question in progress, stopping its recording, its chat turn, or its answer, and resumes the podcast episode
 * by the ending's rule.
 */
export function endPodcastEpisodeQuestion(questionEnding: PodcastEpisodeQuestionEnding): void {
	const question = podcastEpisodeQuestion
	if (!question) {
		return
	}

	// drop the question first, so every stop below finds nothing left to end
	podcastEpisodeQuestion = null
	publish()
	question.unsubscribeSpokenAnswerEnd?.()
	question.voiceRecording.cancel()
	question.abortController?.abort()
	if (question.spokenAnswerKey) {
		stopSpokenAnswerKey(question.spokenAnswerKey)
	}

	// resume after the beat, at once, or not at all
	const podcastEpisodeResume = toPodcastEpisodeResume({ questionEnding, isPlayingAtTap: question.isPlayingAtTap })
	if (podcastEpisodeResume === "resumeNow") {
		resumePodcastEpisode()
	} else if (podcastEpisodeResume === "resumeAfterBeat") {
		// one beat at a time, cleared once it fires so a later question never reads it as pending
		clearResumeTimeout()
		resumeTimeout = setTimeout(() => {
			resumeTimeout = null
			resumePodcastEpisode()
		}, RESUME_BEAT_MS)
	}
}

/**
 * Calls the listener each time a question on this topic changes or drops its chat turn, and returns the unsubscribe.
 */
export function subscribeToPodcastEpisodeQuestionChatTurn(
	topicId: string,
	listener: (podcastEpisodeQuestionChatTurn: PodcastEpisodeQuestionChatTurn) => void,
): () => void {
	// a question on another topic is not this listener's
	const topicListener = (podcastEpisodeQuestionChatTurn: PodcastEpisodeQuestionChatTurn): void => {
		if (podcastEpisodeQuestionChatTurn.topicId === topicId) {
			listener(podcastEpisodeQuestionChatTurn)
		}
	}

	// listen until the unsubscribe
	return podcastEpisodeQuestionChatTurnListeners.subscribe(topicListener)
}

// a chat turn that did not answer ends the question, saying why: a spent budget toasts the upgrade line, and every
// other rejection the chat's own words. a stop already ended it
function finishPodcastEpisodeQuestionChatTurn(question: PodcastEpisodeQuestion, chatSendResult: ChatSendResult): void {
	if (podcastEpisodeQuestion !== question || chatSendResult === null || chatSendResult === "stopped") {
		return
	}

	// say why, then resume the podcast episode
	toastChatRejection(chatSendResult, toastSpentBudget)
	endPodcastEpisodeQuestion("failed")
}

/**
 * Toasts the spent budget's upgrade line, with the action that opens the plans page.
 */
export function toastSpentBudget(): void {
	toast(CHAT_REJECTION_COPY.budget, {
		action: { label: PLANS_ACTION_LABEL, onClick: () => window.location.assign(PLANS_PATH) },
	})
}

// the end of the question's spoken answer ends the question. a reply that finished before a word played had nothing to
// speak, and a lock-screen pause stays paused
function endOnSpokenAnswerEnd(
	question: PodcastEpisodeQuestion,
	{ spokenAnswerKey, isPlayedToEnd, isMediaSessionPause }: SpokenAnswerEnd,
): void {
	if (podcastEpisodeQuestion !== question || question.spokenAnswerKey !== spokenAnswerKey) {
		return
	}

	// a played answer finished, or there was nothing to play
	if (isPlayedToEnd) {
		endPodcastEpisodeQuestion(question.phase === "answering" ? "finished" : "unspoken")
		return
	}
	endPodcastEpisodeQuestion(isMediaSessionPause ? "paused" : "stopped")
}

// the transcript with the note naming the podcast episode, the chapter, and the speaker who answered
function withQuestionPodcastEpisodeNote(
	transcript: string,
	question: PodcastEpisodeQuestion,
	speaker: PodcastEpisodeSpeaker,
): string {
	const { podcastEpisode, chapterPosition } = question
	const chapter = toChapterAtPosition(podcastEpisode.chapters, chapterPosition)
	return withPodcastEpisodeNote(transcript, {
		podcastEpisodeTitle: podcastEpisode.title ?? "",
		chapterPosition,
		chapterTitle: chapter?.title ?? "",
		speaker,
	})
}

// move the question to a phase, if it is still the question in progress
function changePhase(question: PodcastEpisodeQuestion, phase: PodcastEpisodeQuestion["phase"]): void {
	if (podcastEpisodeQuestion === question) {
		question.phase = phase
		publish()
	}
}

// tell the listeners a question's chat turn changed
function announcePodcastEpisodeQuestionChatTurn(topicId: string, chatTurn: ChatTurn): void {
	podcastEpisodeQuestionChatTurnListeners.announce({ topicId, chatTurn, isDropped: false })
}

// drop the beat before a resume, if one is waiting
function clearResumeTimeout(): void {
	if (resumeTimeout) {
		clearTimeout(resumeTimeout)
		resumeTimeout = null
	}
}
