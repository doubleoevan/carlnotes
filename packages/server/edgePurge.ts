// the edge purge by cache tag, which the api and the worker both send after a public write

import { reportError } from "./monitoring"

// the tags to purge, with the zone id and api token the purge request uses
export type PurgeEdgeCacheTagsOptions = { tags: string[]; zoneId: string | undefined; apiToken: string | undefined }

// what one purge did
export type EdgePurgeResult = { status: "purged" } | { status: "skipped" } | { status: "failed"; reason: string }

// how long one purge request may take before it counts as failed
const PURGE_TIMEOUT_MS = 10_000

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
