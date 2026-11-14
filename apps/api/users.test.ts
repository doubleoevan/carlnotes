// account tests: a close with a failed revocation before it begins and after it has begun, both close routes while
// Redis is unreachable, a LiteLLM key created while the account was closing, the edge purges a close sends, the keys
// a close records, an unchecked avatar's close, and the daily notifications email's switch
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import {
	ADMIN_USER_ACCESS_ROW,
	restoreConnectionPool,
	type SentQuery,
	stubConnectionPool,
} from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient, stubUnreachableRedisClient } from "@carlnotes/db/redisClientStub"
import * as sessions from "@carlnotes/db/sessions"
import * as store from "@carlnotes/db/store"
import * as litellmProxy from "@carlnotes/models/litellmProxy"
import * as monitoring from "@carlnotes/server/monitoring"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { TEST_ANALYTICS_PROPERTIES } from "./analyticsTestFixtures"
import { type EdgePurgeFetchSpy, stubEdgePurge, toPurgedTags } from "./edgePurgeTestFixtures"
import { toJsonRequest, toSignedInApp } from "./testSession"
import { deleteUser, usersRoute } from "./users"

// the connection pool's own query, the Redis client, and the spies, put back after each test
const restoreEnvSettings = saveEnvSettings(["REDIS_URL"])
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
	mock.restore()

	// put the environment's edge purge settings and Redis url back
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

// the error both close routes respond with while Redis is unreachable
const ACCOUNT_CLOSE_UNAVAILABLE_ERROR = "closing an account is unavailable for a moment. try again"

// whether a sent query writes a row
function isWriteQuery({ text }: SentQuery): boolean {
	return /^(insert|update|delete) /.test(text)
}

// a configured Redis that no command reaches, and a connection pool that returns admin-1's access row and user-1's
// row. returns each query sent
function stubCloseWithUnreachableRedis(): SentQuery[] {
	// the Redis url set, with a client that never connects and its failure log quiet
	Bun.env.REDIS_URL = "redis://localhost:6379"
	stubUnreachableRedisClient()
	spyOn(console, "error").mockImplementation(() => {})

	// admin-1 reads as an admin, and the close reads user-1's row
	return stubConnectionPool(({ text, values }) => {
		if (text.includes('"role"') && values.includes("admin-1")) {
			return [ADMIN_USER_ACCESS_ROW]
		}
		return toClosingUserRows({ text })
	})
}

// a user who closes their own account while Redis is unreachable gets a 503 with the account and its sessions
// unchanged, and the same close deletes the account once Redis responds again
test("a user's own close responds 503 while a configured Redis is unreachable, and succeeds once Redis responds again", async () => {
	// a configured Redis that is unreachable, with user-1 signed in
	const sentQueries = stubCloseWithUnreachableRedis()
	const app = toSignedInApp(usersRoute, "user-1")

	// the close is unavailable, and nothing is written
	const unavailableResponse = await app.request("/users/me", { method: "DELETE" })
	expect(unavailableResponse.status).toBe(503)
	expect(await unavailableResponse.json()).toEqual({ error: ACCOUNT_CLOSE_UNAVAILABLE_ERROR })
	expect(sentQueries.some(isWriteQuery)).toBe(false)

	// Redis responds again, and the same close deletes the user row
	stubRedisClient()
	const closedResponse = await app.request("/users/me", { method: "DELETE" })
	expect(closedResponse.status).toBe(200)
	expect(await closedResponse.json()).toEqual({ ok: true })
	expect(sentQueries.some(({ text }) => text.startsWith('delete from "users"'))).toBe(true)
})

// an admin who closes another user's account while Redis is unreachable gets the same 503, with nothing written
test("an admin's close of another account responds 503 while a configured Redis is unreachable", async () => {
	const sentQueries = stubCloseWithUnreachableRedis()
	const response = await toSignedInApp(usersRoute, "admin-1").request("/admin/users/user-1", { method: "DELETE" })
	expect(response.status).toBe(503)
	expect(await response.json()).toEqual({ error: ACCOUNT_CLOSE_UNAVAILABLE_ERROR })
	expect(sentQueries.some(isWriteQuery)).toBe(false)
})

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

// turn the purge on with Cloudflare responding to each purge at the status given, stub a close of a user with no
// avatar and no key, and return the fetch spy
function stubCloseWithEdgePurge(purgeStatus = 200): EdgePurgeFetchSpy {
	delete Bun.env.REDIS_URL
	spyOn(sessions, "revokeUserSessions").mockResolvedValue(false)
	stubConnectionPool(toClosingUserRows)
	return stubEdgePurge(purgeStatus)
}

// once the row is gone, one purge each names the account's avatar tag and its Topic and Podcast Dashboards' tags
test("a close purges the account's avatar and its Topic and Podcast Dashboards from the edge once each", async () => {
	const fetchSpy = stubCloseWithEdgePurge()
	expect(await deleteUser("user-1", "user-1", TEST_ANALYTICS_PROPERTIES)).toBe("deleted")
	expect(toPurgedTags(fetchSpy)).toEqual([
		"dashboard:podcastDashboard:user-1",
		"dashboard:topicDashboard:user-1",
		"user-avatar:user-1",
	])
})

// each purge Cloudflare rejects is reported, and the close still finishes
test("a failed purge is reported and the close goes on", async () => {
	stubCloseWithEdgePurge(403)
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})
	expect(await deleteUser("user-1", "user-1", TEST_ANALYTICS_PROPERTIES)).toBe("deleted")
	const reportedErrors = reportErrorSpy.mock.calls.map(([error]) => String(error)).sort()
	expect(reportedErrors).toEqual([
		expect.stringContaining("the edge purge of dashboard:podcastDashboard:user-1 failed: 403"),
		expect.stringContaining("the edge purge of dashboard:topicDashboard:user-1 failed: 403"),
		expect.stringContaining("the edge purge of user-avatar:user-1 failed: 403"),
	])
})

