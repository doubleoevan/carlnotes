// the rate limits per user or address, counted in Redis so every api replica shares one rate limit window: the general
// limit over the api, one for tool callers, one for the visitors' requests that reach the origin past the edge cache,
// one for the search bar, the topic feed, the link preview, the spoken parts of a reply, and the spoken events

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

// how many push device registrations and unregisters one user may send in a rate limit window
const PUSH_DEVICE_RATE_LIMIT = 10

// how many store purchase starts and store syncs one user may send in a rate limit window. each sync reads RevenueCat
const STORE_BILLING_RATE_LIMIT = 10

// how many api requests one user or address may send in a rate limit window, three times the busiest real use
export const API_RATE_LIMIT = 1800

// how many topic feed reads and link previews one user or address may send in a rate limit window
export const TOPIC_FEED_RATE_LIMIT = 120
export const LINK_PREVIEW_RATE_LIMIT = 120

// the api paths the general limit skips on any method: Better Auth's own limits, the signed webhooks, the podcast
// apps' feeds and covers, and the unsubscribe link that mail scanners open
const API_RATE_LIMIT_EXEMPT_PATHS = [
	/^\/api\/auth\//,
	/^\/api\/webhooks\//,
	/^\/api\/podcast-feeds\//,
	/^\/api\/podcast-covers\//,
	/^\/api\/unsubscribe$/,
]

// the api files the general limit skips on a read: a Topic's private podcast feed, a podcast episode's files, a Topic
// Post Discussion's audio, and the share cards that crawlers fetch
const API_RATE_LIMIT_EXEMPT_FILE_PATHS = [
	/^\/api\/topics\/[^/]+\/podcast-feed$/,
	/^\/api\/episodes\/[^/]+\/(audio\.mp3|video\.mp4|captions\.vtt|chapters\.json|transcript\.html|preview\.png)$/,
	/^\/api\/topic-posts\/[^/]+\/discussion\/audio\.mp3$/,
	/^\/api\/(invites|profiles|teams|topics|topic-posts)\/[^/]+\/preview\.png$/,
]

// the bucket that visitors share if no client address can be trusted
const SHARED_BUCKET = "shared"

// what identifies a tool caller: the user that a session or an accepted bearer token names, else the client address
export type RateLimitToolCaller = { userId: string | null; clientAddress: string | null }

// how many requests a limiter keyed by a user or an address allows in one rate limit window, the store that counts
// its hits, and whether a page render's own api calls reach its routes
type ToRateLimiterOptions = { limit: number; store: Store<AppEnv>; isReadByPageRenders?: boolean }

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

// whether a request has no user and no external address to count it under. a page render's loopback call has
// neither, and so does every visitor if a proxy hop is missing from the trusted proxies
function isUncountedRequest(context: Context<AppEnv>): boolean {
	const toolCaller = toRateLimitToolCaller(context)
	return !toolCaller.userId && !isExternalAddress(toolCaller.clientAddress)
}

// a limiter keyed by a user or an address, which rejects a request past the limit with a json 429. a limiter over the
// reads a page render calls skips a request it has nothing to count under, and any other counts it in the shared bucket
function toRateLimiter({ limit, store, isReadByPageRenders = false }: ToRateLimiterOptions): MiddlewareHandler<AppEnv> {
	return rateLimiter<AppEnv>({
		windowMs: RATE_LIMIT_WINDOW_MS,
		limit,
		standardHeaders: "draft-6",
		keyGenerator: (context) => toRateLimitKey(toRateLimitToolCaller(context)),
		skip: (context) => isReadByPageRenders && isUncountedRequest(context),
		handler: (context) => context.json({ error: "rate limited" }, 429),
		store,
	})
}

// the limit, the store, and any paths a quiet limiter skips beside the requests it has nothing to count under
type ToQuietRateLimiterOptions = {
	limit: number
	store: Store<AppEnv>
	isExemptPath?: (context: Context<AppEnv>) => boolean
}

// a limiter keyed like the others that sets no rate limit header, so no response the edge shares includes anyone's
// count. it skips a request it has nothing to count under. its 429 names the seconds left in the rate limit window and
// is never cached
function toQuietRateLimiter({ limit, store, isExemptPath }: ToQuietRateLimiterOptions): MiddlewareHandler<AppEnv> {
	return rateLimiter<AppEnv>({
		windowMs: RATE_LIMIT_WINDOW_MS,
		limit,
		standardHeaders: false,
		keyGenerator: (context) => toRateLimitKey(toRateLimitToolCaller(context)),
		skip: (context) => isUncountedRequest(context) || Boolean(isExemptPath?.(context)),
		handler: (context) =>
			context.json({ error: "rate limited" }, 429, {
				"Retry-After": String(toRetryAfterSeconds(context.get("rateLimit")?.resetTime)),
				"Cache-Control": "private, no-cache",
			}),
		store,
	})
}

