// edge purge tests: a purge that Cloudflare rate limits is sent once more after its wait, and a failed purge is
// reported under one fixed message with its tags beside it
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { EDGE_PURGE_FAILED_MESSAGE, purgeEdgeCacheTagAfterDeletion, purgeEdgeCacheTags } from "./edgePurge"
import * as monitoring from "./monitoring"
import { saveEnvSettings } from "./savedEnvSettings"

// the zone and the token a configured purge sends with, put back after each test
const EDGE_PURGE_SETTINGS = { zoneId: "zone-1", apiToken: "token-1" }
const restoreEdgePurgeSettings = saveEnvSettings(["CLOUDFLARE_ZONE_ID", "CLOUDFLARE_API_TOKEN"])

// put the spies and the settings back after each test
afterEach(() => {
	mock.restore()
	restoreEdgePurgeSettings()
})

// a purge request sender that returns the next response for each request, and counts the requests
function toSendPurgeRequest(responses: Response[]): {
	sendPurgeRequest: () => Promise<Response>
	sentCount: () => number
} {
	let sentRequestCount = 0

	// the sender counts each request, and the counter reads the count
	return {
		sendPurgeRequest: async () => {
			sentRequestCount += 1
			return responses.shift() ?? new Response("{}")
		},
		sentCount: () => sentRequestCount,
	}
}

test("a rate-limited purge waits its Retry-After and is sent once more", async () => {
	// a 429 that names a one second wait, then a success
	const { sendPurgeRequest, sentCount } = toSendPurgeRequest([
		new Response("rate limited", { status: 429, headers: { "Retry-After": "1" } }),
		new Response("{}"),
	])
	const startedAt = performance.now()
	const edgePurgeResult = await purgeEdgeCacheTags({ ...EDGE_PURGE_SETTINGS, tags: ["home"] }, sendPurgeRequest)

	// purged on the second request, a second later
	expect(edgePurgeResult).toEqual({ status: "purged" })
	expect(sentCount()).toBe(2)
	expect(performance.now() - startedAt).toBeGreaterThanOrEqual(990)
})

test("a second 429 fails, and nothing else is tried again", async () => {
	// two 429s fail after one retry
	const rateLimited = toSendPurgeRequest([
		new Response("rate limited", { status: 429, headers: { "Retry-After": "0" } }),
		new Response("still rate limited", { status: 429, headers: { "Retry-After": "0" } }),
	])
	expect(await purgeEdgeCacheTags({ ...EDGE_PURGE_SETTINGS, tags: ["home"] }, rateLimited.sendPurgeRequest)).toEqual({
		status: "failed",
		reason: "429 still rate limited",
	})
	expect(rateLimited.sentCount()).toBe(2)

	// another rejection is sent once
	const rejected = toSendPurgeRequest([new Response("bad token", { status: 403 })])
	expect(await purgeEdgeCacheTags({ ...EDGE_PURGE_SETTINGS, tags: ["home"] }, rejected.sendPurgeRequest)).toEqual({
		status: "failed",
		reason: "403 bad token",
	})
	expect(rejected.sentCount()).toBe(1)
})

test("a failed purge is reported under one fixed message, with its tags and its reason beside it", async () => {
	// the purge turned on, and Cloudflare rejecting it
	Bun.env.CLOUDFLARE_ZONE_ID = EDGE_PURGE_SETTINGS.zoneId
	Bun.env.CLOUDFLARE_API_TOKEN = EDGE_PURGE_SETTINGS.apiToken
	spyOn(globalThis, "fetch").mockImplementation(
		(async () => new Response("bad token", { status: 403 })) as unknown as typeof fetch,
	)
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})

	// two purges of different tags report the same message, so they count as one report under the report limit
	await purgeEdgeCacheTagAfterDeletion("topic:topic-1", "home")
	await purgeEdgeCacheTagAfterDeletion("user-avatar:user-1")
	expect(reportErrorSpy.mock.calls.map(([error]) => (error as Error).message)).toEqual([
		EDGE_PURGE_FAILED_MESSAGE,
		EDGE_PURGE_FAILED_MESSAGE,
	])
	expect(reportErrorSpy.mock.calls.map(([, , extra]) => extra)).toEqual([
		{ tags: "topic:topic-1, home", reason: "403 bad token" },
		{ tags: "user-avatar:user-1", reason: "403 bad token" },
	])
})
