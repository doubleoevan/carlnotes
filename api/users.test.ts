// account close tests: a failed revocation stops the close only if Redis is configured,
// and a revocation that fails after the close has begun is reported
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as monitoring from "@shared/monitoring"
import { connectionPool } from "../db"
import type { AnalyticsProperties } from "./currentUser"
import * as sessions from "./sessions"
import { deleteUser } from "./users"

// the analytics properties that a close is tracked with
const ANALYTICS_PROPERTIES: AnalyticsProperties = {
	plan: "free",
	platform: "desktop",
	browserPlatform: "other",
	isInAppBrowser: false,
}

// the connection pool's own query and the environment's Redis url, put back after each test along with the spied revocation
const originalConnectionPoolQuery = connectionPool.query
const originalRedisUrl = Bun.env.REDIS_URL
afterEach(() => {
	connectionPool.query = originalConnectionPoolQuery
	mock.restore()

	// a Redis url that the environment never set stays unset
	if (originalRedisUrl === undefined) {
		delete Bun.env.REDIS_URL
	} else {
		Bun.env.REDIS_URL = originalRedisUrl
	}
})

// a failed revocation, and a connection pool that counts its queries and returns no rows
function stubFailedRevocation(): { readQueryCount: () => number } {
	spyOn(sessions, "revokeUserSessions").mockResolvedValue(false)

	// every query returns no rows and is counted
	let queryCount = 0
	connectionPool.query = (() => {
		queryCount++
		return Promise.resolve({ rows: [], fields: [], rowCount: 0 })
	}) as unknown as typeof connectionPool.query
	return { readQueryCount: () => queryCount }
}

// a configured Redis that is unreachable stops the close before anything is deleted
test("closing an account while a configured Redis is unreachable deletes nothing", async () => {
	Bun.env.REDIS_URL = "redis://localhost:6379"
	const { readQueryCount } = stubFailedRevocation()
	expect(await deleteUser("user-1", "user-1", ANALYTICS_PROPERTIES)).toBe("unavailable")
	expect(readQueryCount()).toBe(0)
})

// without a configured Redis there is nothing to sign out of, so the close goes on
test("closing an account without a configured Redis goes on", async () => {
	delete Bun.env.REDIS_URL
	const { readQueryCount } = stubFailedRevocation()
	expect(await deleteUser("user-1", "user-1", ANALYTICS_PROPERTIES)).toBe("missing")
	expect(readQueryCount()).toBeGreaterThan(0)
})

// a revocation that fails after the close has begun is reported, and the close still deletes the row
test("a second failed revocation is reported and the close goes on", async () => {
	// set a Redis url, make the first revocation succeed and the second fail, and spy on the error report
	Bun.env.REDIS_URL = "redis://localhost:6379"
	spyOn(sessions, "revokeUserSessions").mockResolvedValueOnce(true).mockResolvedValueOnce(false)
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})

	// Postgres holds the user row with no avatar and no litellm key, and nothing else
	connectionPool.query = ((queryConfig: { text: string }) =>
		Promise.resolve({
			rows: queryConfig.text.includes('"avatar_key"') ? [["user-1", null, null]] : [],
			fields: [],
			rowCount: 0,
		})) as unknown as typeof connectionPool.query

	// the close finishes and the report names the user
	expect(await deleteUser("user-1", "user-1", ANALYTICS_PROPERTIES)).toBe("deleted")
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(reportErrorSpy.mock.calls[0]?.[2]).toEqual({ userId: "user-1" })
})
