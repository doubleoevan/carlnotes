// the voice routes: whether the user's spoken questions are allowed, paused, or stopped by a spent budget, a spoken
// question's transcription, one spoken part of a reply as speech in the voice of the speaker who gave it, and the
// spoken events. each but the first names its chat page in the request. a model call is checked under that page's chat
// turn gate, and an event under the page's access alone
import { zValidator } from "@hono/zod-validator"
import { trackEvent } from "@shared/analytics"
import { SPOKEN_QUESTIONS_PAUSED_ERROR, type SpokenQuestionsState } from "@shared/contracts/chat"
import { reportError } from "@shared/monitoring"
import {
	type SpokenEventPayload,
	spokenAnswerPayload,
	spokenEventPayload,
	type VoiceChatPage,
	voiceChatPagePayload,
} from "@shared/payloads"
import { type Context, Hono } from "hono"
import { isMonthlyBudgetCutoffPassed } from "../../db/monthlyBudgetCutoffs"
import { loadOrProvisionUserLiteLLMKey } from "../../worker"
import { speechCost, transcriptionCost } from "../../worker/budget"
import {
	type ModelCallFailure,
	recordSpokenAnswer,
	SPOKEN_ANSWER_SPEECH_TIER,
	toRetryableModelCallFailure,
} from "../../worker/speech"
import { transcodeRecording, transcribeRecording } from "../../worker/transcription"
import { loadMonthlyBudgetCutoffStatus } from "../authorization"
import { toBodyLimit, VOICE_RECORDING_BODY_LIMIT_BYTES } from "../bodyLimit"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { speechRateLimiter, spokenEventRateLimiter, toolCallerRateLimiter } from "../rateLimit"
import { toChatRejection } from "./chatTurnAuthorization"
import {
	type RecordChatSpendRowOptions,
	recordChatSpendRow,
	toChatKind,
	type VoiceSpendChatTurnKind,
} from "./chatTurns"
import { chatSignedOutRejection } from "./privateChat"
import {
	authorizeVoiceChatPage,
	authorizeVoiceChatPageAccess,
	type VoiceChatPageAuthorization,
} from "./voiceAuthorization"

// the paths of the spoken questions, the transcription, the speech, and the spoken events routes, after the /api base
export const SPOKEN_QUESTIONS_PATH = "/chat/spoken-questions"
export const VOICE_TRANSCRIPTION_PATH = "/chat/transcription"
export const VOICE_SPEECH_PATH = "/chat/speech"
export const SPOKEN_EVENTS_PATH = "/chat/spoken-events"

// how long a browser waits before it retries a model call that the proxy turned down for the moment, or a transcode
// that the process had no room for
const MODEL_RETRY_AFTER_SECONDS = 5

// how many recordings the process transcodes at once, and how many are transcoding now
export const TRANSCODE_CONCURRENCY_LIMIT = 4
let activeTranscodeCount = 0

// how many spoken parts one user may have in progress at once, and how many each user has in progress now
export const SPOKEN_PARTS_IN_PROGRESS_LIMIT = 3
const spokenPartsInProgressByUserId = new Map<string, number>()

// the recording's body limit, sized for a minute of opus with its multipart envelope
const voiceRecordingBodyLimit = toBodyLimit(VOICE_RECORDING_BODY_LIMIT_BYTES, "That recording is too long.")

// the response for a rejected voice request: a chat room the user may not use answers like a missing one, and any
// other status answers as the chat turn's own rejection does
function rejectVoiceRequest(
	context: Context,
	authorization: Exclude<VoiceChatPageAuthorization, { status: "allowed" }>,
): Response {
	return authorization.status === "notFound"
		? context.json({ error: "not found" }, 404)
		: toChatRejection(context, authorization.status)
}

// the response for a model call that failed: a spent key is 402, a failure a retry can fix is 503 with a retry,
// and any other rejection is 502. the proxy's reason is logged and reported, and never sent
function rejectModelCall(context: Context, failure: ModelCallFailure, modelCall: VoiceSpendChatTurnKind): Response {
	console.error(`${modelCall} failed: ${failure.reason}`)
	// a spent key reads as the chat turn's budget rejection, and is never reported
	if (failure.outcome === "budget-spent") {
		return toChatRejection(context, "budget")
	}

	// report the failure under a fixed message per model call and outcome, with the reason in the extra fields
	reportError(new Error(`${modelCall} ${failure.outcome}`), "chat", {
		modelCall,
		outcome: failure.outcome,
		httpStatus: String(failure.httpStatus ?? "none"),
		reason: failure.reason,
	})
	// a rate limit or a failing proxy is worth another attempt in a moment
	if (failure.outcome === "retryable") {
		return context.json({ error: `${modelCall} unavailable` }, 503, {
			"Retry-After": String(MODEL_RETRY_AFTER_SECONDS),
		})
	}
	return context.json({ error: `${modelCall} failed` }, 502)
}

