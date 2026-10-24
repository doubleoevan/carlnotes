// auth tests: a signup's LiteLLM key and default avatar, the session hooks that keep Redis in sync with Postgres,
// the verification values kept in both, Apple's posted callback, and the origins the mobile app is trusted on
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { MOBILE_APP_SCHEME_ORIGIN } from "@carlnotes/contracts/mobileApp"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as redis from "@carlnotes/db/redis"
import * as redisRateLimits from "@carlnotes/db/redisRateLimits"
import * as litellmProxy from "@carlnotes/models/litellmProxy"
import { appUrl } from "@carlnotes/server/appUrl"
import { quietErrorReports } from "@carlnotes/server/monitoringTestFixtures"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import {
	auth,
	loadAppleProviderOptions,
	sendAuthEmailInBackground,
	toSignupAvatarSource,
	toTrustedOrigins,
} from "./auth"
import { APPLE_ID_ORIGIN } from "./authHooks"
import * as sessions from "./sessions"
import * as usernames from "./usernames"

// the connection pool's own query, put back after each test along with the spied functions
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// run the user create hook for an oauth signup with no username of its own.
// return the data that the user is created with
async function runUserCreateHook(): Promise<Record<string, unknown>> {
	spyOn(usernames, "toAssignedUsername").mockResolvedValue("steady-owl-12")
	const signupUser = { email: "new@example.com", name: "New User", emailVerified: true, image: null }
	const userCreateHookResult = await auth.options.databaseHooks?.user?.create?.before?.(
		signupUser as never,
		{ path: "/callback/:id" } as never,
	)
	return (userCreateHookResult as { data: Record<string, unknown> }).data
}

// a signup whose LiteLLM key creation fails or times out still creates the user with no key and reports the failure
test("a signup whose key creation fails creates the user with no key and reports the failure", async () => {
	// make the key creation time out, spy on the error report, and quiet the console
	spyOn(litellmProxy, "provisionLiteLLMKey").mockRejectedValue(
		new DOMException("The operation timed out.", "TimeoutError"),
	)
	const reportErrorSpy = quietErrorReports()

	// the user is created with a username and no key, and the failure is reported once
	const newUser = await runUserCreateHook()
	expect(newUser).toMatchObject({ email: "new@example.com", username: "steady-owl-12" })
	expect(newUser.litellmVirtualKey).toBeUndefined()
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
})

