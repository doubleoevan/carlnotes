// how long the edge and the browser may cache a response. the edge caches a rendered response for a minute,
// and a versioned image stays a year in the browser and a day at the edge
import { getSessionCookie } from "better-auth/cookies"
import { createMiddleware } from "hono/factory"

// the tag that every shared rendered response is cached under, which the release purge clears
export const RENDERED_CACHE_TAG = "rendered"

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
