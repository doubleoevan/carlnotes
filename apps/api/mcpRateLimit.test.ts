// MCP rate limit tests: the protocol messages count apart from the tool calls, and a user's tool calls count apart
// from their chat posts
import { afterEach, expect, mock, test } from "bun:test"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { Hono } from "hono"
import type { SessionUser } from "./auth"
import type { AppEnv } from "./currentUser"
import { CALLER_RATE_LIMIT, MCP_PROTOCOL_RATE_LIMIT, mcpRateLimiter, toolCallerRateLimiter } from "./rateLimit"
import { toLimitedApp, toLimitedStatuses } from "./rateLimitTestFixtures"

// put the spied Redis functions and the Redis client back after each test
afterEach(() => {
	mock.restore()
	restoreRedisClient()
})

// an app behind the MCP limiter, with the given user signed in or none
function toMcpLimitedApp(userId: string | null = null): Hono<AppEnv> {
	return (
		new Hono<AppEnv>()
			.use(async (context, next) => {
				context.set("user", userId ? ({ id: userId } as SessionUser) : null)
				await next()
			})
			// the limiter, and one handled route behind it
			.use(mcpRateLimiter)
			.post("/mcp", (context) => context.json({ ok: true }))
	)
}

// sends one json-rpc message to the MCP limiter's app, and returns its status
async function toMcpStatus(mcpLimitedApp: Hono<AppEnv>, method: string): Promise<number> {
	const response = await mcpLimitedApp.request("/mcp", {
		method: "POST",
		headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.42" },
		body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: {} }),
	})
	return response.status
}

test("the MCP protocol messages count apart from the tool calls, so a handshake spends no tool call", async () => {
	stubRedisClient()
	const mcpLimitedApp = toMcpLimitedApp()

	// a handshake and four resource reads, each handled
	const protocolMethods = ["initialize", "notifications/initialized", "tools/list", ...Array(4).fill("resources/read")]
	const protocolStatuses: number[] = []
	for (const protocolMethod of protocolMethods) {
		protocolStatuses.push(await toMcpStatus(mcpLimitedApp, protocolMethod))
	}
	expect(new Set(protocolStatuses)).toEqual(new Set([200]))

	// every tool call up to the limit is handled, and the next is rejected
	const toolCallStatuses: number[] = []
	for (let i = 0; i < CALLER_RATE_LIMIT + 1; i++) {
		toolCallStatuses.push(await toMcpStatus(mcpLimitedApp, "tools/call"))
	}
	expect(toolCallStatuses.slice(0, CALLER_RATE_LIMIT)).toEqual(Array(CALLER_RATE_LIMIT).fill(200))
	expect(toolCallStatuses.at(-1)).toBe(429)

	// a protocol message still passes once the tool calls are spent
	expect(await toMcpStatus(mcpLimitedApp, "tools/list")).toBe(200)
})

test("the protocol messages are limited too, far above the tool calls", async () => {
	stubRedisClient()
	const mcpLimitedApp = toMcpLimitedApp()

	// one more resource read than the protocol limit, of which only the last is rejected
	const protocolStatuses: number[] = []
	for (let i = 0; i < MCP_PROTOCOL_RATE_LIMIT + 1; i++) {
		protocolStatuses.push(await toMcpStatus(mcpLimitedApp, "resources/read"))
	}
	expect(protocolStatuses.at(-2)).toBe(200)
	expect(protocolStatuses.at(-1)).toBe(429)
})

// a signed-in user's MCP tool calls count in a window apart from their chat posts
test("a signed-in user's MCP tool calls count apart from their chat posts", async () => {
	const storedValueByKey = stubRedisClient()
	await toMcpStatus(toMcpLimitedApp("user-42"), "tools/call")
	await toLimitedStatuses(toLimitedApp(toolCallerRateLimiter, "user-42"), 1)
	expect([...storedValueByKey.keys()].sort()).toEqual([
		"rate-limit:mcp-tool-call:user:user-42",
		"rate-limit:user:user-42",
	])
})

test("a batch of tool calls spends one tool call each", async () => {
	stubRedisClient()
	const mcpLimitedApp = toMcpLimitedApp()

	// a batch of as many tool calls as the limit is handled, and one more tool call is rejected
	const toolCallBatch = Array.from({ length: CALLER_RATE_LIMIT }, (_, i) => ({
		jsonrpc: "2.0",
		id: i,
		method: "tools/call",
		params: {},
	}))
	const batchResponse = await mcpLimitedApp.request("/mcp", {
		method: "POST",
		headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.42" },
		body: JSON.stringify(toolCallBatch),
	})
	expect(batchResponse.status).toBe(200)
	expect(await toMcpStatus(mcpLimitedApp, "tools/call")).toBe(429)
})