// a signup whose LiteLLM key creation succeeds stores the key on the new user
test("a signup whose key creation succeeds creates the user with the key", async () => {
	spyOn(litellmProxy, "provisionLiteLLMKey").mockResolvedValue("sk-new")
	expect((await runUserCreateHook()).litellmVirtualKey).toBe("sk-new")
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

// a session that Better Auth deletes from Postgres is deleted from Redis by its token
test("the session delete hook deletes the token from Redis", async () => {
	const deleteRedisKeySpy = spyOn(redis, "deleteRedisKeys").mockResolvedValue(1)
	await auth.options.databaseHooks?.session?.delete?.after?.({ token: "token-a" } as never)
	expect(deleteRedisKeySpy).toHaveBeenCalledWith("token-a")
})

// a refresh that matched no Postgres row stores nothing and deletes the Redis copy that the request's cookie names
test("the session update hook deletes the Redis copy of a session that Postgres no longer holds", async () => {
	// spy on the Redis writes and fake a request whose signed cookie names the revoked token
	const cacheSessionSpy = spyOn(sessions, "cacheSession").mockResolvedValue(undefined)
	const deleteRedisKeySpy = spyOn(redis, "deleteRedisKeys").mockResolvedValue(1)
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

// a password reset deletes the user's other reset links from Postgres, and their Redis copies by identifier in one delete
test("a password reset deletes the user's other reset links from Postgres and from Redis", async () => {
	// Postgres returns two deleted reset-password rows, and a spy records the Redis key delete
	stubConnectionPool(() => [["reset-password:token-a"], ["reset-password:token-b"]])
	const deleteRedisKeySpy = spyOn(redis, "deleteRedisKeys").mockResolvedValue(1)

	// reset the password and check that both Redis copies were deleted
	await auth.options.emailAndPassword?.onPasswordReset?.({ user: { id: "user-1" } } as never)
	expect(deleteRedisKeySpy).toHaveBeenCalledWith(
		"verification:reset-password:token-a",
		"verification:reset-password:token-b",
	)
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

// the secondary storage's increment returns the rate limit window's count, with the time to live in milliseconds
test("the secondary storage counts a hit on the key's rate limit window", async () => {
	const incrementRateLimitWindowSpy = spyOn(redisRateLimits, "incrementRateLimitWindow").mockResolvedValue({
		count: 3,
		resetAt: Date.now() + 60_000,
	})
	expect(await auth.options.secondaryStorage?.increment?.("key-a", 60)).toBe(3)
	expect(incrementRateLimitWindowSpy).toHaveBeenCalledWith("key-a", 60_000)
})

// a mail hook responds at once, and a send that throws later is reported instead of left as an unhandled rejection
test("a background auth email that throws is reported by its kind", async () => {
	// the report and the log spied, and a send that fails after the hook has returned
	const reportErrorSpy = quietErrorReports()
	const sendError = new Error("the template failed to render")
	sendAuthEmailInBackground("verification", Promise.reject(sendError))

	// the failure reaches the report once the send settles
	await Bun.sleep(0)
	expect(reportErrorSpy).toHaveBeenCalledWith(sendError, "email", { emailKind: "verification" })
})

// Better Auth skips its origin check under bun test. post Apple's callback with the check on
async function postAppleCallback(origin: string): Promise<Response> {
	spyOn(redisRateLimits, "incrementRateLimitWindow").mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000 })
	const authContext = await auth.$context
	authContext.skipOriginCheck = false

	// post the callback, then put the test setting back
	try {
		return await auth.handler(toPostedAppleCallback(origin))
	} finally {
		authContext.skipOriginCheck = true
	}
}

// Apple's callback as Apple posts it. the post has Apple's origin and a cookie that the domain set with SameSite=None
function toPostedAppleCallback(origin: string): Request {
	// the fields that Apple posts on a first authorization, with the name
	const callbackFields = { code: "code-1", state: "state-1", user: JSON.stringify({ name: { firstName: "Ada" } }) }

	// the form post that a browser sends from Apple's page
	return new Request(`${appUrl()}/api/auth/callback/apple`, {
		method: "POST",
		headers: { origin, cookie: "__cf_bm=1", "content-type": "application/x-www-form-urlencoded" },
		body: new URLSearchParams(callbackFields),
	})
}

// the posted callback passes the origin check and redirects to the app's own callback.
// the browser sends the Lax state cookie there
test("apple's posted callback redirects to the app's own callback with its fields", async () => {
	const response = await postAppleCallback(APPLE_ID_ORIGIN)
	expect(response.status).toBe(302)

	// the redirect keeps the code, the state, and the name that only the first authorization posts
	const location = new URL(response.headers.get("location") ?? "")
	expect(location.origin + location.pathname).toBe(`${appUrl()}/api/auth/callback/apple`)
	expect(location.searchParams.get("state")).toBe("state-1")
	expect(JSON.parse(location.searchParams.get("user") ?? "{}").name.firstName).toBe("Ada")
})

// a posted callback with a cookie from any other origin is rejected
test("a posted callback from another origin is rejected", async () => {
	const response = await postAppleCallback("https://attacker.example")
	expect(response.status).toBe(403)
})

// Apple's origin is trusted for its posted callback alone. a password reset can never redirect to Apple
test("a redirect to apple is never trusted", async () => {
	const authContext = await auth.$context
	expect(authContext.isTrustedOrigin(`${APPLE_ID_ORIGIN}/`)).toBe(false)
})

// without the Apple values, Better Auth registers no Apple provider for the account close to revoke with
test("the apple provider options are undefined while apple is off", async () => {
	expect(await loadAppleProviderOptions()).toBeUndefined()
})

// the environment the trusted origins read, put back after each test
const restoreEnvSettings = saveEnvSettings(["DOPPLER_ENVIRONMENT", "LAN_DEV_URL"])
afterEach(restoreEnvSettings)

// the app's scheme is trusted everywhere, as one host-less pattern that covers the sign-in callbacks
test("the mobile app's scheme is trusted in every environment", async () => {
	Bun.env.DOPPLER_ENVIRONMENT = "prd"
	expect(toTrustedOrigins()).toEqual([MOBILE_APP_SCHEME_ORIGIN])

	// the callback url a sign-in names, and the origin header the app sends, both match the pattern
	const authContext = await auth.$context
	expect(authContext.isTrustedOrigin(`${MOBILE_APP_SCHEME_ORIGIN}/`)).toBe(true)
	expect(authContext.isTrustedOrigin(`${MOBILE_APP_SCHEME_ORIGIN}/settings?cookie=abc`)).toBe(true)
})

// the Expo dev server's scheme and the lan are trusted in dev alone
test("the development origins are trusted in dev alone", () => {
	Bun.env.DOPPLER_ENVIRONMENT = "dev"
	Bun.env.LAN_DEV_URL = "http://192.168.1.5:5173"
	expect(toTrustedOrigins()).toEqual([MOBILE_APP_SCHEME_ORIGIN, "exp://", "http://192.168.*.*:*", "http://10.*.*.*:*"])

	// without the lan url the lan patterns go, and outside dev the Expo scheme goes too
	delete Bun.env.LAN_DEV_URL
	expect(toTrustedOrigins()).toEqual([MOBILE_APP_SCHEME_ORIGIN, "exp://"])
	Bun.env.DOPPLER_ENVIRONMENT = "prd"
	expect(toTrustedOrigins()).not.toContain("exp://")
})

// an app request sends its session cookie with the Expo origin header and no origin. the expo plugin reads the header
// as the origin, which the scheme pattern trusts
test("an app request with a cookie passes the origin check", async () => {
	spyOn(redisRateLimits, "incrementRateLimitWindow").mockResolvedValue({ count: 1, resetAt: Date.now() + 60_000 })
	const authContext = await auth.$context
	authContext.skipOriginCheck = false

	// post a sign-out as the app does, then put the test setting back
	try {
		const response = await auth.handler(
			new Request(`${appUrl()}/api/auth/sign-out`, {
				method: "POST",
				headers: { "expo-origin": MOBILE_APP_SCHEME_ORIGIN, cookie: "better-auth.session_token=abc" },
			}),
		)
		expect(response.status).not.toBe(403)
	} finally {
		authContext.skipOriginCheck = true
	}
})
