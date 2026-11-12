// the edge purge test fixture the api tests share: the purge turned on with a fetch spy that responds to it, and the
// tags that the purge requests named
import { spyOn } from "bun:test"

// the spy on fetch that responds to each purge request
export type EdgePurgeFetchSpy = ReturnType<typeof spyOn<typeof globalThis, "fetch">>

/**
 * Turns the edge purge on and returns the spy on fetch, which responds to each purge request with the status given.
 */
export function stubEdgePurge(purgeStatus = 200): EdgePurgeFetchSpy {
	// the zone and the token the purge needs, and a new response for each request
	Bun.env.CLOUDFLARE_ZONE_ID = "zone-1"
	Bun.env.CLOUDFLARE_API_TOKEN = "token-1"
	return spyOn(globalThis, "fetch").mockImplementation(
		(async () => new Response("{}", { status: purgeStatus })) as unknown as typeof fetch,
	)
}

/**
 * Returns the tags that the purge requests named, sorted.
 */
export function toPurgedTags(fetchSpy: EdgePurgeFetchSpy): string[] {
	const purgeRequests = fetchSpy.mock.calls.filter(([url]) => String(url).endsWith("/purge_cache"))
	return purgeRequests.flatMap(([, requestInit]) => JSON.parse(String(requestInit?.body)).tags).sort()
}
