// account close tests: a failed revocation before the close begins and after the close has begun,
// and a LiteLLM key created while the account was closing
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as store from "@carlnotes/db/store"
import * as litellmProxy from "@carlnotes/models/litellmProxy"
import * as monitoring from "@carlnotes/server/monitoring"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { TEST_ANALYTICS_PROPERTIES } from "./analyticsTestFixtures"
import * as sessions from "./sessions"
import { deleteUser } from "./users"

// the connection pool's own query and the environment's Redis url, put back after each test along with the spies
const restoreEnvSettings = saveEnvSettings(["REDIS_URL"])
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
	delete Bun.env.CLOUDFLARE_ZONE_ID
	delete Bun.env.CLOUDFLARE_API_TOKEN
	restoreEnvSettings()
})

// a failed revocation, and a connection pool that counts its queries and returns no rows
function stubFailedRevocation(): { readSentQueryCount: () => number } {
	spyOn(sessions, "revokeUserSessions").mockResolvedValue(false)

	// every query returns no rows and is counted
	const sentQueries = stubConnectionPool()
	return { readSentQueryCount: () => sentQueries.length }
}

// a configured Redis that is unreachable stops the close before anything is deleted
test("closing an account while a configured Redis is unreachable deletes nothing", async () => {
	Bun.env.REDIS_URL = "redis://localhost:6379"
	const { readSentQueryCount } = stubFailedRevocation()
	expect(await deleteUser("user-1", "user-1", TEST_ANALYTICS_PROPERTIES)).toBe("unavailable")
	expect(readSentQueryCount()).toBe(0)
})

// without a configured Redis there is nothing to sign out of, so the close goes on
test("closing an account without a configured Redis goes on", async () => {
	delete Bun.env.REDIS_URL
	const { readSentQueryCount } = stubFailedRevocation()
	expect(await deleteUser("user-1", "user-1", TEST_ANALYTICS_PROPERTIES)).toBe("missing")
	expect(readSentQueryCount()).toBeGreaterThan(0)
})

// the queries a close sends, answered with the user row for its select, with the given LiteLLM key, and with no rows
// for the rest
function toClosingUserRows({ text }: Pick<SentQuery, "text">, litellmVirtualKey: string | null = null): unknown[] {
	return text.includes('"litellm_virtual_key" from "users"') ? [["user-1", litellmVirtualKey]] : []
}

// a revocation that fails after the close has begun is reported, and the close still deletes the row
test("a second failed revocation is reported and the close goes on", async () => {
	// set a Redis url, make the first revocation succeed and the second fail, and spy on the error report
	Bun.env.REDIS_URL = "redis://localhost:6379"
	spyOn(sessions, "revokeUserSessions").mockResolvedValueOnce(true).mockResolvedValueOnce(false)
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})

	// Postgres holds the user row with no avatar and no litellm key, and nothing else
	stubConnectionPool(toClosingUserRows)

	// the close finishes and the report names the user
	expect(await deleteUser("user-1", "user-1", TEST_ANALYTICS_PROPERTIES)).toBe("deleted")
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
		// return the deleted row's LiteLLM key and no avatar for the user row delete
		if (text.startsWith('delete from "users"')) {
			return [[deletedUserRowLiteLLMKey, null]]
		}

		// return the user row with its LiteLLM key for the user row select, and no rows for any other query
		return toClosingUserRows({ text }, selectedUserRowLiteLLMKey)
	})
}

// a model call can create a key after the close read the user's row, and the close deletes that key from the proxy
test("a LiteLLM key created while the account was closing is deleted from the proxy", async () => {
	// no configured Redis, and a spy on the key delete
	delete Bun.env.REDIS_URL
	spyOn(sessions, "revokeUserSessions").mockResolvedValue(false)
	const deleteLiteLLMKeySpy = spyOn(litellmProxy, "deleteLiteLLMKey").mockResolvedValue(undefined)

	// the close reads a user row with no key, and the delete of that row returns a key
	stubUserRowLiteLLMKeys({ selectedUserRowLiteLLMKey: null, deletedUserRowLiteLLMKey: "sk-late" })
	expect(await deleteUser("user-1", "user-1", TEST_ANALYTICS_PROPERTIES)).toBe("deleted")
	expect(deleteLiteLLMKeySpy.mock.calls).toEqual([["sk-late"]])

	// a failed delete of the key is reported, and the close still finishes
	const reportErrorSpy = quietErrorReports()
	deleteLiteLLMKeySpy.mockRejectedValue(new Error("litellm key/delete failed: 500"))
	expect(await deleteUser("user-1", "user-1", TEST_ANALYTICS_PROPERTIES)).toBe("deleted")
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(reportErrorSpy.mock.calls[0]?.[2]).toEqual({ userId: "user-1" })
})

// a close that read the user's key deletes that key once, even though the row delete returns the same key
test("a LiteLLM key that the close already deleted is not deleted a second time", async () => {
	// no configured Redis, and a spy on the key delete
	delete Bun.env.REDIS_URL
	spyOn(sessions, "revokeUserSessions").mockResolvedValue(false)
	const deleteLiteLLMKeySpy = spyOn(litellmProxy, "deleteLiteLLMKey").mockResolvedValue(undefined)

	// the close reads the user's key, and the delete of the user's row returns the same key
	stubUserRowLiteLLMKeys({ selectedUserRowLiteLLMKey: "sk-stored", deletedUserRowLiteLLMKey: "sk-stored" })
	expect(await deleteUser("user-1", "user-1", TEST_ANALYTICS_PROPERTIES)).toBe("deleted")
	expect(deleteLiteLLMKeySpy.mock.calls).toEqual([["sk-stored"]])
})

