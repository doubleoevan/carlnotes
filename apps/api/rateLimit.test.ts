// rate limit tests: a request's limiter key, the store that counts each limiter key's hits in Redis, and each
// limiter's limit, key, and skip of a page render's own calls
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as redis from "@carlnotes/db/redis"
import { restoreRedisClient, stubRedisClient, stubUnreachableRedisClient } from "@carlnotes/db/redisClientStub"
import * as redisRateLimits from "@carlnotes/db/redisRateLimits"
import { Hono } from "hono"
import type { AppEnv } from "./currentUser"
import {
	API_RATE_LIMIT,
	APP_SIGNUP_GATE_RATE_LIMIT,
	apiRateLimiter,
	appSignupChallengeRateLimiter,
	CALLER_RATE_LIMIT,
	DASHBOARD_READ_RATE_LIMIT,
	dashboardReadRateLimiter,
	LINK_PREVIEW_RATE_LIMIT,
	linkPreviewRateLimiter,
	PAGE_RENDER_RATE_LIMIT,
	pageRenderRateLimiter,
	SEARCH_RATE_LIMIT,
	SPEECH_RATE_LIMIT,
	SPOKEN_EVENT_RATE_LIMIT,
	searchRateLimiter,
	socialReadRateLimiter,
	speechRateLimiter,
	spokenEventRateLimiter,
	TOPIC_FEED_RATE_LIMIT,
	toolCallerRateLimiter,
	toolCallerRateLimitStore,
	topicFeedRateLimiter,
	toRateLimitKey,
} from "./rateLimit"
import {
	CLOUDFLARE_WORKER_ADDRESS,
	CLOUDFLARE_WORKER_CLIENT_ADDRESS,
	toLimitedApp,
	toLimitedStatuses,
	withCloudflareTrustedProxies,
} from "./rateLimitTestFixtures"
import { SESSION_COOKIE } from "./testSession"

// put the spied Redis functions and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreRedisClient()
})

// a user is one tool caller, no matter what address the request also has
test("a user is keyed by their id ahead of any address", () => {
	expect(toRateLimitKey({ userId: "user-1", clientAddress: "203.0.113.7" })).toBe("user:user-1")
})

// a visitor is keyed by their address and uses the shared bucket only if no address can be trusted
test("a visitor is keyed by their address, else by the shared bucket", () => {
	expect(toRateLimitKey({ userId: null, clientAddress: "203.0.113.7" })).toBe("address:203.0.113.7")
	expect(toRateLimitKey({ userId: null, clientAddress: null })).toBe("shared")
})

// the store counts a limiter key under a prefixed Redis key and returns the count as the limiter's hits and reset time
test("the store maps a counted rate limit window to hits and a reset time", async () => {
	const resetAt = Date.now() + 30_000
	const incrementRateLimitWindowSpy = spyOn(redisRateLimits, "incrementRateLimitWindow").mockResolvedValue({
		count: 3,
		resetAt,
	})
	expect(await toolCallerRateLimitStore.increment("user:user-1")).toEqual({
		totalHits: 3,
		resetTime: new Date(resetAt),
	})
	expect(incrementRateLimitWindowSpy).toHaveBeenCalledWith("rate-limit:user:user-1", 60_000)
})

// with Redis unreachable the counter counts in this process's memory, so the 31st request inside a minute is rejected
test("the limiter rejects the 31st request inside a minute while Redis is unreachable", async () => {
	// a Redis client that never connects, so every count falls back to memory
	stubUnreachableRedisClient()
	spyOn(console, "error").mockImplementation(() => {})

	// 31 requests from one caller's address through the limiter
	const limitedApp = new Hono<AppEnv>().use(toolCallerRateLimiter).get("/mcp", (context) => context.text("ok"))
	const statuses: number[] = []
	for (let i = 0; i < CALLER_RATE_LIMIT + 1; i++) {
		statuses.push((await limitedApp.request("/mcp", { headers: { "x-forwarded-for": "203.0.113.30" } })).status)
	}
	expect(statuses.slice(0, CALLER_RATE_LIMIT)).toEqual(Array(CALLER_RATE_LIMIT).fill(200))
	expect(statuses.at(-1)).toBe(429)
})

