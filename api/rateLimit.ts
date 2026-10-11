// the per-caller rate limits, counted in Redis so every api replica shares one rate limit window: one for tool callers,
// one for the visitors' requests that reach the origin past the edge cache, and one for the search bar
import { getSessionCookie } from "better-auth/cookies"
import type { Context } from "hono"
import { type ClientRateLimitInfo, rateLimiter, type Store } from "hono-rate-limiter"
import { decrementRateLimitWindow, deleteRedisKey, incrementRateLimitWindow } from "../db/redis"
import { isInternalAddress } from "../worker"
import type { AppEnv } from "./currentUser"
import { resolveClientAddress } from "./trustedProxies"

// how many requests one tool caller may make in one rate limit window, and how long the rate limit window is
export const CALLER_RATE_LIMIT = 30
const RATE_LIMIT_WINDOW_MS = 60_000

// how many page renders one visitor address may ask the origin for in one rate limit window
export const PAGE_RENDER_RATE_LIMIT = 120

// how many searches one user or address may send in one rate limit window
export const SEARCH_RATE_LIMIT = 60

// the bucket that visitors share if no client address can be trusted
const SHARED_BUCKET = "shared"

// the Redis key prefixes that keep each limiter's hits apart
const TOOL_CALLER_KEY_PREFIX = "rate-limit"
const PAGE_RENDER_KEY_PREFIX = "rate-limit:page-render"
const SEARCH_KEY_PREFIX = "rate-limit:search"

// what identifies a tool caller: the user that a session or an accepted bearer token names, else the client address
export type RateLimitToolCaller = { userId: string | null; clientAddress: string | null }

/**
 * Builds the limiter's key from the user id, else the client address, else the shared bucket, and never from a token.
 */
export function toRateLimitKey(toolCaller: RateLimitToolCaller): string {
	if (toolCaller.userId) {
		return `user:${toolCaller.userId}`
	}
	return toolCaller.clientAddress ? `address:${toolCaller.clientAddress}` : SHARED_BUCKET
}

// a request's tool caller: the session user, else the user that an mcp bearer token resolved to, else the address
function toRateLimitToolCaller(context: Context<AppEnv>): RateLimitToolCaller {
	const toolCaller = context.get("toolCaller")
	return {
		userId: context.get("user")?.id ?? (toolCaller?.kind === "user" ? toolCaller.userId : null),
		clientAddress: resolveClientAddress(context.req.raw),
	}
}

// a limiter's store, which counts each limiter key's hits in a Redis rate limit window under the key prefix
function toRateLimitStore(keyPrefix: string): Store<AppEnv> {
	// the Redis key that one limiter key's hits count under
	const toRateLimitWindowKey = (rateLimitKey: string): string => `${keyPrefix}:${rateLimitKey}`
	return {
		increment: async (key: string): Promise<ClientRateLimitInfo> => {
			const rateLimitWindowHit = await incrementRateLimitWindow(toRateLimitWindowKey(key), RATE_LIMIT_WINDOW_MS)
			return { totalHits: rateLimitWindowHit.count, resetTime: new Date(rateLimitWindowHit.resetAt) }
		},
		decrement: (key: string): Promise<void> => decrementRateLimitWindow(toRateLimitWindowKey(key)),
		resetKey: (key: string): Promise<void> => deleteRedisKey(toRateLimitWindowKey(key)),
	}
}

// the tool callers' store, under the rate-limit prefix
export const toolCallerRateLimitStore = toRateLimitStore(TOOL_CALLER_KEY_PREFIX)

// the per-tool-caller limiter, which counts hits in the Redis store
export const toolCallerRateLimiter = rateLimiter<AppEnv>({
	windowMs: RATE_LIMIT_WINDOW_MS,
	limit: CALLER_RATE_LIMIT,
	standardHeaders: "draft-6",
	keyGenerator: (context) => toRateLimitKey(toRateLimitToolCaller(context)),
	handler: (context) => context.json({ error: "rate limited" }, 429),
	store: toolCallerRateLimitStore,
})

// the visitors' page render limiter, keyed by the client address. a request with a session cookie, or with an unknown
// or internal address, which a missed proxy hop gives every visitor, is skipped. it sets no rate limit headers on the
// pages the edge shares
export const pageRenderRateLimiter = rateLimiter<AppEnv>({
	windowMs: RATE_LIMIT_WINDOW_MS,
	limit: PAGE_RENDER_RATE_LIMIT,
	standardHeaders: false,
	keyGenerator: (context) => toRateLimitKey({ userId: null, clientAddress: resolveClientAddress(context.req.raw) }),
	skip: (context) =>
		Boolean(getSessionCookie(context.req.raw)) || !isExternalAddress(resolveClientAddress(context.req.raw)),
	handler: (context) => context.text("too many requests, try again in a minute", 429, { "Retry-After": "60" }),
	store: toRateLimitStore(PAGE_RENDER_KEY_PREFIX),
})

// whether a resolved client address is a known address outside this network
function isExternalAddress(clientAddress: string | null): boolean {
	return clientAddress !== null && !isInternalAddress(clientAddress)
}

// the search limiter, keyed by the user else the address, over the search routes a visitor may call without a session
export const searchRateLimiter = rateLimiter<AppEnv>({
	windowMs: RATE_LIMIT_WINDOW_MS,
	limit: SEARCH_RATE_LIMIT,
	standardHeaders: "draft-6",
	keyGenerator: (context) => toRateLimitKey(toRateLimitToolCaller(context)),
	handler: (context) => context.json({ error: "rate limited" }, 429),
	store: toRateLimitStore(SEARCH_KEY_PREFIX),
})
