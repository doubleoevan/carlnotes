// who may delete one chat room message, decided without a database, what a chat message page reports,
// how a spoken chat message posts, which replies post, and how the stream's catch-up starts
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { PODCAST_EPISODE_SPEAKER_NAMES } from "@carlnotes/contracts/podcastEpisodes"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { SPENT_BUDGET_REJECTION } from "@carlnotes/models/models"
import * as moderation from "@carlnotes/models/moderation"
import * as spendReservations from "@carlnotes/models/spendReservations"
import { stubReservedUserSpend } from "@carlnotes/models/spendReservationTestFixtures"
import * as temporalClient from "@carlnotes/pipeline/temporalClient"
import * as analytics from "@carlnotes/server/analytics"
import * as monitoring from "@carlnotes/server/monitoring"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { Hono } from "hono"
import type { AppEnv } from "../currentUser"
import { CALLER_RATE_LIMIT } from "../rateLimit"
import { toJsonRequest, toSignedInApp } from "../testSession"
import { decryptChatText } from "./encryption"
import * as linkPreviews from "./linkPreviews"
import * as mentions from "./mentions"
import * as room from "./room"
import * as roomAccess from "./roomAccess"
import * as roomAttachments from "./roomAttachments"
import { canDeleteChatRoomMessage } from "./roomDeletes"
import { streamChatRoomEvents, toChatMessageIdParam } from "./roomEvents"
import * as roomMessages from "./roomMessages"
import * as roomQuestion from "./roomQuestion"
import { chatRoomRoute, TEAM_ROOM_PATH, toBeforeChatMessageId, toChatMessagePage } from "./roomRoute"
import * as roomStream from "./roomStream"
import * as roomTurns from "./roomTurns"

// put the connection pool's own query and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the chat message's own author removes it whatever their team role is
test("the author deletes their own chat message", () => {
	expect(canDeleteChatRoomMessage("u1", "u1", "member", false)).toBe(true)
	expect(canDeleteChatRoomMessage("u1", "u1", null, false)).toBe(true)
})

// a leader moderates the chat room, so anyone's chat message goes
test("a leader deletes anyone's chat message", () => {
	expect(canDeleteChatRoomMessage("u1", "u2", "leader", false)).toBe(true)
})

// an admin reaches every chat room, including teams they do not belong to
test("an admin deletes anyone's chat message", () => {
	expect(canDeleteChatRoomMessage("u1", "u2", null, true)).toBe(true)
	expect(canDeleteChatRoomMessage("u1", "u2", "member", true)).toBe(true)
})

// a plain member has no say over somebody else's words
test("a member deletes nobody else's chat message", () => {
	expect(canDeleteChatRoomMessage("u1", "u2", "member", false)).toBe(false)
	expect(canDeleteChatRoomMessage("u1", "u2", null, false)).toBe(false)
})

// carl's chat messages record no account, so only a leader or an admin clears them
test("a chat message with no author needs a leader or an admin", () => {
	expect(canDeleteChatRoomMessage("u1", null, "member", false)).toBe(false)
	expect(canDeleteChatRoomMessage("u1", null, "leader", false)).toBe(true)
	expect(canDeleteChatRoomMessage("u1", null, null, true)).toBe(true)
})

// a chat room longer than one page is read backward, and only a usable id loads the page above
test("toBeforeChatMessageId takes a positive whole id and rejects anything else", () => {
	expect(toBeforeChatMessageId("42")).toBe(42)

	// no cursor means the latest page, the way an initial load reads it
	expect(toBeforeChatMessageId(undefined)).toBeUndefined()
	expect(toBeforeChatMessageId("")).toBeUndefined()

	// a value that is not a usable id would otherwise reach the query as NaN or a negative bound
	expect(toBeforeChatMessageId("nope")).toBeUndefined()
	expect(toBeforeChatMessageId("0")).toBeUndefined()
	expect(toBeforeChatMessageId("-3")).toBeUndefined()
	expect(toBeforeChatMessageId("1.5")).toBeUndefined()
})

