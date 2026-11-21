// how long the edge and the browser may cache a response, and the purge by tag that clears a response early
import { type DashboardKind, type DashboardSubject, dashboardKinds } from "@carlnotes/contracts/dashboards"
import { deleteRedisKeys } from "@carlnotes/db/redis"
import {
	toVisitorDashboardPageKey,
	toVisitorProfilePageKey,
	toVisitorTeamPageKey,
	toVisitorTopicPostPageKey,
} from "@carlnotes/db/visitorPageCaches"
import {
	HOME_PAGE_CACHE_TAG,
	purgeEdgeCacheTagAfterDeletion,
	toDashboardCacheTag,
	toProfilePageCacheTag,
	toTeamPageCacheTag,
	toTopicPageCacheTag,
	toTopicPostCacheTag,
} from "@carlnotes/server/edgePurge"
import { getSessionCookie } from "better-auth/cookies"
import type { Context } from "hono"
import { createMiddleware } from "hono/factory"
import type { AppEnv } from "./currentUser"

// the tag that every shared rendered response is cached under, which the release purge clears
export const RENDERED_CACHE_TAG = "rendered"

// the edge shares a rendered response for a minute, then serves it stale for up to a minute while it fetches a new one,
// and for up to two minutes while the origin responds with an error, such as a shed render's 503
export const RENDERED_EDGE_CACHE_CONTROL = "max-age=60, stale-while-revalidate=60, stale-if-error=120"

// the edge caches a public topic's or podcast episode's counts for thirty seconds, with no stale copy
const COUNTS_EDGE_CACHE_CONTROL = "max-age=30"

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
 * Marks a rendered page or a permanent redirect shared at the edge, or private if it is personal. A shared response
 * carries the tags its path names and the tags its route added.
 */
export function setRenderedCacheHeaders(request: Request, response: Response, routeCacheTags: string[] = []): void {
	// mark the response private if the request has a session cookie or an authorization header, or if the response is
	// not a page or a permanent redirect, or sets a cookie
	const isShareableStatus = response.status === 200 || response.status === 301 || response.status === 308
	const isShared = isShareableStatus && !hasCredentials(request) && !response.headers.has("Set-Cookie")
	if (!isShared) {
		response.headers.set("Cache-Control", PRIVATE_CACHE_CONTROL)
		return
	}

	// the browser always revalidates. the edge caches a copy under the rendered tag, and the home page and its payload
	// under the home tag too
	response.headers.set("Cache-Control", REVALIDATE_CACHE_CONTROL)
	response.headers.set("CDN-Cache-Control", RENDERED_EDGE_CACHE_CONTROL)
	response.headers.set("Cache-Tag", [RENDERED_CACHE_TAG, ...toPageCacheTags(request), ...routeCacheTags].join(","))
}

// a profile page's path or its payloads', with the profile's user id
const PROFILE_PATH_PATTERN = /^\/(?:api\/)?profiles\/([^/]+)/

// a team page's path or its page read's, with the team's id
const TEAM_PATH_PATTERN = /^\/(?:api\/)?teams\/([^/]+)(?:\/page)?$/

// a Topic Post page's path, with the post's id after its Topic's id and slug, or its page read's path
const TOPIC_POST_PATH_PATTERN = /^\/topics\/[^/]+\/[^/]+\/posts\/([^/]+)/
const TOPIC_POST_PAGE_READ_PATH_PATTERN = /^\/api\/topic-posts\/([^/]+)\/page$/

// a Dashboard's page read's path, with the Dashboard's kind and its person's or team's id
const DASHBOARD_PAGE_READ_PATH_PATTERN = /^\/api\/dashboards\/([^/]+)\/([^/]+)\/page$/

// a topic page's path, with or without its slug, a podcast episode page's or a Topic Post page's after it, or the
// topic's or its podcast episode's page read, with the topic's id
const TOPIC_PATH_PATTERN = /^\/(?:api\/)?topics\/([^/]+)(?:\/|$)/

