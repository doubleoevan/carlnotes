// notifyIndexNow sends nothing without a key, posts once with the key file's address,
// and logs a failure instead of throwing an error
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { notifyIndexNow } from "./indexNow"

// the topic page every test reports
const TOPIC_PAGE_URL = "https://carlnotes.com/topics/t1/agents"

// the real fetch and key to put back after every test, and the requests the recorder keeps
const realFetch = globalThis.fetch
const realIndexNowKey = Bun.env.INDEXNOW_KEY
const recordedRequests: { url: string; body: unknown }[] = []

// swap fetch for a recorder that keeps each request's url and parsed body, and responds with the given status
function recordFetch(status: number): void {
	globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
		recordedRequests.push({ url: String(input), body: JSON.parse(String(init?.body)) })
		return new Response("", { status })
	}) as typeof fetch
}

// put the key, fetch, and console.warn back after every test
afterEach(() => {
	// restore the real fetch and the real console.warn, and clear the recorded requests
	globalThis.fetch = realFetch
	mock.restore()
	recordedRequests.length = 0

	// restore the real key, or remove the key if there was none
	if (realIndexNowKey === undefined) {
		delete Bun.env.INDEXNOW_KEY
	} else {
		Bun.env.INDEXNOW_KEY = realIndexNowKey
	}
})

// with no key there is nothing to prove ownership with, so nothing is sent
test("notifyIndexNow sends nothing without a key", async () => {
	delete Bun.env.INDEXNOW_KEY
	recordFetch(200)
	await notifyIndexNow([TOPIC_PAGE_URL])
	expect(recordedRequests).toHaveLength(0)
})

// one post names the host, the key, the key file at the site root, and every url
test("notifyIndexNow posts the urls with the key file's address", async () => {
	Bun.env.INDEXNOW_KEY = "k3y"
	recordFetch(200)
	await notifyIndexNow([TOPIC_PAGE_URL])
	expect(recordedRequests).toHaveLength(1)
	expect(recordedRequests[0]?.url).toBe("https://api.indexnow.org/indexnow")
	expect(recordedRequests[0]?.body).toEqual({
		host: "carlnotes.com",
		key: "k3y",
		keyLocation: "https://carlnotes.com/indexnow.txt",
		urlList: [TOPIC_PAGE_URL],
	})
})

// a rejected notification is logged with its status, and notifyIndexNow still resolves
test("notifyIndexNow logs a rejected request and does not throw", async () => {
	// a key, a fetch that rejects the post, and a silent console.warn
	Bun.env.INDEXNOW_KEY = "k3y"
	recordFetch(429)
	const consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {})

	// the call resolves, and the warning names the status and the urls
	await expect(notifyIndexNow([TOPIC_PAGE_URL])).resolves.toBeUndefined()
	expect(consoleWarnSpy).toHaveBeenCalledWith("indexnow rejected the notification", {
		status: 429,
		urls: [TOPIC_PAGE_URL],
	})
})

// a network error or a timeout is logged, and notifyIndexNow still resolves
test("notifyIndexNow logs a failed request and does not throw", async () => {
	// a key, a fetch that throws, and a silent console.warn
	Bun.env.INDEXNOW_KEY = "k3y"
	const networkError = new Error("network unreachable")
	globalThis.fetch = (async () => {
		throw networkError
	}) as unknown as typeof fetch
	const consoleWarnSpy = spyOn(console, "warn").mockImplementation(() => {})

	// the call resolves, and the warning names the urls and the error
	await expect(notifyIndexNow([TOPIC_PAGE_URL])).resolves.toBeUndefined()
	expect(consoleWarnSpy).toHaveBeenCalledWith("indexnow notification failed", {
		urls: [TOPIC_PAGE_URL],
		error: networkError,
	})
})