// a full page may have another above it, and a short page is the room's first
test("toChatMessagePage reports more above only for a full page", () => {
	const fullChatMessagePage = Array.from(
		{ length: roomMessages.CHAT_ROOM_LOAD_LIMIT },
		(_, index) => ({ id: index }) as never,
	)
	expect(toChatMessagePage(fullChatMessagePage).hasEarlierChatMessages).toBe(true)
	expect(toChatMessagePage(fullChatMessagePage.slice(1)).hasEarlierChatMessages).toBe(false)
	expect(toChatMessagePage([]).hasEarlierChatMessages).toBe(false)

	// the chat messages pass through untouched, in the order the load returned them
	expect(toChatMessagePage([]).chatMessages).toEqual([])
})

// the page says whether the mic and the play buttons render, which needs both voice models
test("toChatMessagePage reports whether voice chat is on", () => {
	const restoreEnvSettings = saveEnvSettings(["CHAT_TRANSCRIPTION_MODEL", "PODCAST_SPEECH_MODEL"])
	// both defaults are on, and an empty transcription model turns voice off
	try {
		delete Bun.env.CHAT_TRANSCRIPTION_MODEL
		delete Bun.env.PODCAST_SPEECH_MODEL
		expect(toChatMessagePage([]).isVoiceChatConfigured).toBe(true)
		// the off switch
		Bun.env.CHAT_TRANSCRIPTION_MODEL = ""
		expect(toChatMessagePage([]).isVoiceChatConfigured).toBe(false)
	} finally {
		restoreEnvSettings()
	}
})

// a spoken chat message posts with the flag on its row, addresses carl through the mention the browser prefixed, and
// reports itself as spoken
test("a spoken chat message stores its flag, wakes carl, and reports itself spoken", async () => {
	// a member of the team's own chat room, under budget, sharing no files
	spyOn(roomAccess, "loadChatRoom").mockResolvedValue({ topic: null, teamId: "team-1" })
	spyOn(roomQuestion, "loadModelRoomQuestionChars").mockResolvedValue(0)
	const { reservation } = stubReservedUserSpend()
	spyOn(roomAttachments, "prepareChatRoomAttachments").mockResolvedValue([])

	// the author's name for the select, and the posted chat message's id for the insert
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "users"')) {
			return [["ann"]]
		}
		return text.startsWith('insert into "room_messages"') ? [[42]] : []
	})

	// what runs after the post, quiet
	spyOn(linkPreviews, "saveLinkPreviews").mockResolvedValue(undefined)
	spyOn(roomStream, "notifyChatRoomMessage").mockResolvedValue(undefined)
	spyOn(mentions, "saveChatMentions").mockResolvedValue(0)
	const runModelChatRoomTurnSpy = spyOn(roomTurns, "runModelChatRoomTurn").mockResolvedValue(undefined)
	const trackEventSpy = spyOn(analytics, "trackEvent").mockImplementation(() => {})

	// the post, with the mention the browser prefixed and the spoken flag
	const postChatRoomMessageResult = await room.postChatRoomMessage(
		"user-1",
		null,
		"team-1",
		"@carl who is hiring?",
		null,
		[],
		{ isSpoken: true },
	)
	expect(postChatRoomMessageResult).toEqual({ chatMessageId: 42, rejectionReason: null })

	// the stored row names the chat room, the author, the text, and the flag
	const insertQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('insert into "room_messages"'))
	expect(insertQuery?.values).toEqual([null, "team-1", "user-1", "ann", expect.any(String), true])
	expect(decryptChatText(String(insertQuery?.values[4]))).toBe("@carl who is hiring?")

	// carl's turn starts for the chat message and releases its reservation once it ends, and the event says it was spoken
	expect(runModelChatRoomTurnSpy).toHaveBeenCalledWith("user-1", null, "team-1", 42)
	await Bun.sleep(0)
	expect(reservation.release).toHaveBeenCalledTimes(1)
	expect(trackEventSpy).toHaveBeenCalledWith(
		"room_message_sent",
		"user-1",
		expect.objectContaining({ roomKind: "team", mentionsCarl: true, isSpoken: true }),
	)

	// a typed chat message stores false, and a chat message carl is not asked in reserves nothing
	await room.postChatRoomMessage("user-1", null, "team-1", "hello all", null, [])
	expect(spendReservations.reserveUserSpend).toHaveBeenCalledTimes(1)
	const typedInsertQuery = sentQueries.filter((sentQuery) =>
		sentQuery.text.startsWith('insert into "room_messages"'),
	)[1]
	expect(typedInsertQuery?.values.at(-1)).toBe(false)
})

