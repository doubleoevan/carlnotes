// unsubscribe tests: the link opens a page that changes nothing, the page's button and a provider's one-click post
// deactivate the subscription, a forged token does nothing, and the pages name the topic and escape it
import { afterEach, beforeAll, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "../db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "../db/redisClientStub"
import { runWithRequestMemo } from "../db/requestMemo"
import { signUnsubscribeToken } from "../worker/unsubscribe"
import { apiRoute } from "./api"
import { confirmUnsubscribePage, invalidUnsubscribePage, unsubscribedPage } from "./unsubscribe"

// a signed secret, so the tests can sign a token
beforeAll(() => {
	Bun.env.BETTER_AUTH_SECRET ??= "test-secret"
})

// put the pool and the Redis client back after each test
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
})

// a pool whose topic read names the topic and whose every other query returns nothing, with the queries recorded
function stubUnsubscribePool(): ReturnType<typeof stubConnectionPool> {
	stubRedisClient()
	return stubConnectionPool(({ text }) => (text.includes('from "topics"') ? [["A & B <topic>"]] : []))
}

// send one unsubscribe request through the api tree, with the request memo open as the server opens it
function requestUnsubscribe(path: string, requestInit?: RequestInit): Promise<Response> {
	return runWithRequestMemo(async () => apiRoute.request(path, requestInit))
}

// the link's page names the topic and offers the button, and nothing is written
test("opening the link shows the page with the button and changes nothing", async () => {
	// a signed token opened through the link
	const sentQueries = stubUnsubscribePool()
	const unsubscribeToken = await signUnsubscribeToken({ userId: "user-1", topicId: "topic-1" })
	const response = await requestUnsubscribe(`/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`)
	const page = await response.text()

	// the page, with the token in the form's action and no update sent
	expect(response.status).toBe(200)
	expect(page).toContain("Unsubscribe?")
	expect(page).toContain("A &amp; B &lt;topic&gt;")
	expect(page).toContain('method="post"')
	expect(page).toContain(encodeURIComponent(unsubscribeToken))
	expect(sentQueries.some(({ text }) => text.startsWith("update"))).toBe(false)
})

// the page's button deactivates the subscription and shows the confirmation page
test("the button deactivates the subscription and confirms", async () => {
	// the page's form posted with its hidden field
	const sentQueries = stubUnsubscribePool()
	const unsubscribeToken = await signUnsubscribeToken({ userId: "user-1", topicId: "topic-1" })
	const response = await requestUnsubscribe(`/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: "confirm=unsubscribe",
	})

	// the subscription update went to the pool, and the page confirms
	expect(response.status).toBe(200)
	expect(await response.text()).toContain("You're unsubscribed")
	const subscriptionUpdate = sentQueries.find(({ text }) => text.startsWith('update "subscriptions"'))
	expect(subscriptionUpdate?.values).toEqual(expect.arrayContaining([false, "topic-1", "user-1"]))
})

// a provider's one-click post deactivates the subscription and gets 200 with no body
test("a provider one-click deactivates the subscription and returns an empty 200", async () => {
	// the RFC 8058 body a provider posts
	const sentQueries = stubUnsubscribePool()
	const unsubscribeToken = await signUnsubscribeToken({ userId: "user-1", topicId: "topic-1" })
	const response = await requestUnsubscribe(`/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`, {
		method: "POST",
		headers: { "content-type": "application/x-www-form-urlencoded" },
		body: "List-Unsubscribe=One-Click",
	})

	// an empty 200, with the update sent
	expect(response.status).toBe(200)
	expect(await response.text()).toBe("")
	expect(sentQueries.some(({ text }) => text.startsWith('update "subscriptions"'))).toBe(true)
})

// a forged token shows the invalid page on the link and on the post, and writes nothing
test("a forged token unsubscribes nothing", async () => {
	// the link and the post with a token that does not verify
	const sentQueries = stubUnsubscribePool()
	const getResponse = await requestUnsubscribe("/api/unsubscribe?token=forged.token")
	const postResponse = await requestUnsubscribe("/api/unsubscribe?token=forged.token", { method: "POST" })

	// both rejected, and nothing sent
	expect(getResponse.status).toBe(400)
	expect(postResponse.status).toBe(400)
	expect(await getResponse.text()).toContain("This link didn't work")
	expect(sentQueries).toHaveLength(0)
})

// the confirmation page states the outcome, names the topic, escapes HTML-significant characters, and links to the topic
test("unsubscribedPage names the topic and links to it", () => {
	const page = unsubscribedPage({ id: "t1", name: "A & B <topic>" }, "https://carlnotes.example.com")
	expect(page).toContain("You're unsubscribed")
	expect(page).toContain("A &amp; B &lt;topic&gt;")
	expect(page).toContain("https://carlnotes.example.com/topics/")
})

// the link's page escapes the topic name and the token in the form's action
test("confirmUnsubscribePage names the topic and posts the token", () => {
	const page = confirmUnsubscribePage({ id: "t1", name: "A & B <topic>" }, "a.b&c", "https://carlnotes.example.com")
	expect(page).toContain("A &amp; B &lt;topic&gt;")
	expect(page).toContain('action="/api/unsubscribe?token=a.b%26c"')
	expect(page).toContain("https://carlnotes.example.com/topics/")
})

// the invalid page explains the link failed and links back to the app
test("invalidUnsubscribePage renders a fallback message", () => {
	const page = invalidUnsubscribePage("https://carlnotes.example.com")
	expect(page).toContain("This link didn't work")
	expect(page).toContain("https://carlnotes.example.com")
})
