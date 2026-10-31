// the room's spoken answer: only the device that posted the spoken message speaks carl's reply, once, and a rejected
// reply posts its question event at once
import { afterEach, expect, test } from "bun:test"
import type { SpokenQuestionTimings } from "@carlnotes/client/voiceClient"
import type { ChatRoomMessage } from "@carlnotes/contracts/chat"
import type { VoiceChatPage } from "@carlnotes/contracts/payloads"
import { clearSpokenAnswers, registerSpokenAnswerPlayer } from "../stores/spokenAnswerStore"
import { flushSpokenAnswerQueue } from "../stores/voiceTestFixtures"
import { toChatRoomSpokenAnswer } from "./useChatRoomSpokenAnswer"

// the room every test speaks in, and the timings of the spoken message
const page: VoiceChatPage = { kind: "room", topicId: null, teamId: "team-a" }
const spokenQuestionTimings: SpokenQuestionTimings = { secondsRecorded: 3, transcriptionMs: 400, recordingSentAt: 0 }

// the calls that undo a test's fake player and stubbed fetch
const cleanups: (() => void)[] = []
afterEach(() => {
	clearSpokenAnswers()
	for (const cleanup of cleanups.splice(0)) {
		cleanup()
	}
})

// what a test's stubs record: the api paths fetched, and the count of spoken parts the player played
type VoiceRouteRecord = { fetchedPaths: string[]; playedSpokenPartCount: number }

// register a player that plays each spoken part to its end, and stub the speech and spoken event routes. returns
// what the stubs record
function stubVoiceRoutes(): VoiceRouteRecord {
	// the player counts each spoken part and ends it on the next tick, so a repeated reply would play again
	const voiceRouteRecord: VoiceRouteRecord = { fetchedPaths: [], playedSpokenPartCount: 0 }
	cleanups.push(
		registerSpokenAnswerPlayer({
			unlock: () => {},
			play: (_audio, callbacks) => {
				voiceRouteRecord.playedSpokenPartCount += 1
				setTimeout(() => {
					callbacks.onPlaying()
					callbacks.onEnded()
				}, 0)
				return Promise.resolve()
			},
			showSpeaker: () => {},
			stop: () => {},
		}),
	)

	// the speech route returns audio, and every route records its path
	const originalFetch = globalThis.fetch
	globalThis.fetch = (async (input: string | URL | Request) => {
		const url = new URL(input instanceof Request ? input.url : String(input), "http://localhost")
		voiceRouteRecord.fetchedPaths.push(url.pathname)
		return new Response(new Uint8Array(4))
	}) as unknown as typeof fetch

	// the real fetch comes back after the test
	cleanups.push(() => {
		globalThis.fetch = originalFetch
	})
	return voiceRouteRecord
}

// a chat room message: carl's spoken reply to the spoken message 10 unless the test says otherwise
function toChatRoomMessage(chatRoomMessage: Partial<ChatRoomMessage>): ChatRoomMessage {
	return {
		id: 11,
		authorUserId: null,
		authorUsername: "Carl",
		authorAvatarSource: null,
		authorAvatarVersion: null,
		replyToChatMessageId: 10,
		content: "Laura Atkinson writes poems and songs.",
		createdAt: "2026-10-30T00:00:00.000Z",
		isSpoken: true,
		attachments: [],
		linkPreviews: [],
		...chatRoomMessage,
	}
}

// only the device that asked speaks carl's reply to its spoken message, once
test("only the asker's device speaks carl's reply, once, and a replay or a teammate's reply speaks nothing", async () => {
	// the asker awaits the reply to its spoken message, and the teammate awaits nothing
	const voiceRouteRecord = stubVoiceRoutes()
	const askerSpokenAnswer = toChatRoomSpokenAnswer({ voiceChatPage: page, pendingSpokenPostRef: { current: null } })
	const teammateSpokenAnswer = toChatRoomSpokenAnswer({ voiceChatPage: page, pendingSpokenPostRef: { current: null } })
	askerSpokenAnswer.awaitSpokenAnswer({ chatMessageId: 10, spokenQuestionTimings, isModelReplyRejected: false })

	// a teammate's reply to the spoken message, and carl's reply to another message, speak nothing
	askerSpokenAnswer.speakPendingSpokenAnswer(
		toChatRoomMessage({ id: 12, authorUserId: "user-b", authorUsername: "sam" }),
	)
	askerSpokenAnswer.speakPendingSpokenAnswer(toChatRoomMessage({ id: 13, replyToChatMessageId: 9 }))
	await flushSpokenAnswerQueue()
	expect(voiceRouteRecord.playedSpokenPartCount).toBe(0)

	// carl's reply speaks on the asker's device, and the teammate's device, which awaited nothing, stays quiet
	const carlReply = toChatRoomMessage({})
	teammateSpokenAnswer.speakPendingSpokenAnswer(carlReply)
	await flushSpokenAnswerQueue()
	expect(voiceRouteRecord.playedSpokenPartCount).toBe(0)
	askerSpokenAnswer.speakPendingSpokenAnswer(carlReply)
	await flushSpokenAnswerQueue()
	expect(voiceRouteRecord.playedSpokenPartCount).toBe(1)

	// a reconnect replays the reply, which speaks nothing more
	askerSpokenAnswer.speakPendingSpokenAnswer(carlReply)
	await flushSpokenAnswerQueue()
	expect(voiceRouteRecord.playedSpokenPartCount).toBe(1)
})

// a rejected reply ends the wait for carl's spoken answer
test("a rejected reply posts its question event at once and speaks nothing", async () => {
	// the asker sends a spoken message
	const voiceRouteRecord = stubVoiceRoutes()
	const askerSpokenAnswer = toChatRoomSpokenAnswer({ voiceChatPage: page, pendingSpokenPostRef: { current: null } })

	// the budget gate rejected carl's reply, so the event posts now and a later reply is not awaited
	askerSpokenAnswer.awaitSpokenAnswer({ chatMessageId: 10, spokenQuestionTimings, isModelReplyRejected: true })
	askerSpokenAnswer.speakPendingSpokenAnswer(toChatRoomMessage({}))
	await flushSpokenAnswerQueue()
	expect(voiceRouteRecord.fetchedPaths).toEqual(["/api/chat/spoken-events"])
	expect(voiceRouteRecord.playedSpokenPartCount).toBe(0)
})
