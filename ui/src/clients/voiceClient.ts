// the voice chat client: whether spoken questions are allowed, the transcription post, a spoken answer's audio, and the
// spoken events. each uses fetch. a multipart body and a binary response do not fit the typed hono client
import { SPOKEN_QUESTIONS_PAUSED_ERROR, type SpokenQuestionsState } from "@shared/contracts/chat"
import type { ConversationChatTurnKind } from "@shared/enums"
import type { SpokenAnswerPayload, SpokenEventPayload, VoiceChatPage } from "@shared/payloads"
import { readApiErrorMessage } from "@/clients/apiClient"
import { type ChatPage, type ChatRejection, toChatRejection } from "@/clients/chatClient"

// the longest wait before the one retry of a 503 or a network failure, and the wait if the response named none
const RETRY_AFTER_MAX_SECONDS = 5
const RETRY_AFTER_DEFAULT_SECONDS = 1

// what the browser measured for a spoken question, kept from the recording's send until the event posts
export type SpokenQuestionTimings = {
	secondsRecorded: number
	transcriptionMs: number
	// when the recording was sent, which the reply's first spoken word is measured from
	recordingSentAt: number
}

// what a rejected transcription returns: a chat rejection or the spoken questions cutoff
export type TranscriptionRejection = ChatRejection | "spokenQuestionsPaused"

export type SendTranscriptionOptions = {
	page: VoiceChatPage
	recording: Blob
}

export type SendSpokenQuestionEventOptions = {
	page: VoiceChatPage
	spokenQuestionTimings: SpokenQuestionTimings
	// when the reply's first spoken part started playing, or null if nothing played
	playingAt: number | null
	// whether the question was asked from the chat or from the podcast player
	chatTurnKind?: ConversationChatTurnKind
}

/**
 * Returns the voice chat page for a private conversation's page.
 */
export function toVoiceChatPage(chatPage: ChatPage): VoiceChatPage {
	if (chatPage.topicId !== undefined) {
		return { kind: "topic", topicId: chatPage.topicId }
	}
	return chatPage.teamId !== undefined ? { kind: "team", teamId: chatPage.teamId } : { kind: "newTopic" }
}

/**
 * Posts a recording for transcription and returns the transcript, which is empty if the model transcribed no words,
 * or the rejection a failed status means.
 */
export async function sendTranscription({
	page,
	recording,
}: SendTranscriptionOptions): Promise<{ transcript: string } | TranscriptionRejection> {
	// the page goes as json beside the recording, which is named for the container the browser recorded
	const formData = new FormData()
	formData.append("page", JSON.stringify(page))
	formData.append("recording", recording, toRecordingFileName(recording.type))

	// a failed status is a rejection, and a request that never arrived is a failure
	try {
		const response = await fetchWithOneRetry("/api/chat/transcription", { method: "POST", body: formData })

		// the spoken questions cutoff's own 402 says so, and every other failed status is a chat rejection
		if (!response.ok) {
			return (await isSpokenQuestionsPausedResponse(response))
				? "spokenQuestionsPaused"
				: toChatRejection(response.status)
		}
		return (await response.json()) as { transcript: string }
	} catch (error) {
		// the network's own failure
		console.error("transcription failed", error)
		return "failed"
	}
}

/**
 * Returns whether the user's spoken questions are allowed, paused by the spoken questions cutoff, or stopped by a spent
 * budget, and allowed if the read fails.
 */
export async function fetchSpokenQuestionsStatus(): Promise<SpokenQuestionsState["status"]> {
	try {
		const response = await fetch("/api/chat/spoken-questions")
		return response.ok ? ((await response.json()) as SpokenQuestionsState).status : "allowed"
	} catch (error) {
		// the network's own failure
		console.error("spoken questions read failed", error)
		return "allowed"
	}
}

// whether a rejected transcription is the spoken questions cutoff's own 402
async function isSpokenQuestionsPausedResponse(response: Response): Promise<boolean> {
	return response.status === 402 && (await readApiErrorMessage(response)) === SPOKEN_QUESTIONS_PAUSED_ERROR
}