// the tags a page carries beside the rendered tag: the home's for the home page and its payload, a profile's own for
// a profile page and its payloads, a team's own for a team page and its page read, a Dashboard's own for its page
// read, and a topic's own for its page, its podcast episode pages, and their page reads, with a Topic Post's own for
// its page and its page read, whose route adds its topic's
function toPageCacheTags(request: Request): string[] {
	const { pathname } = new URL(request.url)
	if (pathname === "/" || pathname === "/api/home") {
		return [HOME_PAGE_CACHE_TAG]
	}

	// a profile's page or payloads, then a team's page or page read
	const profileUserId = PROFILE_PATH_PATTERN.exec(pathname)?.[1]
	if (profileUserId) {
		return [toProfilePageCacheTag(profileUserId)]
	}
	const teamId = TEAM_PATH_PATTERN.exec(pathname)?.[1]
	if (teamId) {
		return [toTeamPageCacheTag(teamId)]
	}

	// a Dashboard's page read names the Dashboard, which its rebuild purges
	const [, dashboardKind, subjectId] = DASHBOARD_PAGE_READ_PATH_PATTERN.exec(pathname) ?? []
	if (dashboardKind && subjectId && isDashboardKind(dashboardKind)) {
		return [toDashboardCacheTag({ dashboardKind, subjectId })]
	}

	// a Topic Post's page read names its post here and its topic in its route, and a topic's pages name the topic and a
	// Topic Post's own
	const topicPostPageReadId = TOPIC_POST_PAGE_READ_PATH_PATTERN.exec(pathname)?.[1]
	if (topicPostPageReadId) {
		return [toTopicPostCacheTag(topicPostPageReadId)]
	}
	const topicId = TOPIC_PATH_PATTERN.exec(pathname)?.[1]
	const topicPostId = TOPIC_POST_PATH_PATTERN.exec(pathname)?.[1]
	return [
		...(topicId ? [toTopicPageCacheTag(topicId)] : []),
		...(topicPostId ? [toTopicPostCacheTag(topicPostId)] : []),
	]
}

// whether a path segment names a Dashboard's kind
function isDashboardKind(pathSegment: string): pathSegment is DashboardKind {
	return (dashboardKinds as readonly string[]).includes(pathSegment)
}

// the pages a change left stale, by kind, and any further edge tags to purge with them, such as an avatar's
type ClearPagesOptions = {
	profileUserIds?: string[]
	teamIds?: string[]
	topicPostIds?: string[]
	dashboardSubjects?: DashboardSubject[]
	extraCacheTags?: string[]
}

/**
 * Deletes the visitor copies of the named profiles, team pages, Topic Post pages, and Dashboards, then purges them and
 * the further tags at the edge in one request.
 */
export async function clearPages({
	profileUserIds = [],
	teamIds = [],
	topicPostIds = [],
	dashboardSubjects = [],
	extraCacheTags = [],
}: ClearPagesOptions): Promise<void> {
	// the visitor copies first in one delete, so the edge's next fill reads fresh pages
	const pageKeys = [
		...profileUserIds.map(toVisitorProfilePageKey),
		...teamIds.map(toVisitorTeamPageKey),
		...topicPostIds.map(toVisitorTopicPostPageKey),
		...dashboardSubjects.map(toVisitorDashboardPageKey),
	]
	if (pageKeys.length > 0) {
		await deleteRedisKeys(...pageKeys)
	}

	// one purge for every page's tag and the further tags
	const cacheTags = [
		...extraCacheTags,
		...profileUserIds.map(toProfilePageCacheTag),
		...teamIds.map(toTeamPageCacheTag),
		...topicPostIds.map(toTopicPostCacheTag),
		...dashboardSubjects.map(toDashboardCacheTag),
	]
	await purgeEdgeCacheTagAfterDeletion(...cacheTags)
}

/**
 * Clears a user's profile page, after the profile or the topics, podcast episodes, or Topic Posts featured to it change.
 */
export function clearProfilePage(profileUserId: string): Promise<void> {
	return clearPages({ profileUserIds: [profileUserId] })
}

/**
 * Clears the Topic Posts' pages, after a comment their first screen shows is deleted or hidden.
 */
export function clearTopicPostPages(...topicPostIds: string[]): Promise<void> {
	return clearPages({ topicPostIds })
}

/**
 * Clears a team's page and a member's profile, which lists their teams, after the membership changes.
 */
export function clearTeamMemberPages({ teamId, userId }: { teamId: string; userId: string }): Promise<void> {
	return clearPages({ teamIds: [teamId], profileUserIds: [userId] })
}

/**
 * Purges the home page and its payload at the edge, after the home topics, podcast episodes, or Topic Posts change.
 */
export function purgeHomeAtEdge(): Promise<unknown> {
	return purgeEdgeCacheTagAfterDeletion(HOME_PAGE_CACHE_TAG)
}

/**
 * Marks a counts response shared at the edge if it is a public topic's or podcast episode's counts, read with no
 * credentials, or private otherwise.
 */