// record a paid model call's spend row. the call was paid either way, so a failed insert is logged and reported, and
// the call's result still returns
async function recordPaidModelCall(spendRowOptions: RecordChatSpendRowOptions): Promise<void> {
	try {
		await recordChatSpendRow(spendRowOptions)
	} catch (error) {
		console.error(`the ${spendRowOptions.kind} spend row could not be recorded`, error)
		reportError(error, "chat", { userId: spendRowOptions.userId, modelCall: spendRowOptions.kind })
	}
}

// transcode a recording in one of the process's transcode slots, or return null for a recording ffmpeg cannot read
async function transcodeRecordingInSlot(recording: File): Promise<Uint8Array | null> {
	activeTranscodeCount++
	try {
		return await transcodeRecording(new Uint8Array(await recording.arrayBuffer()))
	} catch (error) {
		// log a recording that could not be transcoded
		console.error("recording transcode failed", error)
		return null
	} finally {
		activeTranscodeCount--
	}
}

// take one of the user's spoken part slots, or return false if the user already has the limit in progress
function startSpokenPart(userId: string): boolean {
	const spokenPartCount = spokenPartsInProgressByUserId.get(userId) ?? 0
	if (spokenPartCount >= SPOKEN_PARTS_IN_PROGRESS_LIMIT) {
		return false
	}
	spokenPartsInProgressByUserId.set(userId, spokenPartCount + 1)
	return true
}

// give back one of the user's spoken part slots, and drop the user's entry at zero
function finishSpokenPart(userId: string): void {
	const spokenPartCount = (spokenPartsInProgressByUserId.get(userId) ?? 1) - 1
	if (spokenPartCount > 0) {
		spokenPartsInProgressByUserId.set(userId, spokenPartCount)
	} else {
		spokenPartsInProgressByUserId.delete(userId)
	}
}

// the chat page a transcription names, read from its multipart field, or null for a field that is not a page
function toTranscriptionPage(pageField: string | File | undefined): VoiceChatPage | null {
	if (typeof pageField !== "string") {
		return null
	}
	// parse the field as json, or return null for a field that fails to parse
	try {
		const parsedPage = voiceChatPagePayload.safeParse(JSON.parse(pageField))
		return parsedPage.success ? parsedPage.data : null
	} catch {
		return null
	}
}

// the ids an event names: the page's topic, its team, or both for a chat room
function toVoiceChatPageIds(page: VoiceChatPage): { topicId?: string; teamId?: string } {
	// a topic's page names its topic, and a team's page names its team
	if (page.kind === "topic") {
		return { topicId: page.topicId }
	}
	if (page.kind === "team") {
		return { teamId: page.teamId }
	}
	// the new-topic chat names neither, and a chat room names its team and its topic if it has one
	if (page.kind === "newTopic") {
		return {}
	}
	return { teamId: page.teamId, ...(page.topicId ? { topicId: page.topicId } : {}) }
}

// a spoken event's own properties: a question's timings and where it was asked from, or nothing for a play tap
function toSpokenEventProperties(event: SpokenEventPayload["event"]): Record<string, number | string> {
	if (event.kind !== "question") {
		return {}
	}
	// the time to the first spoken word is absent if nothing played
	const { secondsRecorded, transcriptionMs, firstSpokenWordMs, chatTurnKind } = event
	return {
		secondsRecorded,
		transcriptionMs,
		chatTurnKind,
		...(firstSpokenWordMs === undefined ? {} : { firstSpokenWordMs }),
	}
}