// a message that mentioned someone starts its push once, a message that mentioned nobody starts none, and a push that
// cannot start is reported while the post still returns its message
test("a mention starts its push without holding up the post", async () => {
	// a member of the team's own chat room, posting text that does not address carl
	spyOn(roomAccess, "loadChatRoom").mockResolvedValue({ topic: null, teamId: "team-1" })
	spyOn(roomAttachments, "prepareChatRoomAttachments").mockResolvedValue([])
	stubConnectionPool(({ text }) => {
		if (text.includes('from "users"')) {
			return [["ann"]]
		}
		return text.startsWith('insert into "room_messages"') ? [[44]] : []
	})

	// what runs after the post, quiet, with one mentioned member and a push start that fails the second time
	spyOn(linkPreviews, "saveLinkPreviews").mockResolvedValue(undefined)
	spyOn(roomStream, "notifyChatRoomMessage").mockResolvedValue(undefined)
	spyOn(analytics, "trackEvent").mockImplementation(() => {})
	const saveChatMentionsSpy = spyOn(mentions, "saveChatMentions").mockResolvedValue(1)
	const startChatMentionPushWorkflowSpy = spyOn(temporalClient, "startChatMentionPushWorkflow")
		.mockResolvedValueOnce(undefined)
		.mockRejectedValueOnce(new Error("temporal is down"))
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})

	// a mention starts one push for the message
	expect(await room.postChatRoomMessage("user-1", null, "team-1", "@sam look", null, [])).toEqual({
		chatMessageId: 44,
		rejectionReason: null,
	})
	expect(startChatMentionPushWorkflowSpy).toHaveBeenCalledWith(44)

	// a failed start still posts the message, and the failure is reported
	expect(await room.postChatRoomMessage("user-1", null, "team-1", "@sam again", null, [])).toEqual({
		chatMessageId: 44,
		rejectionReason: null,
	})
	await Bun.sleep(0)
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "push", { chatMessageId: "44" })

	// a message that mentioned nobody starts no push
	saveChatMentionsSpy.mockResolvedValue(0)
	await room.postChatRoomMessage("user-1", null, "team-1", "hello all", null, [])
	expect(startChatMentionPushWorkflowSpy).toHaveBeenCalledTimes(2)
})

// a reply names a chat message in its own chat room. one from another room, or another team's room on the same topic,
// posts nothing
test("a reply to a chat message outside the chat room posts nothing", async () => {
	// a member of the team's own chat room, whose reply names a chat message no row in this room has
	spyOn(roomAccess, "loadChatRoom").mockResolvedValue({ topic: null, teamId: "team-1" })
	const sentQueries = stubConnectionPool()

	// the post is rejected like a missing chat room, and nothing is inserted
	expect(await room.postChatRoomMessage("user-1", null, "team-1", "agreed", 7, [])).toBeNull()
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('insert into "room_messages"'))).toBe(false)

	// the replied-to read is bounded to this team's own chat room
	const repliedToQuery = sentQueries.find((sentQuery) => sentQuery.text.includes('from "room_messages"'))
	expect(repliedToQuery?.text).toContain('"room_messages"."team_id" = $')
	expect(repliedToQuery?.text).toContain('"room_messages"."topic_id" is null')
	expect(repliedToQuery?.values).toEqual([7, "team-1"])
})

