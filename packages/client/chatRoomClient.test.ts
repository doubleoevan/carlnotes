// chat room client tests: a link preview read that fails any way reads as no cards yet
import { afterEach, expect, test } from "bun:test"
import { fetchChatRoomMessageLinkPreviews } from "./chatRoomClient"
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
