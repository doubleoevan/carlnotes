// the minimum version reads fail open: an empty table, an unreadable table, and an unreachable Redis all serve
import { afterEach, beforeEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient, stubUnreachableRedisClient } from "@carlnotes/db/redisClientStub"
import { loadCachedMobileMinimumVersions, saveMobileMinimumVersion } from "./mobileMinimumVersions"

// each test starts with an empty in-memory Redis
beforeEach(() => {
	stubRedisClient()
})

// put both stores back after each test
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
})

test("an empty table yields no minimum on either platform", async () => {
	stubConnectionPool(() => [])
	expect(await loadCachedMobileMinimumVersions()).toEqual({ ios: null, android: null })
})

test("a stored row sets its platform's minimum and is cached", async () => {
	// the first read loads the row, the second reads the cache
	const sentQueries = stubConnectionPool(() => [["ios", "1.2.0"]])
	expect(await loadCachedMobileMinimumVersions()).toEqual({ ios: "1.2.0", android: null })
	expect(await loadCachedMobileMinimumVersions()).toEqual({ ios: "1.2.0", android: null })
	expect(sentQueries.filter((sentQuery) => sentQuery.text.includes("mobile_minimum_versions"))).toHaveLength(1)
})

test("an unreadable table yields no minimum and is not cached", async () => {
	// the first read fails, the second reads the table again
	let isTableReadable = false
	const sentQueries = stubConnectionPool(() => {
		if (!isTableReadable) {
			throw new Error("connection refused")
		}
		return [["android", "2.0.0"]]
	})
	expect(await loadCachedMobileMinimumVersions()).toEqual({ ios: null, android: null })

	// the failed read was not stored, so the table is read again
	isTableReadable = true
	expect(await loadCachedMobileMinimumVersions()).toEqual({ ios: null, android: "2.0.0" })
	expect(sentQueries.filter((sentQuery) => sentQuery.text.includes("mobile_minimum_versions"))).toHaveLength(2)
})

test("an unreachable Redis still reads the table", async () => {
	stubUnreachableRedisClient()
	stubConnectionPool(() => [["ios", "1.5.0"]])
	expect(await loadCachedMobileMinimumVersions()).toEqual({ ios: "1.5.0", android: null })
})

test("a save writes the row and drops the cached read", async () => {
	// read once to fill the cache, save, then read the new row
	const rowsByCall = [[["ios", "1.2.0"]], [], [["ios", "1.3.0"]]]
	const sentQueries = stubConnectionPool(() => rowsByCall.shift() ?? [])
	expect(await loadCachedMobileMinimumVersions()).toEqual({ ios: "1.2.0", android: null })
	await saveMobileMinimumVersion({ platform: "ios", minimumVersion: "1.3.0", adminUserId: "admin-1" })
	expect(sentQueries.some((sentQuery) => sentQuery.text.includes("on conflict"))).toBe(true)
	expect(await loadCachedMobileMinimumVersions()).toEqual({ ios: "1.3.0", android: null })
})

test("a null save deletes the row", async () => {
	const sentQueries = stubConnectionPool(() => [])
	await saveMobileMinimumVersion({ platform: "android", minimumVersion: null, adminUserId: "admin-1" })
	expect(sentQueries.some((sentQuery) => sentQuery.text.startsWith('delete from "mobile_minimum_versions"'))).toBe(true)
})
