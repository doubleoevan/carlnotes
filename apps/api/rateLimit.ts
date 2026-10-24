// the rate limits per user or address, counted in Redis so every api replica shares one rate limit window: one for tool
// callers, one for the visitors' requests that reach the origin past the edge cache, one for the search bar, one for
// the spoken parts of a reply, and one for the spoken events

import { deleteRedisKeys } from "@carlnotes/db/redis"
import { decrementRateLimitWindow, incrementRateLimitWindow } from "@carlnotes/db/redisRateLimits"
import { getSessionCookie } from "better-auth/cookies"
import type { Context, MiddlewareHandler } from "hono"
import { type ClientRateLimitInfo, rateLimiter, type Store } from "hono-rate-limiter"
import type { AppEnv } from "./currentUser"
import { isExternalAddress, resolveClientAddress } from "./trustedProxies"

// how many requests one tool caller may make in one rate limit window, and how long the rate limit window is
export const CALLER_RATE_LIMIT = 30
const RATE_LIMIT_WINDOW_MS = 60_000

// how many page renders one visitor address may ask the origin for in one rate limit window
export const PAGE_RENDER_RATE_LIMIT = 120

// how many searches one user or address may send in one rate limit window
export const SEARCH_RATE_LIMIT = 60

// how many spoken parts one user may ask for in one rate limit window, apart from the tool callers' limit
export const SPEECH_RATE_LIMIT = 60

// how many spoken events one user may send in one rate limit window, apart from the speech limit
export const SPOKEN_EVENT_RATE_LIMIT = 30

// how many app signup gate requests one address may send in a rate limit window, the credential paths' number
export const APP_SIGNUP_GATE_RATE_LIMIT = 10

// the bucket that visitors share if no client address can be trusted
const SHARED_BUCKET = "shared"

// what identifies a tool caller: the user that a session or an accepted bearer token names, else the client address
export type RateLimitToolCaller = { userId: string | null; clientAddress: string | null }

// how many requests a limiter keyed by a user or an address allows in one rate limit window, and the store that counts
// its hits
type ToRateLimiterOptions = { limit: number; store: Store<AppEnv> }

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
		resetKey: async (key: string): Promise<void> => {
			await deleteRedisKeys(toRateLimitWindowKey(key))
		},
	}
}

// a limiter keyed by a user or an address, which rejects a request past the limit with a json 429
function toRateLimiter({ limit, store }: ToRateLimiterOptions): MiddlewareHandler<AppEnv> {
	return rateLimiter<AppEnv>({
		windowMs: RATE_LIMIT_WINDOW_MS,
		limit,
		standardHeaders: "draft-6",
		keyGenerator: (context) => toRateLimitKey(toRateLimitToolCaller(context)),
		handler: (context) => context.json({ error: "rate limited" }, 429),
		store,
	})
}

// the tool callers' store, under the rate-limit prefix
export const toolCallerRateLimitStore = toRateLimitStore("rate-limit")

// the per-tool-caller limiter, which counts hits in the Redis store
export const toolCallerRateLimiter = toRateLimiter({ limit: CALLER_RATE_LIMIT, store: toolCallerRateLimitStore })

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
	handler: (context) =>
		context.text("too many requests, try again in a minute", 429, {
			"Retry-After": String(RATE_LIMIT_WINDOW_MS / 1000),
		}),
	store: toRateLimitStore("rate-limit:page-render"),
})

// the search limiter, keyed by the user else the address, over the search route a visitor may call without a session.
// the mcp search tool counts against the same store
const searchRateLimitStore = toRateLimitStore("rate-limit:search")
export const searchRateLimiter = toRateLimiter({ limit: SEARCH_RATE_LIMIT, store: searchRateLimitStore })

/**
 * Counts one search against the search limit under the caller's key, and returns whether it is within the limit.
 */
export async function countSearchRateLimitHit(rateLimitToolCaller: RateLimitToolCaller): Promise<boolean> {
	const { totalHits } = await searchRateLimitStore.increment(toRateLimitKey(rateLimitToolCaller))
	return totalHits <= SEARCH_RATE_LIMIT
}

// the speech limiter, keyed by the user else the address, over the spoken parts of a reply
export const speechRateLimiter = toRateLimiter({
	limit: SPEECH_RATE_LIMIT,
	store: toRateLimitStore("rate-limit:speech"),
})

// the spoken events limiter, keyed by the user else the address, over the analytics events of a spoken question
export const spokenEventRateLimiter = toRateLimiter({
	limit: SPOKEN_EVENT_RATE_LIMIT,
	store: toRateLimitStore("rate-limit:spoken-events"),
})

// the app signup gate limiters, keyed by the address, one over the challenge route and one over the proof route, so a
// sign-up attempt spends one hit on each. every Android proof spends one of Google's daily decodes
export const appSignupChallengeRateLimiter = toRateLimiter({
	limit: APP_SIGNUP_GATE_RATE_LIMIT,
	store: toRateLimitStore("rate-limit:app-signup-challenge"),
})
export const appSignupGateRateLimiter = toRateLimiter({
	limit: APP_SIGNUP_GATE_RATE_LIMIT,
	store: toRateLimitStore("rate-limit:app-signup-gate"),
})
