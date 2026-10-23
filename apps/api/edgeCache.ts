// how long the edge and the browser may cache a response, and the purge by tag that clears a response early
import { reportError } from "@carlnotes/server/monitoring"
import { getSessionCookie } from "better-auth/cookies"
import type { Context } from "hono"
import { createMiddleware } from "hono/factory"

// the tag that every shared rendered response is cached under, which the release purge clears
export const RENDERED_CACHE_TAG = "rendered"

// the tags to purge, with the zone id and api token the purge request uses
export type PurgeEdgeCacheTagsOptions = { tags: string[]; zoneId: string | undefined; apiToken: string | undefined }

// what one purge did
export type EdgePurgeResult = { status: "purged" } | { status: "skipped" } | { status: "failed"; reason: string }

// the edge shares a rendered response for a minute, then serves it stale for up to a minute while it fetches a new one,
// and for up to two minutes while the origin responds with an error, such as a shed render's 503
export const RENDERED_EDGE_CACHE_CONTROL = "max-age=60, stale-while-revalidate=60, stale-if-error=120"

// the edge caches a public topic's or podcast episode's counts for thirty seconds, with no stale copy
const COUNTS_EDGE_CACHE_CONTROL = "max-age=30"

// how long one purge request may take before it counts as failed
const PURGE_TIMEOUT_MS = 10_000

// a file whose url names its content or version never changes, so the browser caches it for a year
export const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable"

// a response whose url names no version, such as a provider photo's redirect or a public file, is cached for an hour
export const UNVERSIONED_CACHE_CONTROL = "public, max-age=3600"

// the edge keeps a file for a day, which is the longest a deleted image stays at the edge
const FILE_EDGE_CACHE_CONTROL = "max-age=86400"

// the browser revalidates a response on every use, and a personal response is never shared
export const REVALIDATE_CACHE_CONTROL = "no-cache"
const PRIVATE_CACHE_CONTROL = "private, no-cache"

// no cache stores a response, and the private one is personal to the user
export const NO_STORE_CACHE_CONTROL = "no-store"
export const PRIVATE_NO_STORE_CACHE_CONTROL = "private, no-store"

// an old or missing image version is cached for a minute
const OLD_IMAGE_CACHE_CONTROL = "public, max-age=60"

/**
 * Marks a rendered page or a permanent redirect shared at the edge, or private if it is personal.
 */
export function setRenderedCacheHeaders(request: Request, response: Response): void {
	// mark the response private if the request has a session cookie or an authorization header, or if the response is
	// not a page or a permanent redirect, or sets a cookie
	const isShareableStatus = response.status === 200 || response.status === 301 || response.status === 308
	const isShared = isShareableStatus && !hasCredentials(request) && !response.headers.has("Set-Cookie")
	if (!isShared) {
		response.headers.set("Cache-Control", PRIVATE_CACHE_CONTROL)
		return
	}

	// the browser always revalidates. only the edge caches a copy, under the tag that the release purge clears
	response.headers.set("Cache-Control", REVALIDATE_CACHE_CONTROL)
	response.headers.set("CDN-Cache-Control", RENDERED_EDGE_CACHE_CONTROL)
	response.headers.set("Cache-Tag", RENDERED_CACHE_TAG)
}

/**
 * Marks a counts response shared at the edge if it is a public topic's or podcast episode's counts, read with no
 * credentials, or private otherwise.
 */
export function setCountsCacheHeaders(request: Request, response: Response, isPublic: boolean): void {
	if (!isPublic || response.status !== 200 || hasCredentials(request)) {
		response.headers.set("Cache-Control", PRIVATE_CACHE_CONTROL)
		return
	}

	// the browser always revalidates, and only the edge caches a copy
	response.headers.set("Cache-Control", REVALIDATE_CACHE_CONTROL)
	response.headers.set("CDN-Cache-Control", COUNTS_EDGE_CACHE_CONTROL)
}

// whether the request has a session cookie or an authorization header, either of which makes a response personal
function hasCredentials(request: Request): boolean {
	return Boolean(getSessionCookie(request)) || request.headers.has("Authorization")
}

