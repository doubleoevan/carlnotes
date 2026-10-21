// the spoken events route's tests: a question's and a play tap's properties, the chat turn kinds a question may name,
// the page's access check before any count without any spend sum, and the spoken events limiter
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { VOICE_RECORDING_MAX_SECONDS } from "@carlnotes/contracts/payloads"
import * as quotas from "@carlnotes/db/quotas"
import { restoreRedisClient } from "@carlnotes/db/redisClientStub"
import * as analytics from "@carlnotes/server/analytics"
import * as authorization from "../authorization"
import { SPOKEN_EVENT_RATE_LIMIT } from "../rateLimit"
import { toJsonRequest } from "../testSession"
import * as roomAccess from "./roomAccess"
import * as voiceAuthorization from "./voiceAuthorization"
import { SPOKEN_EVENTS_PATH } from "./voiceRoute"
import { allowVoicePage, ROOM_PAGE, TOPIC_PAGE, toSignedInVoiceApp } from "./voiceRouteTestFixtures"

// put the spies and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreRedisClient()
})

// a spoken question's event has the browser's timings, where it was asked from, the chat kind, the page's ids, and the
// request's plan and device, and a play tap has the chat kind alone
test("the spoken events are counted with the page's ids and the browser's measurements", async () => {
	allowVoicePage()
	const trackEventSpy = spyOn(analytics, "trackEvent").mockImplementation(() => {})
	const signedInApp = toSignedInVoiceApp()
	const questionResponse = await signedInApp.request(
		SPOKEN_EVENTS_PATH,
		toJsonRequest({
			page: ROOM_PAGE,
			event: { kind: "question", secondsRecorded: 12, transcriptionMs: 900, firstSpokenWordMs: 2500 },
		}),
	)
	expect(questionResponse.status).toBe(200)
	expect(await questionResponse.json()).toEqual({ ok: true })
	expect(trackEventSpy).toHaveBeenCalledWith("spoken_question_sent", "user-1", {
		entryPoint: "web",
		plan: "free",
		platform: "desktop",
		browserPlatform: "other",
		isInAppBrowser: false,
		chatKind: "room",
		teamId: "team-1",
		topicId: "topic-1",
		secondsRecorded: 12,
		transcriptionMs: 900,
		chatTurnKind: "private",
		firstSpokenWordMs: 2500,
	})

	// a play tap on the new-topic chat names no page id and no measurement
	await signedInApp.request(
		SPOKEN_EVENTS_PATH,
		toJsonRequest({ page: { kind: "newTopic" }, event: { kind: "answer_played" } }),
	)
	expect(trackEventSpy).toHaveBeenLastCalledWith("spoken_answer_played", "user-1", {
		entryPoint: "web",
		plan: "free",
		platform: "desktop",
		browserPlatform: "other",
		isInAppBrowser: false,
		chatKind: "new_topic",
	})
})

// a question asked from the podcast player is counted with the podcast chat turn kind, and a chat turn kind that no
// conversation sends is a bad request that is never counted
test("a spoken question event names the podcast chat turn kind and rejects a chat room one", async () => {
	allowVoicePage()
	const trackEventSpy = spyOn(analytics, "trackEvent").mockImplementation(() => {})
	const signedInApp = toSignedInVoiceApp()
	const podcastQuestionResponse = await signedInApp.request(
		SPOKEN_EVENTS_PATH,
		toJsonRequest({
			page: TOPIC_PAGE,
			event: { kind: "question", secondsRecorded: 4, transcriptionMs: 600, chatTurnKind: "podcast" },
		}),
	)
	expect(podcastQuestionResponse.status).toBe(200)
	expect(trackEventSpy).toHaveBeenCalledTimes(1)
	expect(trackEventSpy).toHaveBeenCalledWith(
		"spoken_question_sent",
		"user-1",
		expect.objectContaining({ chatTurnKind: "podcast" }),
	)

	// a chat room chat turn kind is not one a spoken question sends
	const chatRoomQuestionResponse = await signedInApp.request(
		SPOKEN_EVENTS_PATH,
		toJsonRequest({
			page: TOPIC_PAGE,
			event: { kind: "question", secondsRecorded: 4, transcriptionMs: 600, chatTurnKind: "chat_room" },
		}),
	)
	expect(chatRoomQuestionResponse.status).toBe(400)
	expect(trackEventSpy).toHaveBeenCalledTimes(1)
})

