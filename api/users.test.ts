// account close tests: a failed revocation before the close begins and after the close has begun,
// and a LiteLLM key created while the account was closing
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as monitoring from "@shared/monitoring"
import { restoreConnectionPool, stubConnectionPool } from "../db/connectionPoolStub"
import * as litellm from "../worker/litellm"
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

// the connection pool's own query and the environment's Redis url, put back after each test along with the spies
const originalRedisUrl = Bun.env.REDIS_URL
afterEach(() => {
	restoreConnectionPool()
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
	const sentQueries = stubConnectionPool()
	return { readQueryCount: () => sentQueries.length }
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
	stubConnectionPool(({ text }) => (text.includes('"avatar_key"') ? [["user-1", null, null]] : []))

	// the close finishes and the report names the user
	expect(await deleteUser("user-1", "user-1", ANALYTICS_PROPERTIES)).toBe("deleted")
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(reportErrorSpy.mock.calls[0]?.[2]).toEqual({ userId: "user-1" })
})

// the LiteLLM key that the user row select returns, and the LiteLLM key that the user row delete returns
type StubUserRowLiteLLMKeysOptions = {
	selectedUserRowLiteLLMKey: string | null
	deletedUserRowLiteLLMKey: string | null
}

// stub the connection pool so that the user row select and the user row delete each return a LiteLLM key
function stubUserRowLiteLLMKeys({
	selectedUserRowLiteLLMKey,
	deletedUserRowLiteLLMKey,
}: StubUserRowLiteLLMKeysOptions): void {
	stubConnectionPool(({ text }) => {
		// return the user row with its LiteLLM key for the user row select
		if (text.includes('"avatar_key"')) {
			return [["user-1", null, selectedUserRowLiteLLMKey]]
		}

		// return the deleted row's LiteLLM key for the user row delete, and no rows for any other query
		return text.startsWith('delete from "users"') ? [[deletedUserRowLiteLLMKey]] : []
	})
}

// a model call can create a key after the close read the user's row, and the close deletes that key from the proxy
test("a LiteLLM key created while the account was closing is deleted from the proxy", async () => {
	// no configured Redis, and a spy on the key delete
	delete Bun.env.REDIS_URL
	spyOn(sessions, "revokeUserSessions").mockResolvedValue(false)
	const deleteLiteLLMKeySpy = spyOn(litellm, "deleteLiteLLMKey").mockResolvedValue(undefined)

	// the close reads a user row with no key, and the delete of that row returns a key
	stubUserRowLiteLLMKeys({ selectedUserRowLiteLLMKey: null, deletedUserRowLiteLLMKey: "sk-late" })
	expect(await deleteUser("user-1", "user-1", ANALYTICS_PROPERTIES)).toBe("deleted")
	expect(deleteLiteLLMKeySpy.mock.calls).toEqual([["sk-late"]])

	// a failed delete of the key is reported, and the close still finishes
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	spyOn(console, "error").mockImplementation(() => {})
	deleteLiteLLMKeySpy.mockRejectedValue(new Error("litellm key/delete failed: 500"))
	expect(await deleteUser("user-1", "user-1", ANALYTICS_PROPERTIES)).toBe("deleted")
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(reportErrorSpy.mock.calls[0]?.[2]).toEqual({ userId: "user-1" })
})

// a close that read the user's key deletes that key once, even though the row delete returns the same key
test("a LiteLLM key that the close already deleted is not deleted a second time", async () => {
	// no configured Redis, and a spy on the key delete
	delete Bun.env.REDIS_URL
	spyOn(sessions, "revokeUserSessions").mockResolvedValue(false)
	const deleteLiteLLMKeySpy = spyOn(litellm, "deleteLiteLLMKey").mockResolvedValue(undefined)

	// the close reads the user's key, and the delete of the user's row returns the same key
	stubUserRowLiteLLMKeys({ selectedUserRowLiteLLMKey: "sk-stored", deletedUserRowLiteLLMKey: "sk-stored" })
	expect(await deleteUser("user-1", "user-1", ANALYTICS_PROPERTIES)).toBe("deleted")
	expect(deleteLiteLLMKeySpy.mock.calls).toEqual([["sk-stored"]])
})
