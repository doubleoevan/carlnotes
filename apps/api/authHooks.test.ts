// auth hook tests: which login method a request reports, where a request came from, the authorization proxy's hosts,
// the redirects that may open the app, and a user's daily count of email changes
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { DAY_MS } from "@carlnotes/contracts/time"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { appUrl } from "@carlnotes/server/appUrl"
import { auth } from "./auth"
import * as authEmails from "./authEmails"
import {
	DAILY_CHANGE_EMAIL_LIMIT,
	rejectChangeEmailPastDailyLimit,
	rejectSchemeRedirectOutsideSocialSignIn,
	rejectUnknownAuthorizationProxy,
	toEntryPoint,
	toLoginMethod,
} from "./authHooks"

// put the Redis client, the connection pool, and the spies back after each test
afterEach(() => {
	restoreRedisClient()
	restoreConnectionPool()
	mock.restore()
})

// the password form, an oauth callback, and the app's posted ID token each name their method
test("a request's login method is its form, its callback provider, or its ID token's provider", () => {
	expect(toLoginMethod("/sign-in/email", { email: "a@example.com" })).toBe("email")
	expect(toLoginMethod("/callback/google", undefined)).toBe("google")
	expect(toLoginMethod("/sign-in/social", { provider: "apple", idToken: { token: "t" } })).toBe("apple")
})

// a browser's social sign-in starts at /sign-in/social with no ID token, and reports from its callback instead
test("a social sign-in that opens the browser reports nothing until its callback", () => {
	expect(toLoginMethod("/sign-in/social", { provider: "google", callbackURL: "/" })).toBeNull()
	expect(toLoginMethod("/get-session", undefined)).toBeNull()
})

// the Expo origin header marks a request from the mobile app, and so does an ID token, which comes with no header
test("a request with the Expo origin header or an ID token comes from the mobile app", () => {
	expect(toEntryPoint(new Headers({ "expo-origin": "carlnotes://" }), undefined)).toBe("mobile")
	expect(toEntryPoint(new Headers(), { provider: "apple", idToken: { token: "t" } })).toBe("mobile")
	expect(toEntryPoint(new Headers({ origin: "https://carlnotes.com" }), { email: "a@example.com" })).toBe("web")
	expect(toEntryPoint(undefined, undefined)).toBe("web")
})

// the proxy sends a browser to a provider's sign-in page alone, and never a browser that already holds a session
test("the authorization proxy is held to the providers' sign-in pages", () => {
	const googleUrl = "https://accounts.google.com/o/oauth2/v2/auth?state=s"
	const proxyRequest = (authorizationURL: string, cookie?: string): (() => void) => {
		return () =>
			rejectUnknownAuthorizationProxy({
				path: "/expo-authorization-proxy",
				query: { authorizationURL },
				headers: new Headers(cookie ? { cookie } : {}),
			})
	}
	expect(proxyRequest(googleUrl)).not.toThrow()
	expect(proxyRequest("https://evil.example/?state=s")).toThrow("not a provider's sign-in page")
	expect(proxyRequest("not a url")).toThrow("not a provider's sign-in page")
	expect(proxyRequest(googleUrl, "better-auth.session_token=abc")).toThrow("signed-in browser")

	// every other path is left alone
	expect(() =>
		rejectUnknownAuthorizationProxy({ path: "/sign-in/email", query: { authorizationURL: "x" }, headers: undefined }),
	).not.toThrow()
})

// the app's scheme is a redirect for the social sign-in alone. a reset link must never open whichever app claims it
test("a redirect to the app's scheme is rejected outside the social sign-in", () => {
	expect(() =>
		rejectSchemeRedirectOutsideSocialSignIn("/sign-in/social", { callbackURL: "carlnotes:///" }),
	).not.toThrow()
	expect(() =>
		rejectSchemeRedirectOutsideSocialSignIn("/request-password-reset", {
			email: "a@example.com",
			redirectTo: "carlnotes:///",
		}),
	).toThrow("redirectTo may not open the app")
	expect(() =>
		rejectSchemeRedirectOutsideSocialSignIn("/send-verification-email", { callbackURL: "CARLNOTES://x" }),
	).toThrow("callbackURL may not open the app")
	expect(() =>
		rejectSchemeRedirectOutsideSocialSignIn("/request-password-reset", { redirectTo: "/reset-password" }),
	).not.toThrow()

	// a verification link's callback comes in the query, which the hook checks the same way
	expect(() => rejectSchemeRedirectOutsideSocialSignIn("/verify-email", { callbackURL: "carlnotes:///" })).toThrow(
		"callbackURL may not open the app",
	)
})

// each user has a count of their own, which passes the changes up to the daily limit and rejects the next
test("a change of email past the user's daily limit is rejected", async () => {
	stubRedisClient()
	for (let i = 0; i < DAILY_CHANGE_EMAIL_LIMIT; i++) {
		await rejectChangeEmailPastDailyLimit("user-1")
	}
	await expect(rejectChangeEmailPastDailyLimit("user-1")).rejects.toThrow("too many email changes")
	await rejectChangeEmailPastDailyLimit("user-2")
})

// the token of the session that the change-email tests sign in with
const SESSION_TOKEN = "session-token-1"