// a reply to carl's chat message in the same chat room continues his exchange without a fresh chat mention
test("a reply to carl's chat message in the chat room wakes him", async () => {
	// a member of a topic's chat room, under budget, sharing no files
	spyOn(roomAccess, "loadChatRoom").mockResolvedValue({ topic: null, teamId: "team-1" })
	spyOn(roomQuestion, "loadModelRoomQuestionChars").mockResolvedValue(0)
	const { reservation } = stubReservedUserSpend()
	spyOn(roomAttachments, "prepareChatRoomAttachments").mockResolvedValue([])

	// the replied-to row is carl's own, in this room, then the author's name and the posted chat message's id
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "room_messages"')) {
			return [[null, PODCAST_EPISODE_SPEAKER_NAMES.host]]
		}
		// the poster's name, then the posted chat message's id
		if (text.includes('from "users"')) {
			return [["ann"]]
		}
		return text.startsWith('insert into "room_messages"') ? [[43]] : []
	})

	// what runs after the post, quiet
	spyOn(linkPreviews, "saveLinkPreviews").mockResolvedValue(undefined)
	spyOn(roomStream, "notifyChatRoomMessage").mockResolvedValue(undefined)
	spyOn(mentions, "saveChatMentions").mockResolvedValue(0)
	const runModelChatRoomTurnSpy = spyOn(roomTurns, "runModelChatRoomTurn").mockResolvedValue(undefined)
	spyOn(analytics, "trackEvent").mockImplementation(() => {})

	// the reply posts, and carl's turn starts for it
	expect(await room.postChatRoomMessage("user-1", "topic-1", "team-1", "say more", 7, [])).toEqual({
		chatMessageId: 43,
		rejectionReason: null,
	})
	expect(runModelChatRoomTurnSpy).toHaveBeenCalledWith("user-1", null, "team-1", 43)
	await Bun.sleep(0)
	expect(reservation.release).toHaveBeenCalledTimes(1)

	// the replied-to read names the topic's chat room for this team
	const repliedToQuery = sentQueries.find((sentQuery) => sentQuery.text.includes('from "room_messages"'))
	expect(repliedToQuery?.values).toEqual([7, "team-1", "topic-1"])
})

// a chat message whose poster's spend and open reservations have reached the budget is rejected privately before it
// posts, and carl is never called
test("a chat message is rejected before it posts once the poster's budget is reached", async () => {
	// a member of the team's own chat room whose budget is taken by another running turn
	spyOn(roomAccess, "loadChatRoom").mockResolvedValue({ topic: null, teamId: "team-1" })
	spyOn(roomQuestion, "loadModelRoomQuestionChars").mockResolvedValue(1200)
	const reserveUserSpendSpy = spyOn(spendReservations, "reserveUserSpend").mockResolvedValue("rejected")
	const prepareChatRoomAttachmentsSpy = spyOn(roomAttachments, "prepareChatRoomAttachments")
	const runModelChatRoomTurnSpy = spyOn(roomTurns, "runModelChatRoomTurn").mockResolvedValue(undefined)
	const sentQueries = stubConnectionPool()

	// the rejection comes back privately, with the spent budget's wording
	expect(await room.postChatRoomMessage("user-1", null, "team-1", "@carl who is hiring?", null, [])).toEqual({
		chatMessageId: 0,
		rejectionReason: SPENT_BUDGET_REJECTION,
	})

	// the reservation priced the stored question with the chat message, and nothing was read, stored, or called after
	expect(reserveUserSpendSpy).toHaveBeenCalledWith({
		userId: "user-1",
		kind: "chatTurn",
		maxDollars: expect.any(Number),
	})
	expect(prepareChatRoomAttachmentsSpy).not.toHaveBeenCalled()
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('insert into "room_messages"'))).toBe(false)
	expect(runModelChatRoomTurnSpy).not.toHaveBeenCalled()
})

// a member's posts to a chat room count in the tool callers' rate limit window, as a private chat post does, so a
// script cannot start carl's chat turns without limit
test("a chat room post past the tool callers' rate limit is rejected with a 429", async () => {
	// a body that fails validation, so each post stops before it reads a chat room
	stubRedisClient()
	const app = toSignedInApp(chatRoomRoute, "user-1")
	const postToTeamRoom = async (): Promise<Response> =>
		app.request(TEAM_ROOM_PATH.replace(":id", "team-1"), toJsonRequest({}))
	try {
		for (let i = 0; i < CALLER_RATE_LIMIT; i++) {
			expect((await postToTeamRoom()).status).toBe(400)
		}

		// the next post in the window is rate limited
		expect((await postToTeamRoom()).status).toBe(429)
	} finally {
		restoreRedisClient()
	}
})

