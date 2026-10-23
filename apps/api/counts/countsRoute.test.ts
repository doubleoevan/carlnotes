// counts route tests: a topic view returns 204 and counts only a person who may view the topic, from the app's own
// origin and within the rate limit, and the counts read is shared at the edge for a public topic and private for any
// other
import { afterEach, beforeEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient, stubUnreachableRedisClient } from "@carlnotes/db/redisClientStub"
import { readViewerEstimate } from "@carlnotes/db/viewerCounts"
import { countsRoute } from "./countsRoute"

// the topic the tests view, and a browser's and a crawler's same-origin requests, each with its address
const TOPIC = { kind: "topic", id: "topic-1" } as const
const BROWSER_HEADERS = {
	"user-agent": "Mozilla/5.0 Firefox/130.0",
	"x-forwarded-for": "203.0.113.7",
	"sec-fetch-site": "same-origin",
}
const CRAWLER_HEADERS = {
	"user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1)",
	"x-forwarded-for": "203.0.113.8",
	"sec-fetch-site": "same-origin",
}

// the auth secret that keys a visitor's hash, set for each test and put back after
let savedAuthSecret: string | undefined

beforeEach(() => {
	savedAuthSecret = Bun.env.BETTER_AUTH_SECRET
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
})

afterEach(() => {
	Bun.env.BETTER_AUTH_SECRET = savedAuthSecret
	restoreConnectionPool()
	restoreRedisClient()
})

// a topic row with the given visibility, its saved viewer count, and its followers
function stubTopicRow(visibility: "public" | "private", viewerCount = 0): void {
	stubConnectionPool((sentQuery) =>
		sentQuery.text.includes('from "topics"') ? [["topic-1", "owner-1", visibility, null, viewerCount, 4]] : [],
	)
}

test("a visitor's view of a public topic counts once, and a repeat adds nothing", async () => {
	stubRedisClient()
	stubTopicRow("public")
	const firstResponse = await countsRoute.request("/topics/topic-1/view", { method: "POST", headers: BROWSER_HEADERS })
	await countsRoute.request("/topics/topic-1/view", { method: "POST", headers: BROWSER_HEADERS })
	expect(firstResponse.status).toBe(204)
	expect(await readViewerEstimate(TOPIC)).toBe(1)
})

test("a crawler's view and a visitor's view of a private topic return 204 and count nothing", async () => {
	stubRedisClient()
	stubTopicRow("public")
	const crawlerResponse = await countsRoute.request("/topics/topic-1/view", {
		method: "POST",
		headers: CRAWLER_HEADERS,
	})
	expect(crawlerResponse.status).toBe(204)

	// a private topic looks the same to a visitor as one that counted
	stubTopicRow("private")
	const privateResponse = await countsRoute.request("/topics/topic-1/view", {
		method: "POST",
		headers: BROWSER_HEADERS,
	})
	expect(privateResponse.status).toBe(204)
	expect(await readViewerEstimate(TOPIC)).toBe(0)
})

test("a view that another website sends returns 204 and counts nothing", async () => {
	stubRedisClient()
	stubTopicRow("public")
	const crossSiteResponse = await countsRoute.request("/topics/topic-1/view", {
		method: "POST",
		headers: { ...BROWSER_HEADERS, "sec-fetch-site": "cross-site" },
	})
	expect(crossSiteResponse.status).toBe(204)
	expect(await readViewerEstimate(TOPIC)).toBe(0)
})

test("one address that cycles user agents counts at most 30 views a minute", async () => {
	stubRedisClient()
	stubTopicRow("public")
	for (let i = 0; i < 31; i++) {
		await countsRoute.request("/topics/topic-1/view", {
			method: "POST",
			headers: { ...BROWSER_HEADERS, "user-agent": `Mozilla/5.0 Firefox/${i}.0` },
		})
	}
	expect(await readViewerEstimate(TOPIC)).toBe(30)
})

test("an unreachable Redis still returns 204 for the view", async () => {
	stubUnreachableRedisClient()
	stubTopicRow("public")
	const response = await countsRoute.request("/topics/topic-1/view", { method: "POST", headers: BROWSER_HEADERS })
	expect(response.status).toBe(204)
})

test("a public topic's counts are shared at the edge, and never lower than the saved column", async () => {
	stubRedisClient()
	stubTopicRow("public", 5)
	const response = await countsRoute.request("/counts/topics/topic-1")
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({ viewerCount: 5, subscriberCount: 4 })

	// the browser revalidates, and the edge shares the counts for thirty seconds
	expect(response.headers.get("Cache-Control")).toBe("no-cache")
	expect(response.headers.get("CDN-Cache-Control")).toBe("max-age=30")
})

test("a private topic's counts are hidden from a visitor and never shared", async () => {
	stubRedisClient()
	stubTopicRow("private")
	const response = await countsRoute.request("/counts/topics/topic-1")
	expect(response.status).toBe(404)
	expect(response.headers.get("Cache-Control")).toBe("private, no-cache")
	expect(response.headers.get("CDN-Cache-Control")).toBeNull()
})
