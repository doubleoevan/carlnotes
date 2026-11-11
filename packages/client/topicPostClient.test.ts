// Topic Post client tests: a missing post reads as null, a rejected write reads as the failure its response means,
// and a discussion's regenerate returns its recording or throws the api's words
import { afterEach, expect, test } from "bun:test"
import { stubFailingFetch, stubFetch } from "./fetchTestFixtures"
import {
	deleteTopicPost,
	fetchHomeTopicPosts,
	fetchTopicPost,
	publishTopicPost,
	saveTopicPost,
	sendTopicPostDiscussionRegeneration,
	sendTopicPostHomeOrder,
	sendTopicPostProfileOrder,
} from "./topicPostClient"

// put the real fetch back after each test
const realFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = realFetch
})

// a save of one title and body at version 3
const save = (): ReturnType<typeof saveTopicPost> =>
	saveTopicPost("post-1", { title: "A title", html: "<p>hi</p>", version: 3 })

test("a missing post reads as null", async () => {
	stubFetch(Response.json({ error: "not found" }, { status: 404 }))
	expect(await fetchTopicPost("post-1")).toBeNull()
})

test("a kept save returns the stored version", async () => {
	stubFetch(Response.json({ version: 4 }))
	expect(await save()).toEqual({ status: "saved", version: 4 })
})

test("a 409 is a newer version with its number, or a post past its edit time", async () => {
	stubFetch(Response.json({ error: "conflict", version: 7 }, { status: 409 }))
	expect(await save()).toEqual({ status: "conflict", version: 7 })
	stubFetch(Response.json({ error: "locked" }, { status: 409 }))
	expect(await save()).toEqual({ status: "locked" })
})

test("a short post is incomplete, and any other rejection fails with what its body says", async () => {
	stubFetch(Response.json({ error: "incomplete" }, { status: 400 }))
	expect(await publishTopicPost("post-1")).toEqual({ status: "incomplete" })
	stubFetch(Response.json({ error: "rate limited" }, { status: 429 }))
	expect(await save()).toEqual({ status: "failed", message: "rate limited" })
})

test("a request that never arrives fails with no message, and a delete of it reads as not gone", async () => {
	stubFailingFetch()
	expect(await save()).toEqual({ status: "failed", message: null })
	expect(await deleteTopicPost("post-1")).toBe(false)
})

test("a discussion's regenerate returns its recording, and a rejection throws the api's words", async () => {
	stubFetch(Response.json({ discussionId: "discussion-2" }, { status: 202 }))
	expect(await sendTopicPostDiscussionRegeneration("post-1", "the pancake part")).toBe("discussion-2")
	stubFetch(Response.json({ error: "This month's regenerations are used." }, { status: 429 }))
	await expect(sendTopicPostDiscussionRegeneration("post-1")).rejects.toThrow("This month's regenerations are used.")
})

test("a pin's rejection throws, on a profile and on the home, and a kept one resolves", async () => {
	stubFetch(Response.json({ error: "the profile's pins are at their limit" }, { status: 409 }))
	await expect(sendTopicPostProfileOrder("post-1", 13)).rejects.toThrow("topic post profile order update failed: 409")
	await expect(sendTopicPostHomeOrder("post-1", 1)).rejects.toThrow("topic post home order update failed: 409")

	// a kept pin returns nothing
	stubFetch(Response.json({ ok: true }))
	expect(await sendTopicPostProfileOrder("post-1", 1)).toBeUndefined()
})

test("the home's Topic Posts read as the pinned rows and the rows a pin may name", async () => {
	const homeTopicPosts = {
		pinnedTopicPosts: [{ id: "post-1", title: "Dialing in", topicName: "Home espresso" }],
		candidateTopicPosts: [{ id: "post-2", title: "Pulling shots", topicName: "Home espresso" }],
	}
	stubFetch(Response.json(homeTopicPosts))
	expect(await fetchHomeTopicPosts()).toEqual(homeTopicPosts)

	// a failed read throws
	stubFetch(Response.json({ error: "forbidden" }, { status: 403 }))
	await expect(fetchHomeTopicPosts()).rejects.toThrow("home topic posts load failed: 403")
})
