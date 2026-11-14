// auth email tests: each auth email goes out as an account email of its kind, and a mail hook returns while its email
// waits for another attempt
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as redisRateLimits from "@carlnotes/db/redisRateLimits"
import * as emails from "@carlnotes/emails/email"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { auth } from "./auth"
import { sendChangeEmailConfirmationEmail, sendResetPasswordEmail, sendVerificationEmail } from "./authEmails"

// the real fetch and env to put back after each test
const realFetch = globalThis.fetch
const restoreEnvSettings = saveEnvSettings(["RESEND_API_KEY", "RESEND_FROM_EMAIL"])

// put the fetch, the env, and the spies back
afterEach(() => {
	globalThis.fetch = realFetch
	restoreEnvSettings()
	mock.restore()
})

// the verification and the reset go to the address they are about, and the change of address to the current address
test("each auth email is sent as an account email of its kind", async () => {
	const sendAccountEmailSpy = spyOn(emails, "sendAccountEmail").mockResolvedValue(true)
	await sendVerificationEmail("new@example.com", "https://carlnotes.test/verify")
	await sendResetPasswordEmail("user@example.com", "https://carlnotes.test/reset")
	await sendChangeEmailConfirmationEmail("current@example.com", "new@example.com", "https://carlnotes.test/confirm")
	const sentAccountEmails = sendAccountEmailSpy.mock.calls.map(([message]) => [message.emailKind, message.to])
	expect(sentAccountEmails).toEqual([
		["verification", "new@example.com"],
		["password-reset", "user@example.com"],
		["email-change", "current@example.com"],
	])
})

// a signup responds once the mail hook returns, and the hook never waits for an email that Resend rate limited
test("the verification mail hook returns while its email waits for another attempt", async () => {
	// a configured sender with its slot free, and a quiet log
	Bun.env.RESEND_API_KEY = "test-key"
	Bun.env.RESEND_FROM_EMAIL = "carl@example.com"
	spyOn(redisRateLimits, "takeRateLimitSlot").mockResolvedValue(0)
	spyOn(console, "error").mockImplementation(() => {})

	// a Resend that rate limits every call for three seconds
	const rateLimitResponseInit = { status: 429, headers: { "retry-after": "3" } }
	let resendCallCount = 0
	globalThis.fetch = (async () => {
		resendCallCount++
		return new Response(JSON.stringify({ name: "rate_limit_exceeded" }), rateLimitResponseInit)
	}) as unknown as typeof fetch

	// the wait Resend named never ends, so the email stays waiting for its second attempt
	const retryWait = Promise.withResolvers<void>()
	const sleepSpy = spyOn(Bun, "sleep").mockImplementation(() => {
		retryWait.resolve()
		return new Promise<void>(() => {})
	})

	// the hook returns, though its email can never finish
	const verificationEmail = { user: { email: "new@example.com" }, url: "https://carlnotes.test/verify", token: "token" }
	await auth.options.emailVerification?.sendVerificationEmail?.(verificationEmail as never)

	// the email's one call drew the rate limit, and the email is waiting out the three seconds
	await retryWait.promise
	expect(sleepSpy.mock.calls).toEqual([[3000]])
	expect(resendCallCount).toBe(1)
})