export function setCountsCacheHeaders(request: Request, response: Response, isPublic: boolean): void {
	// counts that are not public stay in the browser alone
	if (!isPublic) {
		response.headers.set("Cache-Control", PRIVATE_CACHE_CONTROL)
		return
	}
	setPublicReadCacheHeaders({ request, response, edgeCacheControl: COUNTS_EDGE_CACHE_CONTROL })
}

// the edge shares a visitor's poll read and a public status read for three seconds, with no stale copy
const POLL_EDGE_CACHE_CONTROL = "max-age=3"

/**
 * Marks a topic page's poll reload or a status read shared at the edge for three seconds if its subject is public, it
 * is a 200 read with no credentials, and the page reads are shared at the edge. Any other is private.
 */
export function setPollCacheHeaders(request: Request, response: Response, isPublic: boolean): void {
	// a subject that is not public, and every read while the page reads stay at the origin, stay in the browser alone
	if (!(isPublic && isPageReadEdgeCached())) {
		response.headers.set("Cache-Control", PRIVATE_CACHE_CONTROL)
		return
	}
	setPublicReadCacheHeaders({ request, response, edgeCacheControl: POLL_EDGE_CACHE_CONTROL })
}

// the edge caches a public Dashboard's snapshot for a day unless a purge by its tag clears it first
const DASHBOARD_EDGE_CACHE_CONTROL = "max-age=86400"

// the response a Dashboard's cache headers go on, whether it holds the public snapshot, and the Dashboard's tag
type SetDashboardCacheHeadersOptions = {
	request: Request
	response: Response
	isPublic: boolean
	cacheTag: string
}

/**
 * Marks a Dashboard's response shared at the edge under its tag if it holds the public snapshot and was read with no
 * credentials. A response that holds private items is never stored, and a signed-in user's public one stays in the
 * browser.
 */
export function setDashboardCacheHeaders({
	request,
	response,
	isPublic,
	cacheTag,
}: SetDashboardCacheHeadersOptions): void {
	// a private read is never cached
	if (!isPublic) {
		response.headers.set("Cache-Control", PRIVATE_NO_STORE_CACHE_CONTROL)
		return
	}
	setPublicReadCacheHeaders({ request, response, edgeCacheControl: DASHBOARD_EDGE_CACHE_CONTROL, cacheTag })
}

// a public read's response and request, how long the edge caches it, and the tag it is cached under, if any
type SetPublicReadCacheHeadersOptions = {
	request: Request
	response: Response
	edgeCacheControl: string
	cacheTag?: string
}

// mark a public read shared at the edge if it is a 200 read with no credentials, and cache an error or a signed-in
// read in the browser alone
function setPublicReadCacheHeaders({
	request,
	response,
	edgeCacheControl,
	cacheTag,
}: SetPublicReadCacheHeadersOptions): void {
	if (response.status !== 200 || hasCredentials(request)) {
		response.headers.set("Cache-Control", PRIVATE_CACHE_CONTROL)
		return
	}

	// the browser always revalidates, and only the edge caches a copy, under the read's tag if it has one
	response.headers.set("Cache-Control", REVALIDATE_CACHE_CONTROL)
	response.headers.set("CDN-Cache-Control", edgeCacheControl)
	if (cacheTag) {
		response.headers.set("Cache-Tag", cacheTag)
	}
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

// whether the page reads are shared at the edge, which waits until Cloudflare's cache rule names their paths
function isPageReadEdgeCached(): boolean {
	return Bun.env.PAGE_READS_EDGE_CACHED === "true"
}

/**
 * Sets the rendered cache headers on a page read's response, with the tags its route added, once the page reads are
 * shared at the edge, and marks it private until then, so visitors share it at the origin alone.
 */
export const renderedPageReadCacheHeaders = createMiddleware<AppEnv>(async (context, next) => {
	await next()
	if (isPageReadEdgeCached()) {
		setRenderedCacheHeaders(context.req.raw, context.res, context.get("pageCacheTags"))
		return
	}
	context.res.headers.set("Cache-Control", PRIVATE_CACHE_CONTROL)
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

// a non-public topic's image is cached by the browser alone, at a url that changes with the image
export const PRIVATE_IMAGE_HEADERS: Record<string, string> = { "Cache-Control": "private, max-age=31536000, immutable" }

// a non-public cover at a url that keeps naming it through its changes is cached by the browser alone, for a minute
export const LATEST_PRIVATE_IMAGE_HEADERS: Record<string, string> = { "Cache-Control": "private, max-age=60" }

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
