// who may delete one chat room message, decided without a database, what a chat message page reports,
// how a spoken chat message posts, which replies post, and how the stream's catch-up starts
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { PODCAST_EPISODE_SPEAKER_NAMES } from "@carlnotes/contracts/podcastEpisodes"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as analytics from "@carlnotes/server/analytics"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { Hono } from "hono"
import * as authorization from "../authorization"
import { decryptChatText } from "./encryption"
import * as linkPreviews from "./linkPreviews"
import * as mentions from "./mentions"
import { postChatRoomMessage, streamChatRoomEvents, toChatMessageIdParam } from "./room"
import * as roomAccess from "./roomAccess"
import * as roomAttachments from "./roomAttachments"
import { canDeleteChatRoomMessage } from "./roomDeletes"
import * as roomMessages from "./roomMessages"
import { toBeforeChatMessageId, toChatMessagePage } from "./roomRoute"
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
test("toBeforeChatMessageId takes a positive whole id and refuses anything else", () => {
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
	spyOn(authorization, "isMonthlySpendExhausted").mockResolvedValue(false)
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
	spyOn(mentions, "saveChatMentions").mockResolvedValue(undefined)
	const runModelChatRoomTurnSpy = spyOn(roomTurns, "runModelChatRoomTurn").mockResolvedValue(undefined)
	const trackEventSpy = spyOn(analytics, "trackEvent").mockImplementation(() => {})

	// the post, with the mention the browser prefixed and the spoken flag
	const postChatRoomMessageResult = await postChatRoomMessage(
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

	// carl's turn starts for the chat message, and the event says it was spoken
	expect(runModelChatRoomTurnSpy).toHaveBeenCalledWith("user-1", null, "team-1", 42)
	expect(trackEventSpy).toHaveBeenCalledWith(
		"room_message_sent",
		"user-1",
		expect.objectContaining({ roomKind: "team", mentionsCarl: true, isSpoken: true }),
	)

	// a typed chat message stores false
	await postChatRoomMessage("user-1", null, "team-1", "hello all", null, [])
	const typedInsertQuery = sentQueries.filter((sentQuery) =>
		sentQuery.text.startsWith('insert into "room_messages"'),
	)[1]
	expect(typedInsertQuery?.values.at(-1)).toBe(false)
})

// a reply names a chat message in its own chat room. one from another room, or another team's room on the same topic,
// posts nothing
test("a reply to a chat message outside the chat room posts nothing", async () => {
	// a member of the team's own chat room, whose reply names a chat message no row in this room has
	spyOn(roomAccess, "loadChatRoom").mockResolvedValue({ topic: null, teamId: "team-1" })
	const sentQueries = stubConnectionPool()

	// the post is rejected like a missing chat room, and nothing is inserted
	expect(await postChatRoomMessage("user-1", null, "team-1", "agreed", 7, [])).toBeNull()
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
	spyOn(authorization, "isMonthlySpendExhausted").mockResolvedValue(false)
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
	spyOn(mentions, "saveChatMentions").mockResolvedValue(undefined)
	const runModelChatRoomTurnSpy = spyOn(roomTurns, "runModelChatRoomTurn").mockResolvedValue(undefined)
	spyOn(analytics, "trackEvent").mockImplementation(() => {})

	// the reply posts, and carl's turn starts for it
	expect(await postChatRoomMessage("user-1", "topic-1", "team-1", "say more", 7, [])).toEqual({
		chatMessageId: 43,
		rejectionReason: null,
	})
	expect(runModelChatRoomTurnSpy).toHaveBeenCalledWith("user-1", null, "team-1", 43)

	// the replied-to read names the topic's chat room for this team
	const repliedToQuery = sentQueries.find((sentQuery) => sentQuery.text.includes('from "room_messages"'))
	expect(repliedToQuery?.values).toEqual([7, "team-1", "topic-1"])
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

	// the stream opens with a cursor that is not an id, and ends with the failed catch-up
	const streamApp = new Hono().get("/events", (context) => streamChatRoomEvents(context, null, "team-1"))
	const response = await streamApp.request("/events?after=abc")
	await response.text()

	// the catch-up read from the start, and no heartbeat started
	expect(loadChatRoomMessagesSpy).toHaveBeenCalledWith(null, "team-1", 0)
	expect(setIntervalSpy).not.toHaveBeenCalled()
})