// turn the purge on, stub a close of a user with no avatar and no key, and return the fetch spy
function stubCloseWithEdgePurge(): ReturnType<typeof spyOn<typeof globalThis, "fetch">> {
	Bun.env.CLOUDFLARE_ZONE_ID = "zone-1"
	Bun.env.CLOUDFLARE_API_TOKEN = "token-1"
	delete Bun.env.REDIS_URL
	spyOn(sessions, "revokeUserSessions").mockResolvedValue(false)
	stubConnectionPool(toClosingUserRows)
	return spyOn(globalThis, "fetch")
}

// once the row is gone, one purge names the account's avatar tag
test("a close purges the account's avatar tag from the edge once", async () => {
	const fetchSpy = stubCloseWithEdgePurge().mockResolvedValue(new Response("{}", { status: 200 }))
	expect(await deleteUser("user-1", "user-1", TEST_ANALYTICS_PROPERTIES)).toBe("deleted")
	const purgeRequests = fetchSpy.mock.calls.filter(([url]) => String(url).endsWith("/purge_cache"))
	expect(purgeRequests).toHaveLength(1)
	expect(JSON.parse(String(purgeRequests[0]?.[1]?.body))).toEqual({ tags: ["user-avatar:user-1"] })
})

// a purge Cloudflare rejects is reported, and the close still finishes
test("a failed purge is reported and the close goes on", async () => {
	stubCloseWithEdgePurge().mockResolvedValue(new Response("bad token", { status: 403 }))
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	expect(await deleteUser("user-1", "user-1", TEST_ANALYTICS_PROPERTIES)).toBe("deleted")
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(String(reportErrorSpy.mock.calls[0]?.[0])).toContain("the edge purge of user-avatar:user-1 failed: 403")
})

// every key the account owned is recorded as pending in the same transaction as the user row's delete
test("a close records every key the account owned", async () => {
	// no configured Redis, a user with an avatar and one chat attachment, and the console quiet
	delete Bun.env.REDIS_URL
	spyOn(sessions, "revokeUserSessions").mockResolvedValue(false)
	spyOn(console, "error").mockImplementation(() => {})
	const sentQueries = stubConnectionPool(({ text }) => {
		// the user row's delete returns the avatar key
		if (text.startsWith('delete from "users"')) {
			return [[null, "avatars/user-1/3f2a.png"]]
		}

		// the user row's select has no key, and the chat attachment read has one key
		if (text.includes('"litellm_virtual_key" from "users"')) {
			return [["user-1", null]]
		}
		return text.includes('from "chat_attachments"') ? [["topics/t1/chat-attachments/user-1/a1/notes.pdf"]] : []
	})

	// the close finishes, and one insert records both keys after the user row's delete returns them
	expect(await deleteUser("user-1", "user-1", TEST_ANALYTICS_PROPERTIES)).toBe("deleted")
	const pendingObjectDeletionInserts = sentQueries.filter(({ text }) =>
		text.startsWith('insert into "pending_object_deletions"'),
	)
	const userDeleteIndex = sentQueries.findIndex(({ text }) => text.startsWith('delete from "users"'))
	expect(pendingObjectDeletionInserts).toHaveLength(1)
	expect(pendingObjectDeletionInserts[0]?.values).toEqual(
		expect.arrayContaining(["topics/t1/chat-attachments/user-1/a1/notes.pdf", "avatars/user-1/3f2a.png"]),
	)
	expect(sentQueries.indexOf(pendingObjectDeletionInserts[0] as SentQuery)).toBeGreaterThan(userDeleteIndex)
})

// a team the user led alone is deleted with the account, its chat room attachment and avatar keys recorded in the
// deleting transaction and their objects deleted after it
test("a close deletes a solo team with its chat room attachments and avatar", async () => {
	// no configured Redis, a user leading one team alone, and the console quiet
	delete Bun.env.REDIS_URL
	spyOn(sessions, "revokeUserSessions").mockResolvedValue(false)
	spyOn(console, "error").mockImplementation(() => {})
	const deleteStoredObjectsSpy = spyOn(store, "deleteStoredObjects").mockResolvedValue(undefined)
	const sentQueries = stubConnectionPool(({ text }) => {
		// the only-leader read names the team, and the next-leader read finds nobody
		if (text.includes('from "team_members"') && text.includes("having")) {
			return [["team-1"]]
		}

		// the chat room attachment delete and the team delete return their keys
		if (text.startsWith('delete from "room_attachments"')) {
			return [["topics/t1/room-attachments/r1/notes.pdf"]]
		}
		if (text.startsWith('delete from "teams"')) {
			return [["avatars/teams/team-1/9c1b.webp"]]
		}
		return toClosingUserRows({ text })
	})

	// the close finishes, both keys are recorded, and both objects are deleted together
	expect(await deleteUser("user-1", "user-1", TEST_ANALYTICS_PROPERTIES)).toBe("deleted")
	const pendingObjectDeletionInserts = sentQueries.filter(({ text }) =>
		text.startsWith('insert into "pending_object_deletions"'),
	)
	expect(pendingObjectDeletionInserts.flatMap(({ values }) => values)).toEqual(
		expect.arrayContaining(["topics/t1/room-attachments/r1/notes.pdf", "avatars/teams/team-1/9c1b.webp"]),
	)
	expect(deleteStoredObjectsSpy.mock.calls[0]?.[0]).toEqual([
		"topics/t1/room-attachments/r1/notes.pdf",
		"avatars/teams/team-1/9c1b.webp",
	])
})