// an event on a page the user may not use is rejected and never counted, and a malformed event is a bad request
test("a spoken event is rejected where the user may not use the page and never counted", async () => {
	spyOn(voiceAuthorization, "authorizeVoiceChatPageAccess").mockResolvedValue({ status: "forbidden" })
	const trackEventSpy = spyOn(analytics, "trackEvent").mockImplementation(() => {})
	const signedInApp = toSignedInVoiceApp()
	const forbiddenResponse = await signedInApp.request(
		SPOKEN_EVENTS_PATH,
		toJsonRequest({ page: TOPIC_PAGE, event: { kind: "answer_played" } }),
	)
	expect(forbiddenResponse.status).toBe(403)

	// a question event with seconds past the recording limit
	const malformedResponse = await signedInApp.request(
		SPOKEN_EVENTS_PATH,
		toJsonRequest({
			page: TOPIC_PAGE,
			event: { kind: "question", secondsRecorded: VOICE_RECORDING_MAX_SECONDS + 1, transcriptionMs: 1 },
		}),
	)
	expect(malformedResponse.status).toBe(400)
	expect(trackEventSpy).not.toHaveBeenCalled()
})

// an event checks the page's access alone: a chat room the user may not use is a missing one, a member's event is
// counted, and neither runs the chat turn gate or the monthly spend sums
test("a spoken event checks the page's access and never runs the spend sums", async () => {
	const trackEventSpy = spyOn(analytics, "trackEvent").mockImplementation(() => {})
	const authorizeVoiceChatPageSpy = spyOn(voiceAuthorization, "authorizeVoiceChatPage")
	const isMonthlySpendExhaustedSpy = spyOn(authorization, "isMonthlySpendExhausted")
	const monthlySpendDollarsSpy = spyOn(quotas, "monthlySpendDollars")
	const loadChatRoomSpy = spyOn(roomAccess, "loadChatRoom").mockResolvedValue(null)
	const signedInApp = toSignedInVoiceApp()
	const playTapRequest = toJsonRequest({ page: ROOM_PAGE, event: { kind: "answer_played" } })

	// a chat room the user may not use answers like a missing one
	const notFoundResponse = await signedInApp.request(SPOKEN_EVENTS_PATH, playTapRequest)
	expect(notFoundResponse.status).toBe(404)
	expect(trackEventSpy).not.toHaveBeenCalled()

	// a member's event is counted
	loadChatRoomSpy.mockResolvedValue({ topic: null, teamId: "team-1" })
	const allowedResponse = await signedInApp.request(SPOKEN_EVENTS_PATH, playTapRequest)
	expect(allowedResponse.status).toBe(200)
	expect(trackEventSpy).toHaveBeenCalledTimes(1)

	// neither event ran the chat turn gate or a spend sum
	expect(authorizeVoiceChatPageSpy).not.toHaveBeenCalled()
	expect(isMonthlySpendExhaustedSpy).not.toHaveBeenCalled()
	expect(monthlySpendDollarsSpy).not.toHaveBeenCalled()
})

// the spoken events count in their own rate limit window, and the event past the limit is rejected and never counted
test("a spoken event past the spoken events limit is rejected", async () => {
	allowVoicePage()
	const trackEventSpy = spyOn(analytics, "trackEvent").mockImplementation(() => {})
	const signedInApp = toSignedInVoiceApp()

	// the events up to the limit pass, and the next is rejected
	const statuses: number[] = []
	for (let i = 0; i < SPOKEN_EVENT_RATE_LIMIT + 1; i++) {
		const response = await signedInApp.request(
			SPOKEN_EVENTS_PATH,
			toJsonRequest({ page: TOPIC_PAGE, event: { kind: "answer_played" } }),
		)
		statuses.push(response.status)
	}
	expect(statuses.slice(0, SPOKEN_EVENT_RATE_LIMIT)).toEqual(Array(SPOKEN_EVENT_RATE_LIMIT).fill(200))
	expect(statuses.at(-1)).toBe(429)
	expect(trackEventSpy).toHaveBeenCalledTimes(SPOKEN_EVENT_RATE_LIMIT)
})
