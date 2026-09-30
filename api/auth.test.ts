// auth tests: a signup's default avatar, the warning logged if TRUSTED_PROXIES is unset or misses a proxy hop,
// the session hooks that keep Redis in sync with Postgres, and the verification values kept in both
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { connectionPool } from "../db"
import * as redis from "../db/redis"
import { auth, toSignupAvatarSource, toTrustedProxiesWarning } from "./auth"
import * as sessions from "./sessions"

// the connection pool's own query, put back after each test along with the spied functions
const originalConnectionPoolQuery = connectionPool.query
afterEach(() => {
	connectionPool.query = originalConnectionPoolQuery
	mock.restore()
})

// an oauth signup defaults to the provider's photo, a password signup never has one
test("a signup with a provider photo defaults to it", () => {
	expect(toSignupAvatarSource("https://lh3.googleusercontent.com/a/photo.jpg")).toBe("oauth")
})

// no photo, empty string, or null all fall back to the generated initials
test("a signup with no provider photo falls back to generated initials", () => {
	expect(toSignupAvatarSource(null)).toBe("generated")
	expect(toSignupAvatarSource(undefined)).toBe("generated")
	expect(toSignupAvatarSource("")).toBe("generated")
})

// if TRUSTED_PROXIES is unset, the warning suggests the proxy hops from the first request's x-forwarded-for header
test("an unset TRUSTED_PROXIES reports the hops behind the user", () => {
	const trustedProxiesWarning = toTrustedProxiesWarning({
		forwardedFor: "203.0.113.7, 172.70.1.1",
		clientAddress: null,
		trustedProxyCount: 0,
	})
	expect(trustedProxiesWarning).toContain("TRUSTED_PROXIES is unset")
	expect(trustedProxiesWarning).toContain("172.70.1.1")
})

// if TRUSTED_PROXIES lists every hop, a header through Cloudflare resolves to the visitor, and there is nothing to report
test("a header that resolves to a public client reports nothing", () => {
	const trustedProxiesWarning = toTrustedProxiesWarning({
		forwardedFor: "203.0.113.7, 172.70.1.1",
		clientAddress: "203.0.113.7",
		trustedProxyCount: 22,
	})
	expect(trustedProxiesWarning).toBeNull()
})

// if TRUSTED_PROXIES misses a hop, every caller would share that hop's address, or no address at all
test("a header that resolves to an internal address or none reports the missing hop", () => {
	const internalWarning = toTrustedProxiesWarning({
		forwardedFor: "203.0.113.7, 172.70.1.1, 10.0.0.5",
		clientAddress: "10.0.0.5",
		trustedProxyCount: 22,
	})
	const unresolvedWarning = toTrustedProxiesWarning({
		forwardedFor: "172.70.1.1",
		clientAddress: null,
		trustedProxyCount: 22,
	})
	expect(internalWarning).toContain("10.0.0.5")
	expect(unresolvedWarning).toContain("no address")
})

// a session that Better Auth deletes from Postgres is deleted from Redis by its token
test("the session delete hook deletes the token from Redis", async () => {
	const deleteRedisKeySpy = spyOn(redis, "deleteRedisKey").mockResolvedValue(undefined)
	await auth.options.databaseHooks?.session?.delete?.after?.({ token: "token-a" } as never)
	expect(deleteRedisKeySpy).toHaveBeenCalledWith("token-a")
})

// a refresh that matched no Postgres row stores nothing and deletes the Redis copy that the request's cookie names
test("the session update hook deletes the Redis copy of a session that Postgres no longer holds", async () => {
	// spy on the Redis writes and fake a request whose signed cookie names the revoked token
	const cacheSessionSpy = spyOn(sessions, "cacheSession").mockResolvedValue(undefined)
	const deleteRedisKeySpy = spyOn(redis, "deleteRedisKey").mockResolvedValue(undefined)
	const context = {
		getSignedCookie: async () => "token-a",
		context: { authCookies: { sessionToken: { name: "session_token" } }, secret: "secret" },
	}

	// the refresh passes no session
	await auth.options.databaseHooks?.session?.update?.after?.(undefined as never, context as never)
	expect(cacheSessionSpy).not.toHaveBeenCalled()
	expect(deleteRedisKeySpy).toHaveBeenCalledWith("token-a")

	// a refresh outside a request has no cookie to read and deletes nothing more
	await auth.options.databaseHooks?.session?.update?.after?.(undefined as never, null)
	expect(deleteRedisKeySpy).toHaveBeenCalledTimes(1)
})

// a verification value is kept in Postgres beside its Redis copy, so an unreachable Redis never breaks a link
test("Better Auth keeps verification values in Postgres", () => {
	expect(auth.options.verification?.storeInDatabase).toBe(true)
})

// a password reset deletes the user's other reset links from Postgres, and each link's Redis copy by its identifier
test("a password reset deletes the user's other reset links from Postgres and from Redis", async () => {
	// Postgres returns two deleted reset-password rows, and a spy records each Redis key delete
	connectionPool.query = (() =>
		Promise.resolve({
			rows: [["reset-password:token-a"], ["reset-password:token-b"]],
			fields: [],
			rowCount: 2,
		})) as unknown as typeof connectionPool.query
	const deleteRedisKeySpy = spyOn(redis, "deleteRedisKey").mockResolvedValue(undefined)

	// reset the password and check that both Redis copies were deleted
	await auth.options.emailAndPassword?.onPasswordReset?.({ user: { id: "user-1" } } as never)
	expect(deleteRedisKeySpy).toHaveBeenCalledWith("verification:reset-password:token-a")
	expect(deleteRedisKeySpy).toHaveBeenCalledWith("verification:reset-password:token-b")
})

// the secondary storage sets a key with the time to live that Better Auth passes, and a plain key if it passes none
test("the secondary storage sets a key with its time to live, or without one", async () => {
	// a fake Redis client that records each set
	const setArguments: unknown[][] = []
	const fakeRedisClient = {
		set: async (...setCallArguments: unknown[]): Promise<string> => {
			setArguments.push(setCallArguments)
			return "OK"
		},
	}
	spyOn(redis, "runWithRedis").mockImplementation((async (_operationName, runOperation) =>
		runOperation(fakeRedisClient as never)) as typeof redis.runWithRedis)

	// set one key with a time to live and one key without
	await auth.options.secondaryStorage?.set("key-a", "value-a", 60)
	await auth.options.secondaryStorage?.set("key-b", "value-b")
	expect(setArguments).toEqual([
		["key-a", "value-a", "EX", 60],
		["key-b", "value-b"],
	])
})

// the secondary storage's increment returns the rate limit window's count, and zero if Redis could not count the hit
test("the secondary storage counts a hit, and counts zero while Redis is unreachable", async () => {
	// a counted hit returns its count, and the time to live arrives in milliseconds
	const incrementRateLimitWindowSpy = spyOn(redis, "incrementRateLimitWindow").mockResolvedValue({
		count: 3,
		resetAt: Date.now() + 60_000,
	})
	expect(await auth.options.secondaryStorage?.increment?.("key-a", 60)).toBe(3)
	expect(incrementRateLimitWindowSpy).toHaveBeenCalledWith("key-a", 60_000)

	// a hit that Redis could not count returns zero
	incrementRateLimitWindowSpy.mockResolvedValue(null)
	expect(await auth.options.secondaryStorage?.increment?.("key-a", 60)).toBe(0)
})
