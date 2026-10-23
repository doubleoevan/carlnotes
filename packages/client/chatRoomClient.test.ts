// chat room client tests: a link preview read that fails any way reads as no cards yet, and a post's file rejection
// reads as the reason the route names
import { afterEach, expect, test } from "bun:test"
import { fetchChatRoomMessageLinkPreviews, sendChatRoomMessage } from "./chatRoomClient"
import { stubFailingFetch, stubFetch } from "./fetchTestFixtures"

// the real fetch to put back after each test
const originalFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = originalFetch
})

// the caller reads an empty map as no cards yet and tries again, so no failure may reach it as a rejection
test("fetchChatRoomMessageLinkPreviews reads a network error, a rejected status, and a body that is not json as no cards", async () => {
	// the request never reaches the server
	stubFailingFetch()
	expect(await fetchChatRoomMessageLinkPreviews("topic-1", "team-1", [1, 2])).toEqual({})

	// a rejected status, and an ok response whose body is not json
	stubFetch(new Response("no", { status: 500 }))
	expect(await fetchChatRoomMessageLinkPreviews("topic-1", "team-1", [1, 2])).toEqual({})
	stubFetch(new Response("<html></html>", { status: 200 }))
	expect(await fetchChatRoomMessageLinkPreviews(null, "team-1", [1, 2])).toEqual({})

	// the cards per chat message id
	stubFetch(Response.json({ linkPreviews: { 1: [] } }))
	expect(await fetchChatRoomMessageLinkPreviews("topic-1", "team-1", [1])).toEqual({ 1: [] })
})

// each file rejection the route names reads as its own reason, and any other 400 as a plain failure
test("sendChatRoomMessage reads each file rejection the route names", async () => {
	const post = { topicId: null, teamId: "team-1", content: "", replyToChatMessageId: null, attachments: [] }
	stubFetch(Response.json({ error: "attachment too large" }, { status: 400 }))
	expect(await sendChatRoomMessage(post)).toBe("attachmentTooLarge")
	stubFetch(Response.json({ error: "attachment busy" }, { status: 400 }))
	expect(await sendChatRoomMessage(post)).toBe("attachmentBusy")

	// a rejected file, and a 400 the route names no file problem for
	stubFetch(Response.json({ error: "attachment rejected" }, { status: 400 }))
	expect(await sendChatRoomMessage(post)).toBe("attachmentRejected")
	stubFetch(Response.json({ error: "Invalid input" }, { status: 400 }))
	expect(await sendChatRoomMessage(post)).toBeNull()
})