// a shared image the moderation flags rejects the whole post with Carl's 422, and nothing posts
test("a chat room post with a flagged image is rejected with its category", async () => {
	// a room the user may post to, a clean text, a flagged image, and a post that must not run
	stubRedisClient()
	spyOn(roomAccess, "loadChatRoom").mockResolvedValue({ topic: null, teamId: "team-1" })
	spyOn(moderation, "classifyUserText").mockResolvedValue({ outcome: "skipped" })
	spyOn(moderation, "classifyImage").mockResolvedValue({
		outcome: "classified",
		verdict: { isViolation: true, category: "violence" },
	})
	const postChatRoomMessageSpy = spyOn(room, "postChatRoomMessage")
	try {
		// the post, with one image
		const image = { kind: "image", name: "shot.png", dataUrl: "data:image/png;base64,AA", keep: false }
		const response = await toSignedInApp(chatRoomRoute, "user-1").request(
			TEAM_ROOM_PATH.replace(":id", "team-1"),
			toJsonRequest({ content: "look", attachments: [image] }),
		)
		expect(response.status).toBe(422)
		expect(await response.json()).toEqual({ rejection: "objectionable", category: "violence" })
		expect(postChatRoomMessageSpy).not.toHaveBeenCalled()
	} finally {
		restoreRedisClient()
	}
})

// a post to a chat room the user may not use reads as missing before any moderation call is made
test("a chat room post the user may not make spends no moderation call", async () => {
	stubRedisClient()
	spyOn(roomAccess, "loadChatRoom").mockResolvedValue(null)
	const classifyUserTextSpy = spyOn(moderation, "classifyUserText")
	const classifyImageSpy = spyOn(moderation, "classifyImage")
	try {
		// the post, with one image
		const image = { kind: "image", name: "shot.png", dataUrl: "data:image/png;base64,AA", keep: false }
		const response = await toSignedInApp(chatRoomRoute, "user-1").request(
			TEAM_ROOM_PATH.replace(":id", "team-1"),
			toJsonRequest({ content: "look", attachments: [image] }),
		)
		expect(response.status).toBe(404)
		expect(classifyUserTextSpy).not.toHaveBeenCalled()
		expect(classifyImageSpy).not.toHaveBeenCalled()
	} finally {
		restoreRedisClient()
	}
})

// a cursor param names a positive whole id, and anything else reads as zero
test("toChatMessageIdParam takes a positive whole id and reads as zero otherwise", () => {
	expect(toChatMessageIdParam("42")).toBe(42)

	// no cursor, an empty one, or one that is not a usable id all read as zero
	expect(toChatMessageIdParam(undefined)).toBe(0)
	expect(toChatMessageIdParam("")).toBe(0)
	expect(toChatMessageIdParam("nope")).toBe(0)
	expect(toChatMessageIdParam("0")).toBe(0)
	expect(toChatMessageIdParam("-3")).toBe(0)
	expect(toChatMessageIdParam("1.5")).toBe(0)
	// an id past the safe integer range reads as zero
	expect(toChatMessageIdParam("9007199254740993")).toBe(0)
})

// a catch-up read that fails ends the stream with no heartbeat left running
test("a failed catch-up starts no heartbeat", async () => {
	// a catch-up read that fails, the stream's own log kept quiet, and the timer a heartbeat would set
	const loadChatRoomMessagesSpy = spyOn(roomMessages, "loadChatRoomMessages").mockRejectedValue(
		new Error("connection lost"),
	)
	spyOn(console, "error").mockImplementation(() => {})
	const setIntervalSpy = spyOn(globalThis, "setInterval")
	spyOn(roomStream, "onChatRoomMessage").mockReturnValue(() => {})

	// the stream opens with a cursor that is not an id, and ends with the failed catch-up
	const streamApp = new Hono<AppEnv>().get("/events", (context) => streamChatRoomEvents(context, null, "team-1"))
	const response = await streamApp.request("/events?after=abc")
	await response.text()

	// the catch-up read from the start, and no heartbeat started
	expect(loadChatRoomMessagesSpy).toHaveBeenCalledWith(null, "team-1", 0)
	expect(setIntervalSpy).not.toHaveBeenCalled()
})
