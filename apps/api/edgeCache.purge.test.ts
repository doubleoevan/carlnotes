// edge purge tests: a configured purge sends one request to Cloudflare.
// a purge without both settings is skipped, and a failed purge returns its reason instead of throwing an error
import { expect, test } from "bun:test"
import { purgeRenderedResponses } from "./edgeCache.purge"

// both settings that a configured release job reads
const EDGE_PURGE_SETTINGS = { zoneId: "zone-1", apiToken: "token-1" }

// one purge by tag, sent to the zone's purge url with the token
test("a configured purge sends one purge of the rendered tag", async () => {
	const sentRequests: { url: string; requestInit: RequestInit }[] = []
	const edgePurgeResult = await purgeRenderedResponses(EDGE_PURGE_SETTINGS, async (url, requestInit) => {
		sentRequests.push({ url, requestInit })
		return new Response("{}", { status: 200 })
	})

	// the purge succeeded with exactly one request of the documented shape
	expect(edgePurgeResult).toEqual({ status: "purged" })
	expect(sentRequests).toHaveLength(1)
	expect(sentRequests[0]?.url).toBe("https://api.cloudflare.com/client/v4/zones/zone-1/purge_cache")
	expect(sentRequests[0]?.requestInit.method).toBe("POST")
	expect(sentRequests[0]?.requestInit.headers).toEqual({
		Authorization: "Bearer token-1",
		"Content-Type": "application/json",
	})
	expect(JSON.parse(String(sentRequests[0]?.requestInit.body))).toEqual({ tags: ["rendered"] })
})

// a job without its settings sends nothing
test("a purge without both settings is skipped", async () => {
	let sentRequestCount = 0
	const edgePurgeResult = await purgeRenderedResponses({ zoneId: "zone-1", apiToken: undefined }, async () => {
		sentRequestCount += 1
		return new Response("{}")
	})

	// skipped, with no request sent
	expect(edgePurgeResult).toEqual({ status: "skipped" })
	expect(sentRequestCount).toBe(0)
})

// a rejected purge and an unreachable api both return a failure for the job to log, never a thrown error
test("a rejected or unreachable purge returns its failure", async () => {
	const rejectedEdgePurgeResult = await purgeRenderedResponses(
		EDGE_PURGE_SETTINGS,
		async () => new Response("bad token", { status: 403 }),
	)
	const unreachableEdgePurgeResult = await purgeRenderedResponses(EDGE_PURGE_SETTINGS, async () => {
		throw new Error("connection refused")
	})
	expect(rejectedEdgePurgeResult).toEqual({ status: "failed", reason: "403 bad token" })
	expect(unreachableEdgePurgeResult).toEqual({ status: "failed", reason: "connection refused" })
})