// the stubbed Redis that stores the session, and whether the session's user has a verified address
type SignInWithStoredSessionOptions = { storedValueByKey: Map<string, string>; isEmailVerified: boolean }

// store a session of a user in the stubbed Redis, and return the cookie that names it as Better Auth signs it
async function signInWithStoredSession({
	storedValueByKey,
	isEmailVerified,
}: SignInWithStoredSessionOptions): Promise<string> {
	// a user and a session a week from its expiry, so no request refreshes it
	const now = new Date()
	const sessionDates = { createdAt: now, updatedAt: now }
	const user = { id: "user-1", email: "current@example.com", emailVerified: isEmailVerified, ...sessionDates }
	const session = { id: "session-1", token: SESSION_TOKEN, userId: user.id, ...sessionDates }
	const expiresAt = new Date(now.getTime() + 7 * DAY_MS)
	storedValueByKey.set(SESSION_TOKEN, JSON.stringify({ session: { ...session, expiresAt }, user }))

	// sign the token with Better Auth's secret, as its session cookie is signed
	const authContext = await auth.$context
	const signature = new Bun.CryptoHasher("sha256", authContext.secret).update(SESSION_TOKEN).digest("base64")
	return `${authContext.authCookies.sessionToken.name}=${encodeURIComponent(`${SESSION_TOKEN}.${signature}`)}`
}

// a change of email to post, with the session's cookie, the new address, and the client address it comes from
type PostChangeEmailOptions = { cookie: string; newEmail: string; clientAddress: string }

// post a change of email to Better Auth as the signed-in user
function postChangeEmail({ cookie, newEmail, clientAddress }: PostChangeEmailOptions): Promise<Response> {
	return auth.handler(
		new Request(`${appUrl()}/api/auth/change-email`, {
			method: "POST",
			headers: { cookie, "content-type": "application/json", "x-forwarded-for": clientAddress },
			body: JSON.stringify({ newEmail }),
		}),
	)
}

// one change by a verified user is accepted, and its confirmation link goes to the current address
test("a signed-in user's one change of email is accepted and its link is sent", async () => {
	// a signed-in user with a verified address, and no account at the new address
	const cookie = await signInWithStoredSession({ storedValueByKey: stubRedisClient(), isEmailVerified: true })
	stubConnectionPool()
	const sendChangeEmailConfirmationEmailSpy = spyOn(authEmails, "sendChangeEmailConfirmationEmail").mockResolvedValue()

	// the request passes, and the confirmation is sent to the current address about the new one
	const response = await postChangeEmail({ cookie, newEmail: "new@example.com", clientAddress: "203.0.113.1" })
	expect(response.status).toBe(200)
	expect(sendChangeEmailConfirmationEmailSpy).toHaveBeenCalledTimes(1)
	const [currentEmail, newEmail] = sendChangeEmailConfirmationEmailSpy.mock.calls[0] ?? []
	expect([currentEmail, newEmail]).toEqual(["current@example.com", "new@example.com"])
})

// an unverified account's change mails a verification link to whatever address it names. the count is the user's
// own, so sending each request from another client address does not get past it
test("an unverified account's changes past its daily limit are rejected from any address and send nothing", async () => {
	// a signed-in user with an unverified address, and no account at any new address
	const cookie = await signInWithStoredSession({ storedValueByKey: stubRedisClient(), isEmailVerified: false })
	const sentQueries = stubConnectionPool()
	const sendVerificationEmailSpy = spyOn(authEmails, "sendVerificationEmail").mockResolvedValue()

	// each change up to the limit, from a client address of its own, mails its new address a verification link
	for (let i = 0; i < DAILY_CHANGE_EMAIL_LIMIT; i++) {
		const newEmail = `stranger${i}@example.com`
		const response = await postChangeEmail({ cookie, newEmail, clientAddress: `203.0.113.${i + 1}` })
		expect(response.status).toBe(200)
		expect(sendVerificationEmailSpy.mock.calls.at(-1)?.[0]).toBe(newEmail)
	}
	expect(sendVerificationEmailSpy).toHaveBeenCalledTimes(DAILY_CHANGE_EMAIL_LIMIT)
	const acceptedQueryCount = sentQueries.length

	// the next change, from one more client address, is rejected before Better Auth reads the database or sends mail
	const rejectedResponse = await postChangeEmail({
		cookie,
		newEmail: "one-more-stranger@example.com",
		clientAddress: "203.0.113.200",
	})
	expect(rejectedResponse.status).toBe(429)
	expect(((await rejectedResponse.json()) as { message: string }).message).toContain("too many email changes")
	expect(sendVerificationEmailSpy).toHaveBeenCalledTimes(DAILY_CHANGE_EMAIL_LIMIT)
	expect(sentQueries).toHaveLength(acceptedQueryCount)
})

// a request with no session is not counted, and Better Auth's endpoint rejects it
test("a change of email with no session is left to Better Auth, which rejects it", async () => {
	const storedValueByKey = stubRedisClient()
	stubConnectionPool()
	const response = await postChangeEmail({ cookie: "", newEmail: "new@example.com", clientAddress: "203.0.113.1" })
	expect(response.status).toBe(401)
	expect([...storedValueByKey.keys()].some((key) => key.startsWith("change-email:"))).toBe(false)
})