// a refund and a reset go to the same Redis key that the hits count under
test("the store refunds and resets the limiter key's Redis key", async () => {
	const decrementRateLimitWindowSpy = spyOn(redisRateLimits, "decrementRateLimitWindow").mockResolvedValue(undefined)
	const deleteRedisKeySpy = spyOn(redis, "deleteRedisKeys").mockResolvedValue(1)

	await toolCallerRateLimitStore.decrement("shared")
	await toolCallerRateLimitStore.resetKey("shared")
	expect(decrementRateLimitWindowSpy).toHaveBeenCalledWith("rate-limit:shared")
	expect(deleteRedisKeySpy).toHaveBeenCalledWith("rate-limit:shared")
})

// a visitor's page renders past the page render limit respond 429 with a retry. a request with a session cookie and a
// request with no trusted address are never counted
test("the page render limiter counts a visitor's address and skips a session and an internal address", async () => {
	stubRedisClient()
	const limitedApp = new Hono<AppEnv>().use(pageRenderRateLimiter).get("/topics/t1", (context) => context.text("page"))
	const visitorHeaders = { "x-forwarded-for": "203.0.113.9" }

	// the visitor's page requests up to the limit pass
	const statuses: number[] = []
	for (let i = 0; i < PAGE_RENDER_RATE_LIMIT; i++) {
		statuses.push((await limitedApp.request("/topics/t1", { headers: visitorHeaders })).status)
	}
	expect(new Set(statuses)).toEqual(new Set([200]))

	// the next request is limited
	const limitedPageResponse = await limitedApp.request("/topics/t1", { headers: visitorHeaders })
	expect(limitedPageResponse.status).toBe(429)
	expect(limitedPageResponse.headers.get("Retry-After")).toBe("60")
	expect(limitedPageResponse.headers.get("Content-Type")).toContain("text/plain")

	// a signed-in request passes, and so does an internal address past the limit, which a missed proxy hop would give
	// every visitor
	const signedInResponse = await limitedApp.request("/topics/t1", {
		headers: { ...visitorHeaders, cookie: SESSION_COOKIE },
	})
	expect(signedInResponse.status).toBe(200)
	const internalStatuses = new Set<number>()
	for (let i = 0; i <= PAGE_RENDER_RATE_LIMIT; i++) {
		const internalResponse = await limitedApp.request("/topics/t1", { headers: { "x-forwarded-for": "10.0.0.5" } })
		internalStatuses.add(internalResponse.status)
	}
	expect(internalStatuses).toEqual(new Set([200]))

	// no rate limit header reaches a page the edge may share
	const pageResponse = await limitedApp.request("/topics/t1", { headers: { "x-forwarded-for": "203.0.113.10" } })
	expect(pageResponse.headers.has("RateLimit-Remaining")).toBe(false)
})

// the search bar's routes share one limiter, keyed like the tool callers' by the user else the address
test("the search limiter rejects the request past its limit", async () => {
	stubRedisClient()
	const limitedApp = new Hono<AppEnv>().use(searchRateLimiter).get("/users", (context) => context.json({ users: [] }))
	const visitorHeaders = { "x-forwarded-for": "203.0.113.10" }

	// the searches up to the limit pass, and the next is rejected
	const statuses: number[] = []
	for (let i = 0; i < SEARCH_RATE_LIMIT + 1; i++) {
		statuses.push((await limitedApp.request("/users", { headers: visitorHeaders })).status)
	}
	expect(statuses.slice(0, SEARCH_RATE_LIMIT)).toEqual(Array(SEARCH_RATE_LIMIT).fill(200))
	expect(statuses.at(-1)).toBe(429)
})

