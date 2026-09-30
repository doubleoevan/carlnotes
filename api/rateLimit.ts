// the one per-tool-caller rate limit, counted in Redis so every api replica shares one rate limit window
import type { Context } from "hono"
import { type ClientRateLimitInfo, rateLimiter, type Store } from "hono-rate-limiter"
import { decrementRateLimitWindow, deleteRedisKey, incrementRateLimitWindow } from "../db/redis"
import type { AppEnv } from "./currentUser"
import { resolveClientAddress } from "./trustedProxies"

// how many requests one tool caller may make in one rate limit window, and how long the rate limit window is
export const CALLER_RATE_LIMIT = 30
const RATE_LIMIT_WINDOW_MS = 60_000

// the bucket that visitors share if no client address can be trusted
const SHARED_BUCKET = "shared"

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

/**
 * The limiter's store, which counts each limiter key's hits in a Redis rate limit window.
 * The store returns zero hits for a hit that Redis could not count, so the request passes.
 */
export const toolCallerRateLimitStore: Store<AppEnv> = {
	increment: async (key: string): Promise<ClientRateLimitInfo> => {
		// count the hit in Redis. return zero hits and a full rate limit window if Redis could not count the hit
		const rateLimitWindowHit = await incrementRateLimitWindow(toRateLimitWindowKey(key), RATE_LIMIT_WINDOW_MS)
		return rateLimitWindowHit
			? { totalHits: rateLimitWindowHit.count, resetTime: new Date(rateLimitWindowHit.resetAt) }
			: { totalHits: 0, resetTime: new Date(Date.now() + RATE_LIMIT_WINDOW_MS) }
	},
	decrement: (key: string): Promise<void> => decrementRateLimitWindow(toRateLimitWindowKey(key)),
	resetKey: (key: string): Promise<void> => deleteRedisKey(toRateLimitWindowKey(key)),
}

// the per-tool-caller limiter, which counts hits in the Redis store
export const toolCallerRateLimiter = rateLimiter<AppEnv>({
	windowMs: RATE_LIMIT_WINDOW_MS,
	limit: CALLER_RATE_LIMIT,
	standardHeaders: "draft-6",
	keyGenerator: (context) => toRateLimitKey(toRateLimitToolCaller(context)),
	handler: (context) => context.json({ error: "rate limited" }, 429),
	store: toolCallerRateLimitStore,
})

// the Redis key that one limiter key's hits count under
function toRateLimitWindowKey(rateLimitKey: string): string {
	return `rate-limit:${rateLimitKey}`
}