/**
 * Sets the rendered cache headers on a route's response once the route has built it.
 */
export const renderedCacheHeaders = createMiddleware(async (context, next) => {
	await next()
	setRenderedCacheHeaders(context.req.raw, context.res)
})

// the response a static file's cache header goes on, and whether the file's name holds a content hash
export type SetStaticFileCacheControlOptions = { context: Context; isHashedAsset: boolean }

/**
 * Caches a file of a statically built site for a year if its name holds a content hash, and has the browser revalidate
 * every other file on each use.
 */
export function setStaticFileCacheControl({ context, isHashedAsset }: SetStaticFileCacheControlOptions): void {
	context.header("Cache-Control", isHashedAsset ? IMMUTABLE_CACHE_CONTROL : REVALIDATE_CACHE_CONTROL)
}

/**
 * Returns the cache headers of an image whose url names a version, long at the current version and brief otherwise.
 */
export function toVersionedImageHeaders(isCurrentVersion: boolean): Record<string, string> {
	return isCurrentVersion
		? { "Cache-Control": IMMUTABLE_CACHE_CONTROL, "CDN-Cache-Control": FILE_EDGE_CACHE_CONTROL }
		: { "Cache-Control": OLD_IMAGE_CACHE_CONTROL }
}

// an unhashed public file changes only with a release, so the browser keeps it an hour and the edge a day, under the
// tag that the release purge clears
export const PUBLIC_FILE_HEADERS: Record<string, string> = {
	"Cache-Control": UNVERSIONED_CACHE_CONTROL,
	"CDN-Cache-Control": FILE_EDGE_CACHE_CONTROL,
	"Cache-Tag": RENDERED_CACHE_TAG,
}

/**
 * Returns the tag a user's avatar responses are cached under at the edge.
 */
export function toUserAvatarCacheTag(userId: string): string {
	return `user-avatar:${userId}`
}

/**
 * Returns the tag a team's avatar responses are cached under at the edge.
 */
export function toTeamAvatarCacheTag(teamId: string): string {
	return `team-avatar:${teamId}`
}

/**
 * Purges every response cached under the tags from the edge and returns whether it was purged, skipped, or failed.
 */
export async function purgeEdgeCacheTags(
	{ tags, zoneId, apiToken }: PurgeEdgeCacheTagsOptions,
	sendPurgeRequest: (url: string, requestInit: RequestInit) => Promise<Response> = fetch,
): Promise<EdgePurgeResult> {
	// skip the purge without both settings
	if (!zoneId || !apiToken) {
		return { status: "skipped" }
	}

	// send one purge by tag, and return a failure instead of throwing an error
	try {
		const response = await sendPurgeRequest(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
			method: "POST",
			headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
			body: JSON.stringify({ tags }),
			signal: AbortSignal.timeout(PURGE_TIMEOUT_MS),
		})

		// a rejected purge returns Cloudflare's status and message
		if (!response.ok) {
			return { status: "failed", reason: `${response.status} ${(await response.text()).slice(0, 500)}` }
		}
		return { status: "purged" }
	} catch (error) {
		return { status: "failed", reason: error instanceof Error ? error.message : String(error) }
	}
}

/**
 * Purges one tag from the edge after a deletion, reporting a failed purge and logging a skipped one.
 */
export async function purgeEdgeCacheTagAfterDeletion(cacheTag: string): Promise<void> {
	// send the purge with the settings read from the environment
	const edgePurgeResult = await purgeEdgeCacheTags({
		tags: [cacheTag],
		zoneId: Bun.env.CLOUDFLARE_ZONE_ID,
		apiToken: Bun.env.CLOUDFLARE_API_TOKEN,
	})

	// report a failure, and log a skip
	if (edgePurgeResult.status === "failed") {
		reportError(new Error(`the edge purge of ${cacheTag} failed: ${edgePurgeResult.reason}`), "api-route")
	} else if (edgePurgeResult.status === "skipped") {
		console.warn(`skipped the edge purge of ${cacheTag}: CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN are not both set`)
	}
}
