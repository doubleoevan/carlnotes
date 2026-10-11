// how long the edge and the browser may cache a response, and the purge by tag that clears a response early
import { reportError } from "@shared/monitoring"
import { getSessionCookie } from "better-auth/cookies"
import { createMiddleware } from "hono/factory"

// the tag that every shared rendered response is cached under, which the release purge clears
export const RENDERED_CACHE_TAG = "rendered"

// the tags to purge, with the zone id and api token the purge request uses
export type PurgeEdgeCacheTagsOptions = { tags: string[]; zoneId: string | undefined; apiToken: string | undefined }

// what one purge did
export type EdgePurgeResult = { status: "purged" } | { status: "skipped" } | { status: "failed"; reason: string }

// the edge shares a rendered response for a minute, then serves it stale for up to a minute while it fetches a new one
const RENDERED_EDGE_CACHE_CONTROL = "max-age=60, stale-while-revalidate=60"

// an image at its current version never changes and is cached for a year in the browser and a day at the edge.
// a day is the longest a deleted image stays at the edge. an old or missing version is cached for a minute
const CURRENT_IMAGE_CACHE_CONTROL = "public, max-age=31536000, immutable"
const CURRENT_IMAGE_EDGE_CACHE_CONTROL = "max-age=86400"
const OLD_IMAGE_CACHE_CONTROL = "public, max-age=60"

/**
 * Marks a rendered response shared at the edge, or private if it is personal or did not render.
 */
export function setRenderedCacheHeaders(request: Request, response: Response): void {
	// mark the response private if the request has a session cookie or an authorization header,
	// or if the response did not render or sets a cookie
	const hasCredentials = Boolean(getSessionCookie(request)) || request.headers.has("Authorization")
	const isShared = response.status === 200 && !hasCredentials && !response.headers.has("Set-Cookie")
	if (!isShared) {
		response.headers.set("Cache-Control", "private, no-cache")
		return
	}

	// the browser always revalidates. only the edge caches a copy, under the tag that the release purge clears
	response.headers.set("Cache-Control", "no-cache")
	response.headers.set("CDN-Cache-Control", RENDERED_EDGE_CACHE_CONTROL)
	response.headers.set("Cache-Tag", RENDERED_CACHE_TAG)
}

/**
 * Sets the rendered cache headers on a route's response once the route has built it.
 */
export const renderedCacheHeaders = createMiddleware(async (context, next) => {
	await next()
	setRenderedCacheHeaders(context.req.raw, context.res)
})

/**
 * Returns the cache headers of an image whose url names a version, long at the current version and brief otherwise.
 */
export function toVersionedImageHeaders(isCurrentVersion: boolean): Record<string, string> {
	return isCurrentVersion
		? { "Cache-Control": CURRENT_IMAGE_CACHE_CONTROL, "CDN-Cache-Control": CURRENT_IMAGE_EDGE_CACHE_CONTROL }
		: { "Cache-Control": OLD_IMAGE_CACHE_CONTROL }
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
