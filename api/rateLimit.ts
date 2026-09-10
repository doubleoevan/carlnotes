// the one per-caller rate limit
import type { Context } from "hono"
import { rateLimiter } from "hono-rate-limiter"
import type { AppEnv } from "./currentUser"
import { trustedProxies } from "./trustedProxies"

// how many requests one caller may make in one window, and how long the window is
export const CALLER_RATE_LIMIT = 30
const RATE_WINDOW_MS = 60_000

// the bucket visitors share when no trusted proxy vouches for a client address
const SHARED_BUCKET = "shared"

// what identifies a caller: the user a session or an accepted bearer token names, else the forwarded chain
export type RateLimitCaller = { userId: string | null; forwardedFor: string | null }

/**
 * Builds the limiter's key from the user id, else the client address the trusted proxies vouch for, else the shared
 * bucket, and never from a token.
 */
export function toRateLimitKey(caller: RateLimitCaller, trustedProxyCount: number): string {
	if (caller.userId) {
		return `user:${caller.userId}`
	}
	const clientAddress = toClientAddress(caller.forwardedFor, trustedProxyCount)
	return clientAddress ? `address:${clientAddress}` : SHARED_BUCKET
}

/**
 * Reads the address the trusted proxies vouch for, the nth hop from the right behind n proxies since each appends the
 * peer it heard from, or null for a shorter chain, no chain, or no trusted proxy.
 */
export function toClientAddress(forwardedFor: string | null, trustedProxyCount: number): string | null {
	if (!forwardedFor || trustedProxyCount === 0) {
		return null
	}
	// the chain as hops, the client first and the last trusted proxy's peer last
	const hops = forwardedFor
		.split(",")
		.map((hop) => hop.trim())
		.filter(Boolean)
	// take the nth hop from the right, or nothing for a chain the proxies could not have built
	return hops.length >= trustedProxyCount ? (hops[hops.length - trustedProxyCount] ?? null) : null
}

// the caller a request identifies: the session user, else the user an mcp bearer token resolved to, else the chain
function toRateLimitCaller(context: Context<AppEnv>): RateLimitCaller {
	const mcpCaller = context.get("mcpCaller")
	return {
		userId: context.get("user")?.id ?? (mcpCaller?.kind === "user" ? mcpCaller.userId : null),
		forwardedFor: context.req.header("x-forwarded-for") ?? null,
	}
}

// the one limiter instance
// ponytail: the in-memory store is per process. move it to a shared store once the api runs replicas
export const callerRateLimiter = rateLimiter<AppEnv>({
	windowMs: RATE_WINDOW_MS,
	limit: CALLER_RATE_LIMIT,
	standardHeaders: "draft-6",
	keyGenerator: (context) => toRateLimitKey(toRateLimitCaller(context), trustedProxies.length),
	handler: (context) => context.json({ error: "rate limited" }, 429),
})