// the voice routes. a visitor is rejected before any body is read, each model call's page answers as its chat turn
// would, and an event's page answers by its access alone
export const voiceRoute = new Hono<AppEnv>()
	.get(SPOKEN_QUESTIONS_PATH, async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return toChatRejection(context, "signup")
		}

		// whether the user's budget is spent, their spend is past the spoken questions cutoff, or it is under the cutoff
		const spokenQuestionsState: SpokenQuestionsState = {
			status: await loadMonthlyBudgetCutoffStatus(userId, "spokenQuestions"),
		}
		return context.json(spokenQuestionsState)
	})
	.post(
		VOICE_TRANSCRIPTION_PATH,
		toolCallerRateLimiter,
		chatSignedOutRejection,
		voiceRecordingBodyLimit,
		async (context) => {
			// read the page and the recording from the multipart body. any other body parses as empty
			const body = await context.req.parseBody()
			const page = toTranscriptionPage(body.page)
			const recording = body.recording
			if (!page || !(recording instanceof File)) {
				return context.json({ error: "a page and a recording are required" }, 400)
			}

			// authorize the page, then the user's spend against the spoken questions cutoff, before any model is called
			const authorization = await authorizeVoiceChatPage(currentUser(context), page)
			if (authorization.status !== "allowed") {
				return rejectVoiceRequest(context, authorization)
			}
			if (await isMonthlyBudgetCutoffPassed(authorization.userId, "spokenQuestions")) {
				return context.json({ error: SPOKEN_QUESTIONS_PAUSED_ERROR }, 402)
			}

			// reject the recording for a moment if the process is transcoding its limit, before the recording is copied
			// for ffmpeg
			if (activeTranscodeCount >= TRANSCODE_CONCURRENCY_LIMIT) {
				return context.json({ error: "transcription busy" }, 503, {
					"Retry-After": String(MODEL_RETRY_AFTER_SECONDS),
				})
			}

			// transcode the recording to the WAV the model reads. a recording ffmpeg cannot read is the browser's to retry
			const audioBytes = await transcodeRecordingInSlot(recording)
			if (!audioBytes) {
				return context.json({ error: "That recording couldn't be read." }, 422)
			}

			// transcribe on the user's key, created first if the user has none. a key the proxy could not load is a
			// failure a retry can fix
			const { userId } = authorization
			const litellmApiKey = await loadOrProvisionUserLiteLLMKey(userId).catch(toRetryableModelCallFailure)
			if (typeof litellmApiKey !== "string") {
				return rejectModelCall(context, litellmApiKey, "transcription")
			}
			const transcribeRecordingResult = await transcribeRecording({ audioBytes, litellmApiKey })

			// a recording with no samples called no model, so it returns an empty transcript with no spend row
			if (transcribeRecordingResult.outcome === "silent") {
				return context.json({ transcript: "" })
			}
			if (transcribeRecordingResult.outcome !== "transcribed") {
				return rejectModelCall(context, transcribeRecordingResult, "transcription")
			}

			// record the spend as soon as the transcript returns, empty or not. the call was paid either way
			const { transcript, inputTokens, outputTokens } = transcribeRecordingResult
			await recordPaidModelCall({
				kind: "transcription",
				userId,
				page,
				cost: transcriptionCost({ inputTokens, outputTokens }),
				totalTokens: inputTokens + outputTokens,
			})
			return context.json({ transcript })
		},
	)
	.post(
		VOICE_SPEECH_PATH,
		speechRateLimiter,
		chatSignedOutRejection,
		zValidator("json", spokenAnswerPayload),
		async (context) => {
			// authorize the page before any model is called
			const { page, text, speaker } = context.req.valid("json")
			const authorization = await authorizeVoiceChatPage(currentUser(context), page)
			if (authorization.status !== "allowed") {
				return rejectVoiceRequest(context, authorization)
			}

			// reject the spoken part if the user already has the limit in progress
			const { userId } = authorization
			if (!startSpokenPart(userId)) {
				return context.json({ error: "rate limited" }, 429)
			}
			try {
				// speak the spoken part on the user's key, created first if the user has none. a key the proxy could not load
				// is a failure a retry can fix
				const litellmApiKey = await loadOrProvisionUserLiteLLMKey(userId).catch(toRetryableModelCallFailure)
				if (typeof litellmApiKey !== "string") {
					return rejectModelCall(context, litellmApiKey, "speech")
				}
				const recordSpokenAnswerResult = await recordSpokenAnswer({ text, speaker, litellmApiKey })
				if (recordSpokenAnswerResult.outcome !== "recorded") {
					return rejectModelCall(context, recordSpokenAnswerResult, "speech")
				}

				// record the spoken part's spend on the spoken answer's tier, then return the audio, which no cache may keep
				const { audioBytes, audioContentType, inputTokens, audioTokens } = recordSpokenAnswerResult
				await recordPaidModelCall({
					kind: "speech",
					userId,
					page,
					cost: speechCost({ speechTier: SPOKEN_ANSWER_SPEECH_TIER, inputTokens, audioTokens }),
					totalTokens: inputTokens + audioTokens,
				})
				return context.body(audioBytes as unknown as ArrayBuffer, 200, {
					"Content-Type": audioContentType,
					"Cache-Control": "private, no-store",
				})
			} finally {
				finishSpokenPart(userId)
			}
		},
	)
	.post(
		SPOKEN_EVENTS_PATH,
		spokenEventRateLimiter,
		chatSignedOutRejection,
		zValidator("json", spokenEventPayload),
		async (context) => {
			// check the page's access alone, so an event is only ever counted where the user may use the page
			const { page, event } = context.req.valid("json")
			const pageAccess = await authorizeVoiceChatPageAccess(currentUser(context), page)
			if (pageAccess.status !== "allowed") {
				return rejectVoiceRequest(context, pageAccess)
			}

			// count the event with the browser's measurements, the request's plan and device, and the page's ids
			trackEvent(event.kind === "question" ? "spoken_question_sent" : "spoken_answer_played", pageAccess.userId, {
				...toAnalyticsProperties(context),
				chatKind: toChatKind(page),
				...toVoiceChatPageIds(page),
				...toSpokenEventProperties(event),
			})
			return context.json({ ok: true })
		},
	)
