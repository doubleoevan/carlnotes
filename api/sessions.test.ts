// session tests over spied Redis reads and writes: refreshing the users row in each stored session,
// revoking a user's sessions, and caching a missing session
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "../db/connectionPoolStub"
import * as redis from "../db/redis"
import { cacheSession, refreshSessionUser, revokeUserSessions } from "./sessions"

// a session expiry an hour from now, and the users row before and after a rename
const SESSION_EXPIRES_AT = new Date(Date.now() + 60 * 60 * 1000)
const OLD_USER_ROW = { id: "user-1", username: "old-name" }
const NEW_USER_ROW = { id: "user-1", username: "new-name" }

// what Redis holds under each key for a test
function stubRedisKeys(keys: Record<string, unknown>): void {
	const readStubbedKey = async (key: string): Promise<unknown> => keys[key] ?? null
	spyOn(redis, "readRedisJson").mockImplementation(readStubbedKey as typeof redis.readRedisJson)
}

// the session tokens that Postgres holds for a test, one row each
function stubSessionTokens(sessionTokens: string[]): void {
	stubConnectionPool(() => sessionTokens.map((sessionToken) => [sessionToken]))
}

// the connection pool's own query, put back after each test along with the spied Redis functions
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// a user refresh rewrites each stored session with the fresh users row and keeps the session's expiry
test("refreshSessionUser replaces each stored session with the fresh users row", async () => {
	// Postgres holds two tokens. Redis holds only the first, and no active-sessions list
	stubSessionTokens(["token-a", "token-b"])
	stubRedisKeys({
		"token-a": { session: { token: "token-a", expiresAt: SESSION_EXPIRES_AT.toISOString() }, user: OLD_USER_ROW },
	})
	const replaceRedisJsonSpy = spyOn(redis, "replaceRedisJson").mockResolvedValue(undefined)
	await refreshSessionUser("user-1", async () => NEW_USER_ROW)

	// one replace under the stored token, with the new users row and a time to live of nearly an hour
	expect(replaceRedisJsonSpy).toHaveBeenCalledTimes(1)
	const [replaceRedisJsonOptions] = replaceRedisJsonSpy.mock.calls[0] as [redis.ReplaceRedisJsonOptions]
	expect(replaceRedisJsonOptions.key).toBe("token-a")
	expect((replaceRedisJsonOptions.value as { user: unknown }).user).toEqual(NEW_USER_ROW)
	expect(replaceRedisJsonOptions.ttlMs).toBeGreaterThan(59 * 60 * 1000)
})

// a revocation deletes the active-sessions list and every token that Postgres holds for the user, in one command
test("revokeUserSessions deletes the active-sessions list and every token that Postgres holds", async () => {
	// Postgres holds two tokens, and a fake Redis client records each key that the revocation deletes
	stubSessionTokens(["token-a", "token-b"])
	const deletedKeys: string[] = []
	const fakeRedisClient = { del: async (...keys: string[]) => deletedKeys.push(...keys) }
	spyOn(redis, "runWithRedis").mockImplementation((async (_operationName, runOperation) =>
		runOperation(fakeRedisClient as never)) as typeof redis.runWithRedis)

	// both tokens and the list are deleted, and the revocation returns true
	expect(await revokeUserSessions("user-1")).toBe(true)
	expect(deletedKeys).toEqual(["token-a", "token-b", "active-sessions-user-1"])
})

// a revocation returns false while Redis is unreachable
test("revokeUserSessions returns false while Redis is unreachable", async () => {
	stubSessionTokens([])
	spyOn(redis, "runWithRedis").mockResolvedValue(null)
	expect(await revokeUserSessions("user-1")).toBe(false)
})

// a session missing from Redis is stored with the users row, and the session's token is added to the active-sessions list
test("cacheSession stores a missing session and lists its token", async () => {
	stubRedisKeys({})
	const saveRedisJsonSpy = spyOn(redis, "saveRedisJson").mockResolvedValue(undefined)
	const session = { token: "token-a", userId: "user-1", expiresAt: SESSION_EXPIRES_AT }
	await cacheSession(session, async () => NEW_USER_ROW)

	// the session's entry, then an active-sessions list that holds only the session's token
	expect(saveRedisJsonSpy).toHaveBeenCalledTimes(2)
	const [sessionSaveOptions] = saveRedisJsonSpy.mock.calls[0] as [redis.SaveRedisJsonOptions]
	const [activeSessionsSaveOptions] = saveRedisJsonSpy.mock.calls[1] as [redis.SaveRedisJsonOptions]
	expect(sessionSaveOptions.key).toBe("token-a")
	expect(sessionSaveOptions.value).toEqual({ session, user: NEW_USER_ROW })
	expect(activeSessionsSaveOptions.key).toBe("active-sessions-user-1")
	expect(activeSessionsSaveOptions.value).toEqual([{ token: "token-a", expiresAt: SESSION_EXPIRES_AT.getTime() }])
})

// a session that Redis already holds is left alone
test("cacheSession leaves a stored session alone", async () => {
	stubRedisKeys({ "token-a": { session: {}, user: OLD_USER_ROW } })
	const saveRedisJsonSpy = spyOn(redis, "saveRedisJson").mockResolvedValue(undefined)
	await cacheSession({ token: "token-a", userId: "user-1", expiresAt: SESSION_EXPIRES_AT }, async () => NEW_USER_ROW)
	expect(saveRedisJsonSpy).not.toHaveBeenCalled()
})