/**
 * Returns the file name a recording posts under, by its container.
 */
export function toRecordingFileName(mimeType: string): string {
	return mimeType.startsWith("audio/mp4") ? "recording.mp4" : "recording.webm"
}

/**
 * Fetches the audio of one spoken part of carl's answer, or the rejection a failed status or a failed request means.
 */
export async function fetchSpokenAnswerAudio({
	page,
	text,
	speaker,
}: SpokenAnswerPayload): Promise<Blob | ChatRejection> {
	// a failed status is a rejection, and a request that never arrived is a failure
	try {
		const response = await fetchWithOneRetry("/api/chat/speech", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ page, text, speaker }),
		})
		return response.ok ? await response.blob() : toChatRejection(response.status)
	} catch (error) {
		// the network's own failure
		console.error("spoken answer audio failed", error)
		return "failed"
	}
}

// fetch a request, and fetch it once more after a 503 or a network failure, after the wait toRetryDelayMs returns.
// a retry whose request never arrived throws
async function fetchWithOneRetry(url: string, init: RequestInit): Promise<Response> {
	// the first attempt, with a network failure read as no response
	const firstResponse = await fetch(url, init).catch((error: unknown) => {
		console.error("voice request failed, retrying", error)
		return null
	})
	if (firstResponse !== null && firstResponse.status !== 503) {
		return firstResponse
	}

	// wait as long as the response asked, then try once more
	await new Promise((resolve) => setTimeout(resolve, toRetryDelayMs(firstResponse)))
	return fetch(url, init)
}

/**
 * Returns how long to wait before the retry: the response's Retry-After seconds, at most RETRY_AFTER_MAX_SECONDS,
 * or RETRY_AFTER_DEFAULT_SECONDS if there is no response or it named no wait.
 */
export function toRetryDelayMs(response: Response | null): number {
	// the named wait within the bounds, or the default wait
	const retryAfterSeconds = Number.parseFloat(response?.headers.get("Retry-After") ?? "")
	const delaySeconds = Number.isNaN(retryAfterSeconds) ? RETRY_AFTER_DEFAULT_SECONDS : retryAfterSeconds
	return Math.min(RETRY_AFTER_MAX_SECONDS, Math.max(0, delaySeconds)) * 1000
}

/**
 * Posts a spoken event with a request that outlives the page. A failed post is dropped.
 */
export function sendSpokenEvent({ page, event }: SpokenEventPayload): void {
	// keepalive lets the post finish after the page is gone
	fetch("/api/chat/spoken-events", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ page, event }),
		keepalive: true,
	}).catch(() => {})
}

/**
 * Posts the spoken question event for a question's timings and when its reply started playing.
 */
export function sendSpokenQuestionEvent({
	page,
	spokenQuestionTimings,
	playingAt,
	chatTurnKind,
}: SendSpokenQuestionEventOptions): void {
	sendSpokenEvent({ page, event: toSpokenQuestionEvent(spokenQuestionTimings, playingAt, chatTurnKind) })
}

/**
 * Returns the spoken question event for a question's timings, with the first spoken word's delay from the
 * recording's send if the reply played, and without it if nothing played.
 */
export function toSpokenQuestionEvent(
	spokenQuestionTimings: SpokenQuestionTimings,
	playingAt: number | null,
	chatTurnKind: ConversationChatTurnKind = "private",
): SpokenEventPayload["event"] {
	// the first spoken word's delay is left out if nothing played
	return {
		kind: "question",
		secondsRecorded: spokenQuestionTimings.secondsRecorded,
		transcriptionMs: spokenQuestionTimings.transcriptionMs,
		chatTurnKind,
		...(playingAt === null
			? {}
			: { firstSpokenWordMs: Math.max(0, playingAt - spokenQuestionTimings.recordingSentAt) }),
	}
}
