// the edge purge that each release runs, which clears every response cached under the rendered tag,
// so no cached page names hashed assets that the new build no longer has.
// a missing setting or a failed purge is logged and never fails the release
import { RENDERED_CACHE_TAG } from "./edgeCache"

// the zone id and api token that the purge request uses, read from CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN
type EdgePurgeSettings = { zoneId: string | undefined; apiToken: string | undefined }

// what one purge did
type EdgePurgeResult = { status: "purged" } | { status: "skipped" } | { status: "failed"; reason: string }

/**
 * Purges every rendered response from the edge with one purge by tag and returns what happened.
 */
export async function purgeRenderedResponses(
	{ zoneId, apiToken }: EdgePurgeSettings,
	sendPurgeRequest: (url: string, requestInit: RequestInit) => Promise<Response> = fetch,
): Promise<EdgePurgeResult> {
	// skip the purge without both settings. the pages leave the edge within two minutes anyway
	if (!zoneId || !apiToken) {
		return { status: "skipped" }
	}

	// send one purge by tag. a failure is returned for the log instead of throwing an error into the release
	try {
		const response = await sendPurgeRequest(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
			method: "POST",
			headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json" },
			body: JSON.stringify({ tags: [RENDERED_CACHE_TAG] }),
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

// run the purge as the release's job, log what it did, and exit cleanly no matter what happened
if (import.meta.main) {
	const edgePurgeResult = await purgeRenderedResponses({
		zoneId: Bun.env.CLOUDFLARE_ZONE_ID,
		apiToken: Bun.env.CLOUDFLARE_API_TOKEN,
	})

	// log what the purge did. the job's log is its only record
	if (edgePurgeResult.status === "purged") {
		console.log(`purged the ${RENDERED_CACHE_TAG} responses from the edge`)
	} else if (edgePurgeResult.status === "skipped") {
		console.warn("skipped the edge purge: CLOUDFLARE_ZONE_ID and CLOUDFLARE_API_TOKEN are not both set")
	} else {
		console.error(`the edge purge failed: ${edgePurgeResult.reason}`)
	}
}
