// the edge purge that each release runs, which clears every response cached under the rendered tag,
// so no cached page names hashed assets that the new build no longer has.
// a missing setting is logged, and a failed purge is logged and reported, and neither fails the release
import { reportError, shutdownMonitoring, startMonitoring } from "@shared/monitoring"
import { type EdgePurgeResult, purgeEdgeCacheTags, RENDERED_CACHE_TAG } from "./edgeCache"

// the zone id and api token that the purge request uses, read from CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN
type EdgePurgeSettings = { zoneId: string | undefined; apiToken: string | undefined }

/**
 * Purges every rendered response from the edge with one purge by tag and returns what happened.
 */
export function purgeRenderedResponses(
	edgePurgeSettings: EdgePurgeSettings,
	sendPurgeRequest?: (url: string, requestInit: RequestInit) => Promise<Response>,
): Promise<EdgePurgeResult> {
	return purgeEdgeCacheTags({ ...edgePurgeSettings, tags: [RENDERED_CACHE_TAG] }, sendPurgeRequest)
}

// run the purge as the release's job, log what it did, report a failure, and exit cleanly no matter what happened
if (import.meta.main) {
	// start monitoring for the job
	startMonitoring()
	const edgePurgeResult = await purgeRenderedResponses({
		zoneId: Bun.env.CLOUDFLARE_ZONE_ID,
		apiToken: Bun.env.CLOUDFLARE_API_TOKEN,
	})

	// log what the purge did, and report a failure
	if (edgePurgeResult.status === "purged") {
		console.log(`purged the ${RENDERED_CACHE_TAG} responses from the edge`)
	} else if (edgePurgeResult.status === "skipped") {
		console.warn("skipped the edge purge: CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN are not both set")
	} else {
		// log and report the failed purge
		console.error(`the edge purge failed: ${edgePurgeResult.reason}`)
		reportError(new Error(`the release's edge purge failed: ${edgePurgeResult.reason}`), "api-route")
	}

	// flush the report before the job exits
	await shutdownMonitoring()
}
