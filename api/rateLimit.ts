// the one per-tool-caller rate limit
import type { Context } from "hono"
import { rateLimiter } from "hono-rate-limiter"
import type { AppEnv } from "./currentUser"
import { resolveClientAddress } from "./trustedProxies"

// how many requests one tool caller may make in one window, and how long the window is
export const CALLER_RATE_LIMIT = 30
const RATE_WINDOW_MS = 60_000

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

// the one limiter instance
// ponytail: the in-memory store is per process. move it to a shared store once the api runs replicas
export const toolCallerRateLimiter = rateLimiter<AppEnv>({
	windowMs: RATE_WINDOW_MS,
	limit: CALLER_RATE_LIMIT,
	standardHeaders: "draft-6",
	keyGenerator: (context) => toRateLimitKey(toRateLimitToolCaller(context)),
	handler: (context) => context.json({ error: "rate limited" }, 429),
})
