// rate limit tests: a request's limiter key, the client address that a visitor resolves to behind Cloudflare,
// and the store that counts each limiter key's hits in Redis
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as redis from "@carlnotes/db/redis"
import { restoreRedisClient, stubRedisClient, stubUnreachableRedisClient } from "@carlnotes/db/redisClientStub"
import * as redisRateLimits from "@carlnotes/db/redisRateLimits"
import { getIP } from "better-auth/api"
import { Hono } from "hono"
import { auth } from "./auth"
import type { AppEnv } from "./currentUser"
import {
	CALLER_RATE_LIMIT,
	PAGE_RENDER_RATE_LIMIT,
	pageRenderRateLimiter,
	SEARCH_RATE_LIMIT,
	SPEECH_RATE_LIMIT,
	SPOKEN_EVENT_RATE_LIMIT,
	searchRateLimiter,
	speechRateLimiter,
	spokenEventRateLimiter,
	toolCallerRateLimiter,
	toolCallerRateLimitStore,
	toRateLimitKey,
} from "./rateLimit"
import { SESSION_COOKIE } from "./testSession"
import { ipAddressOptions, resolveClientAddress } from "./trustedProxies"

// put the spied Redis functions and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreRedisClient()
})

// a few of Cloudflare's published ranges, read the way production reads TRUSTED_PROXIES
const CLOUDFLARE_IP_ADDRESS_OPTIONS = {
	...ipAddressOptions,
	trustedProxies: ["173.245.48.0/20", "172.64.0.0/13", "2606:4700::/32"],
}

// the client address that a request resolves to behind Cloudflare, for a given x-forwarded-for header
function toCloudflareClientAddress(forwardedFor: string): string | null {
	const request = new Request("http://localhost/mcp", { headers: { "x-forwarded-for": forwardedFor } })
	return resolveClientAddress(request, CLOUDFLARE_IP_ADDRESS_OPTIONS)
}

// a user is one tool caller, no matter what address the request also has
test("a user is keyed by their id ahead of any address", () => {
	expect(toRateLimitKey({ userId: "user-1", clientAddress: "203.0.113.7" })).toBe("user:user-1")
})

// a visitor is keyed by their address and uses the shared bucket only if no address can be trusted
test("a visitor is keyed by their address, else by the shared bucket", () => {
	expect(toRateLimitKey({ userId: null, clientAddress: "203.0.113.7" })).toBe("address:203.0.113.7")
	expect(toRateLimitKey({ userId: null, clientAddress: null })).toBe("shared")
})

// the header ends with the Cloudflare edge's address, which is trusted, so the visitor before it is the client
test("the visitor behind a Cloudflare hop is the client", () => {
	expect(toCloudflareClientAddress("203.0.113.7, 172.70.1.1")).toBe("203.0.113.7")
})

// the walk from the right stops at the visitor, so an entry that the visitor wrote to its left is never read
test("a forged left entry is ignored", () => {
	expect(toCloudflareClientAddress("198.51.100.9, 203.0.113.7, 172.70.1.1")).toBe("203.0.113.7")
})

// the header of a request sent straight to the origin ends with its untrusted sender, no matter what came before
test("a request that skips the edge resolves to its sender", () => {
	expect(toCloudflareClientAddress("172.70.1.1, 203.0.113.7")).toBe("203.0.113.7")
})

// Better Auth is configured with the limiter's own options object, so both always name the same client
test("Better Auth and the limiter resolve the same client address", () => {
	const request = new Request("http://localhost/mcp", { headers: { "x-forwarded-for": "203.0.113.7" } })
	expect(auth.options.advanced?.ipAddress).toBe(ipAddressOptions)
	expect(resolveClientAddress(request)).toBe(getIP(request, auth.options))
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

	// 31 requests from one caller through the limiter
	const limitedApp = new Hono<AppEnv>().use(toolCallerRateLimiter).get("/mcp", (context) => context.text("ok"))
	const statuses: number[] = []
	for (let i = 0; i < CALLER_RATE_LIMIT + 1; i++) {
		statuses.push((await limitedApp.request("/mcp")).status)
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