// the whole seconds left until the rate limit window resets, at least one, or the whole window if no reset is known
function toRetryAfterSeconds(resetTime: Date | undefined): number {
	if (!resetTime) {
		return RATE_LIMIT_WINDOW_MS / 1000
	}
	return Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000))
}

// whether the general limit skips a request's path
function isApiRateLimitExemptPath(context: Context<AppEnv>): boolean {
	const requestPath = context.req.path
	const isRead = context.req.method === "GET" || context.req.method === "HEAD"
	if (isRead && API_RATE_LIMIT_EXEMPT_FILE_PATHS.some((exemptFilePath) => exemptFilePath.test(requestPath))) {
		return true
	}
	return API_RATE_LIMIT_EXEMPT_PATHS.some((exemptPath) => exemptPath.test(requestPath))
}

// the general limit over every api route but the exempt paths
export const apiRateLimiter = toQuietRateLimiter({
	limit: API_RATE_LIMIT,
	store: toRateLimitStore("rate-limit:api"),
	isExemptPath: isApiRateLimitExemptPath,
})

// the topic feed's own limit and the link preview's own limit, under the general limit
export const topicFeedRateLimiter = toQuietRateLimiter({
	limit: TOPIC_FEED_RATE_LIMIT,
	store: toRateLimitStore("rate-limit:topic-feed"),
})
export const linkPreviewRateLimiter = toQuietRateLimiter({
	limit: LINK_PREVIEW_RATE_LIMIT,
	store: toRateLimitStore("rate-limit:link-preview"),
})

// the tool callers' store, under the rate-limit prefix
export const toolCallerRateLimitStore = toRateLimitStore("rate-limit")

// the per-tool-caller limiter, which counts hits in the Redis store
export const toolCallerRateLimiter = toRateLimiter({ limit: CALLER_RATE_LIMIT, store: toolCallerRateLimitStore })

// the note body save's own limiter. the editor saves a second after each pause, so the caller limit is too low for it
const NOTE_BODY_SAVE_RATE_LIMIT = 120
export const noteBodySaveRateLimiter = toRateLimiter({
	limit: NOTE_BODY_SAVE_RATE_LIMIT,
	store: toRateLimitStore("rate-limit:note-body"),
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
	handler: (context) =>
		context.text("too many requests, try again in a minute", 429, {
			"Retry-After": String(RATE_LIMIT_WINDOW_MS / 1000),
		}),
	store: toRateLimitStore("rate-limit:page-render"),
})

// the search limiter, keyed by the user else the address, over the search route a visitor may call without a session.
// the mcp search tool counts against the same store
const searchRateLimitStore = toRateLimitStore("rate-limit:search")
export const searchRateLimiter = toRateLimiter({
	limit: SEARCH_RATE_LIMIT,
	store: searchRateLimitStore,
	isReadByPageRenders: true,
})

// the limiter over the paged reads of reactions and comments, the mention suggestions, and a topic's related topics,
// keyed by the user else the address. the limit is far above what a person reading a page sends
const SOCIAL_READ_RATE_LIMIT = 120
export const socialReadRateLimiter = toRateLimiter({
	limit: SOCIAL_READ_RATE_LIMIT,
	store: toRateLimitStore("rate-limit:social-read"),
	isReadByPageRenders: true,
})

// the quiet limiter over the Dashboard pages' snapshot reads, keyed by the user else the address. a page sends one read
// per chart selection
export const DASHBOARD_READ_RATE_LIMIT = 120
export const dashboardReadRateLimiter = toQuietRateLimiter({
	limit: DASHBOARD_READ_RATE_LIMIT,
	store: toRateLimitStore("rate-limit:dashboard-read"),
})

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

// the push device limiter, keyed by the user, over registering and unregistering a phone
export const pushDeviceRateLimiter = toRateLimiter({
	limit: PUSH_DEVICE_RATE_LIMIT,
	store: toRateLimitStore("rate-limit:push-devices"),
})

// the store billing limiter, keyed by the user, over a store purchase start and the store sync
export const storeBillingRateLimiter = toRateLimiter({
	limit: STORE_BILLING_RATE_LIMIT,
	store: toRateLimitStore("rate-limit:store-billing"),
})