// the spoken parts of a reply and the spoken events each count in their own rate limit window, under their own
// Redis key, and the request past the limit is rejected
test.each([
	{ limiterName: "speech", limiter: speechRateLimiter, limit: SPEECH_RATE_LIMIT, keyPrefix: "rate-limit:speech" },
	{
		limiterName: "spoken events",
		limiter: spokenEventRateLimiter,
		limit: SPOKEN_EVENT_RATE_LIMIT,
		keyPrefix: "rate-limit:spoken-events",
	},
])(
	"the $limiterName limiter counts in its own window and rejects the request past its limit",
	async ({ limiter, limit, keyPrefix }) => {
		const storedValueByKey = stubRedisClient()
		const limitedApp = new Hono<AppEnv>().use(limiter).post("/chat/voice", (context) => context.json({ ok: true }))
		const visitorHeaders = { "x-forwarded-for": "203.0.113.11" }

		// the requests up to the limit pass
		const statuses: number[] = []
		for (let i = 0; i < limit + 1; i++) {
			const response = await limitedApp.request("/chat/voice", { method: "POST", headers: visitorHeaders })
			statuses.push(response.status)
		}

		// the request past the limit is rejected
		expect(statuses.slice(0, limit)).toEqual(Array(limit).fill(200))
		expect(statuses.at(-1)).toBe(429)

		// the hits count under the limiter's own prefix, apart from the tool callers' window
		expect([...storedValueByKey.keys()]).toEqual([`${keyPrefix}:address:203.0.113.11`])
	},
)

test("a limiter no page render reaches counts a request with no user and no external address in the shared bucket", async () => {
	stubRedisClient()

	// the app signup gate rejects the request past its limit, with no address to key any of them by
	const sharedStatuses = await toLimitedStatuses(
		toLimitedApp(appSignupChallengeRateLimiter),
		APP_SIGNUP_GATE_RATE_LIMIT + 1,
	)
	expect(sharedStatuses.at(-1)).toBe(429)
})

test("a limiter over the reads a page render calls skips a request with no user and no external address", async () => {
	// count each hit in a stubbed Redis
	stubRedisClient()

	// a page render's own calls send no cookie and no forwarded address, so none is counted
	const pageRenderStatuses = await toLimitedStatuses(toLimitedApp(socialReadRateLimiter), 200)
	expect(new Set(pageRenderStatuses)).toEqual(new Set([200]))

	// a signed-in user and an external address are still limited
	const signedInStatuses = await toLimitedStatuses(toLimitedApp(socialReadRateLimiter, "user-31"), 121)
	expect(signedInStatuses.at(-1)).toBe(429)
	const visitorStatuses = await toLimitedStatuses(toLimitedApp(socialReadRateLimiter), 121, {
		"x-forwarded-for": "203.0.113.31",
	})
	expect(visitorStatuses.at(-1)).toBe(429)
})

// the general limit, the topic feed limit, the link preview limit, and the Dashboard read limit, each under its own
// Redis key
const QUIET_LIMITERS = [
	{ limiterName: "general", limiter: apiRateLimiter, limit: API_RATE_LIMIT, keyPrefix: "rate-limit:api" },
	{
		limiterName: "topic feed",
		limiter: topicFeedRateLimiter,
		limit: TOPIC_FEED_RATE_LIMIT,
		keyPrefix: "rate-limit:topic-feed",
	},
	{
		limiterName: "link preview",
		limiter: linkPreviewRateLimiter,
		limit: LINK_PREVIEW_RATE_LIMIT,
		keyPrefix: "rate-limit:link-preview",
	},
	{
		limiterName: "Dashboard read",
		limiter: dashboardReadRateLimiter,
		limit: DASHBOARD_READ_RATE_LIMIT,
		keyPrefix: "rate-limit:dashboard-read",
	},
]

test.each(QUIET_LIMITERS)(
	"the $limiterName limiter counts by user and by address and sends a plain 429",
	async ({ limiter, limit, keyPrefix }) => {
		const storedValueByKey = stubRedisClient()

		// a signed-in user's requests up to the limit pass with no rate limit header, and the next is rejected
		const signedInApp = toLimitedApp(limiter, "user-32")
		const allowedResponse = await signedInApp.request("/limited")
		expect(allowedResponse.status).toBe(200)
		expect([...allowedResponse.headers.keys()].some((headerName) => headerName.startsWith("ratelimit"))).toBe(false)
		const signedInStatuses = await toLimitedStatuses(signedInApp, limit)
		expect(signedInStatuses.slice(0, limit - 1)).toEqual(Array(limit - 1).fill(200))
		expect(signedInStatuses.at(-1)).toBe(429)

		// the 429 names the seconds left in the window, is never cached, and matches the other limiters' body
		const limitedResponse = await signedInApp.request("/limited")
		expect(limitedResponse.status).toBe(429)
		expect(Number(limitedResponse.headers.get("Retry-After"))).toBeGreaterThanOrEqual(1)
		expect(Number(limitedResponse.headers.get("Retry-After"))).toBeLessThanOrEqual(60)
		expect(limitedResponse.headers.get("Cache-Control")).toBe("private, no-cache")
		expect(await limitedResponse.json()).toEqual({ error: "rate limited" })

		// a visitor's address is counted apart from the user
		const visitorStatuses = await toLimitedStatuses(toLimitedApp(limiter), limit + 1, {
			"x-forwarded-for": "203.0.113.32",
		})
		expect(visitorStatuses.at(-1)).toBe(429)
		expect([...storedValueByKey.keys()].sort()).toEqual([
			`${keyPrefix}:address:203.0.113.32`,
			`${keyPrefix}:user:user-32`,
		])
	},
)