// the inserts that record object keys as pending among the sent queries
function toPendingObjectDeletionInserts(sentQueries: SentQuery[]): SentQuery[] {
	return sentQueries.filter(({ text }) => text.startsWith('insert into "pending_object_deletions"'))
}

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
	const pendingObjectDeletionInserts = toPendingObjectDeletionInserts(sentQueries)
	const userDeleteIndex = sentQueries.findIndex(({ text }) => text.startsWith('delete from "users"'))
	expect(pendingObjectDeletionInserts).toHaveLength(1)
	expect(pendingObjectDeletionInserts[0]?.values).toEqual(
		expect.arrayContaining(["topics/t1/chat-attachments/user-1/a1/notes.pdf", "avatars/user-1/3f2a.png"]),
	)
	expect(sentQueries.indexOf(pendingObjectDeletionInserts[0] as SentQuery)).toBeGreaterThan(userDeleteIndex)
})

// the user's unchecked avatar is collected with the avatar everyone else sees, and the unchecked image's row is
// deleted with the user row
test("a close of an account with an unchecked avatar records and deletes the unchecked object, and deletes the unchecked image's row", async () => {
	// no configured Redis, a user with an avatar and an unchecked avatar, and a spied object delete
	delete Bun.env.REDIS_URL
	spyOn(sessions, "revokeUserSessions").mockResolvedValue(false)
	const deleteStoredObjectsSpy = spyOn(store, "deleteStoredObjects").mockResolvedValue(undefined)
	const avatarKeys = ["avatars/user-1/3f2a.png", "avatars/user-1/7d4e.png"]
	const sentQueries = stubConnectionPool(({ text }) => {
		// the user row's delete returns no LiteLLM key, the avatar key, and the unchecked avatar key
		return text.startsWith('delete from "users"') ? [[null, ...avatarKeys]] : toClosingUserRows({ text })
	})

	// the close finishes, and one insert records both avatar keys after the user row's delete returns them
	expect(await deleteUser("user-1", "user-1", TEST_ANALYTICS_PROPERTIES)).toBe("deleted")
	const pendingObjectDeletionInserts = toPendingObjectDeletionInserts(sentQueries)
	const userDeleteIndex = sentQueries.findIndex(({ text }) => text.startsWith('delete from "users"'))
	expect(pendingObjectDeletionInserts).toHaveLength(1)
	expect(pendingObjectDeletionInserts[0]?.values).toEqual(expect.arrayContaining(avatarKeys))
	expect(sentQueries.indexOf(pendingObjectDeletionInserts[0] as SentQuery)).toBeGreaterThan(userDeleteIndex)

	// both objects are deleted, and so is the unchecked image's row of the user's avatar
	expect(deleteStoredObjectsSpy.mock.calls).toEqual([[avatarKeys]])
	const uncheckedImageDelete = sentQueries.find(({ text }) => text.startsWith('delete from "unchecked_images"'))
	expect(uncheckedImageDelete?.values).toEqual(["userAvatar", "user-1"])
})

// a team the user led alone is deleted with the account, its chat room attachment and avatar keys recorded in the
// deleting transaction, their objects deleted after it, and its avatar and Team Dashboard purged from the edge
test("a close deletes a solo team with its chat room attachments and avatar", async () => {
	// the purge on, a user leading one team alone, and the console quiet
	const fetchSpy = stubCloseWithEdgePurge()
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
	const pendingObjectDeletionInserts = toPendingObjectDeletionInserts(sentQueries)
	expect(pendingObjectDeletionInserts.flatMap(({ values }) => values)).toEqual(
		expect.arrayContaining(["topics/t1/room-attachments/r1/notes.pdf", "avatars/teams/team-1/9c1b.webp"]),
	)
	expect(deleteStoredObjectsSpy.mock.calls[0]?.[0]).toEqual([
		"topics/t1/room-attachments/r1/notes.pdf",
		"avatars/teams/team-1/9c1b.webp",
	])

	// the team's avatar and Team Dashboard leave the edge with the account's own tags
	expect(toPurgedTags(fetchSpy)).toEqual(
		expect.arrayContaining(["dashboard:teamDashboard:team-1", "team-avatar:team-1", "user-avatar:user-1"]),
	)
})

// the switch saves its one column to the row and rewrites the sessions, and a visitor's request writes nothing
test("the notifications email switch saves to the user's row and refreshes the sessions", async () => {
	const refreshSessionUserSpy = spyOn(sessions, "refreshSessionUser").mockResolvedValue()
	const sentQueries = stubConnectionPool(() => [])
	const response = await toSignedInApp(usersRoute, "user-1").request(
		"/users/me/notifications-email",
		toJsonRequest({ isEnabled: false }),
	)
	expect(response.status).toBe(200)

	// the one column is written for this user alone
	const updateQuery = sentQueries.find((sentQuery) => sentQuery.text.startsWith('update "users"'))
	expect(updateQuery?.text).toContain('"is_notifications_email_enabled" = $1')
	expect(updateQuery?.values?.[0]).toBe(false)
	expect(updateQuery?.values?.at(-1)).toBe("user-1")
	expect(refreshSessionUserSpy).toHaveBeenCalledWith("user-1")

	// a visitor is rejected before any query
	sentQueries.length = 0
	const visitorResponse = await usersRoute.request("/users/me/notifications-email", toJsonRequest({ isEnabled: true }))
	expect(visitorResponse.status).toBe(401)
	expect(sentQueries).toHaveLength(0)
})
