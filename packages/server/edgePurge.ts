// the edge purge by cache tag, which the api and the worker both send after a public write

import type { DashboardSubject } from "@carlnotes/contracts/dashboards"
import { reportError } from "./monitoring"

// the tags to purge, with the zone id and api token the purge request uses
export type PurgeEdgeCacheTagsOptions = { tags: string[]; zoneId: string | undefined; apiToken: string | undefined }

// what one purge did
export type EdgePurgeResult = { status: "purged" } | { status: "skipped" } | { status: "failed"; reason: string }

// how long one purge request may take before it counts as failed
const PURGE_TIMEOUT_MS = 10_000

// the message every failed purge is reported under, with its tags and its reason beside it
export const EDGE_PURGE_FAILED_MESSAGE = "the edge purge failed"

/**
 * Returns the tag a topic's image files are cached under at the edge.
 */
export function toTopicImageCacheTag(topicId: string): string {
	return `topic-image:${topicId}`
}

/**
 * Returns the tag a Topic Post's page is cached under at the edge.
 */
export function toTopicPostCacheTag(topicPostId: string): string {
	return `topic-post:${topicPostId}`
}

/**
 * Returns the tag a topic's page, its podcast episode pages, its Topic Post pages, and their page reads are cached
 * under at the edge.
 */
export function toTopicPageCacheTag(topicId: string): string {
	return `topic:${topicId}`
}

/**
 * Returns the tag a team's page and its page read are cached under at the edge.
 */
export function toTeamPageCacheTag(teamId: string): string {
	return `team:${teamId}`
}

/**
 * Returns the tag a person's profile page and its payloads are cached under at the edge.
 */
export function toProfilePageCacheTag(profileUserId: string): string {
	return `profile:${profileUserId}`
}

// the tag the home page and its payload are cached under at the edge
export const HOME_PAGE_CACHE_TAG = "home"

/**
 * Returns the tag a Dashboard's public snapshots are cached under at the edge.
 */
export function toDashboardCacheTag({ dashboardKind, subjectId }: DashboardSubject): string {
	return `dashboard:${dashboardKind}:${subjectId}`
}

// the longest a purge waits on Cloudflare's Retry-After before its one retry, and the wait if the 429 names none
const MAX_PURGE_RETRY_WAIT_MS = 60_000
const DEFAULT_PURGE_RETRY_WAIT_MS = 1000

/**
 * Purges every response cached under the tags from the edge and returns whether it was purged, skipped, or failed. A
 * purge that Cloudflare rate limits waits as long as its Retry-After names, at most a minute, and is sent once more.
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
		// the purge request, sent again once after a 429's wait
		const sendPurge = (): Promise<Response> =>
			sendPurgeRequest(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
				method: "POST",
				headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
				body: JSON.stringify({ tags }),
				signal: AbortSignal.timeout(PURGE_TIMEOUT_MS),
			})
		let response = await sendPurge()
		if (response.status === 429) {
			await Bun.sleep(toPurgeRetryWaitMs(response.headers.get("Retry-After")))
			response = await sendPurge()
		}

		// a rejected purge returns Cloudflare's status and message
		if (!response.ok) {
			return { status: "failed", reason: `${response.status} ${(await response.text()).slice(0, 500)}` }
		}
		return { status: "purged" }
	} catch (error) {
		return { status: "failed", reason: error instanceof Error ? error.message : String(error) }
	}
}

// how long to wait before the retry: the seconds or the date a Retry-After names, at most a minute
function toPurgeRetryWaitMs(retryAfter: string | null): number {
	// the seconds a Retry-After names, else the time until the date it names
	const retryAfterSeconds = Number(retryAfter ?? Number.NaN)
	const retryAfterMs = Number.isFinite(retryAfterSeconds)
		? retryAfterSeconds * 1000
		: Date.parse(retryAfter ?? "") - Date.now()

	// a 429 with no wait it names waits a second, and no wait is longer than a minute
	if (Number.isNaN(retryAfterMs)) {
		return DEFAULT_PURGE_RETRY_WAIT_MS
	}
	return Math.min(Math.max(retryAfterMs, 0), MAX_PURGE_RETRY_WAIT_MS)
}

/**
 * Purges the tags from the edge in one request after a write or a deletion, reporting a failed purge and logging a
 * skipped one.
 */
export async function purgeEdgeCacheTagAfterDeletion(...cacheTags: string[]): Promise<void> {
	// no tags have nothing to purge
	if (cacheTags.length === 0) {
		return
	}

	// send the purge with the settings read from the environment
	const edgePurgeResult = await purgeEdgeCacheTags({
		tags: cacheTags,
		zoneId: Bun.env.CLOUDFLARE_ZONE_ID,
		apiToken: Bun.env.CLOUDFLARE_API_TOKEN,
	})

	// report a failure under one fixed message with the tags and the reason beside it, so repeated failures count as one
	// report under the report limit, and log a skip
	const cacheTagList = cacheTags.join(", ")
	if (edgePurgeResult.status === "failed") {
		reportError(new Error(EDGE_PURGE_FAILED_MESSAGE), "api-route", {
			tags: cacheTagList,
			reason: edgePurgeResult.reason,
		})
	} else if (edgePurgeResult.status === "skipped") {
		console.warn(
			`skipped the edge purge of ${cacheTagList}: CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN are not both set`,
		)
	}
}