test.each(QUIET_LIMITERS)(
	"the $limiterName limiter counts in memory while Redis is unreachable",
	async ({ limiter, limit }) => {
		// a Redis client that never connects, so every count falls back to memory
		stubUnreachableRedisClient()
		spyOn(console, "error").mockImplementation(() => {})

		// one visitor's requests up to the limit pass, and the next is rejected
		const statuses = await toLimitedStatuses(toLimitedApp(limiter), limit + 1, {
			"x-forwarded-for": `203.0.114.${limit % 250}`,
		})
		expect(statuses.slice(0, limit)).toEqual(Array(limit).fill(200))
		expect(statuses.at(-1)).toBe(429)
	},
)

// the limiters over the reads a page render calls: the quiet ones and the search limiter
const PAGE_RENDER_READ_LIMITERS = [
	...QUIET_LIMITERS,
	{ limiterName: "search", limiter: searchRateLimiter, limit: SEARCH_RATE_LIMIT, keyPrefix: "rate-limit:search" },
]

test.each(PAGE_RENDER_READ_LIMITERS)(
	"the $limiterName limiter skips a page render's own calls, over loopback or the private network",
	async ({ limiter, limit }) => {
		const storedValueByKey = stubRedisClient()

		// a burst past the limit with no user and no forwarded header, as a render's call over loopback sends it
		const loopbackStatuses = await toLimitedStatuses(toLimitedApp(limiter), limit + 1)
		expect(new Set(loopbackStatuses)).toEqual(new Set([200]))

		// the same burst with a private address in the header, as a call from another service on the private network
		const privateNetworkStatuses = await toLimitedStatuses(toLimitedApp(limiter), limit + 1, {
			"x-forwarded-for": "10.0.0.5",
		})
		expect(new Set(privateNetworkStatuses)).toEqual(new Set([200]))
		expect([...storedValueByKey.keys()]).toEqual([])
	},
)

test.each(PAGE_RENDER_READ_LIMITERS)(
	"the $limiterName limiter counts a visitor's chain of an internal entry then an external one under the external one",
	async ({ limiter, limit, keyPrefix }) => {
		const storedValueByKey = stubRedisClient()
		await withCloudflareTrustedProxies(async () => {
			// a visitor who wrote an internal address ahead of their own is counted under their own, and limited
			const visitorStatuses = await toLimitedStatuses(toLimitedApp(limiter), limit + 1, {
				"x-forwarded-for": "10.0.0.5, 203.0.113.41, 172.70.1.1",
				"cf-connecting-ip": "203.0.113.41",
			})
			expect(visitorStatuses.at(-1)).toBe(429)
		})
		expect([...storedValueByKey.keys()]).toEqual([`${keyPrefix}:address:203.0.113.41`])
	},
)

// a request a Worker relays is counted under the Workers address, so it never reads as a page render's
test("a limiter over the reads a page render calls counts a Worker's request under the Workers address", async () => {
	const storedValueByKey = stubRedisClient()
	await withCloudflareTrustedProxies(async () => {
		const workerStatuses = await toLimitedStatuses(toLimitedApp(searchRateLimiter), SEARCH_RATE_LIMIT + 1, {
			"x-forwarded-for": "172.64.0.9, 2606:4700::1",
			"cf-connecting-ip": CLOUDFLARE_WORKER_ADDRESS,
		})
		expect(workerStatuses.at(-1)).toBe(429)
	})
	expect([...storedValueByKey.keys()]).toEqual([`rate-limit:search:address:${CLOUDFLARE_WORKER_CLIENT_ADDRESS}`])
})
