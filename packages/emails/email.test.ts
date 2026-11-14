// email tests: Resend's error name, what a scan email call makes of each Resend response, an account email's attempts
// under one idempotency key, the wait for each limit's slot, and the reports for missing configuration and dropped
// addresses
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as redisRateLimits from "@carlnotes/db/redisRateLimits"
import * as monitoring from "@carlnotes/server/monitoring"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import {
	type EmailMessage,
	isSendableAddress,
	type ResendCallResult,
	reportDroppedAddresses,
	sendAccountEmail,
	sendEmail,
	sendScanEmailCall,
	toResendErrorName,
} from "./email"

test("toResendErrorName reads the error name and handles a body it cannot parse", () => {
	expect(toResendErrorName('{"statusCode":422,"name":"validation_error","message":"..."}')).toBe("validation_error")
	expect(toResendErrorName('{"statusCode":500}')).toBe("an unnamed error")
	expect(toResendErrorName("<html>502 Bad Gateway</html>")).toBe("an unparsed error")
	expect(toResendErrorName("")).toBe("an unparsed error")
})

// a message factory for the tests, numbered so that each recipient is different
function toTestMessage(index: number): EmailMessage {
	return { to: `user${index}@example.com`, subject: "s", emailContent: "<p>hi</p>", emailKind: "topic-scan" }
}

// the real fetch and env to put back after each test
const realFetch = globalThis.fetch
const restoreEnvSettings = saveEnvSettings(["RESEND_API_KEY", "RESEND_FROM_EMAIL", "RESEND_REPLY_EMAIL"])

// give every call the rate limit slot at once so that no test reaches Redis
let takeRateLimitSlotSpy: ReturnType<typeof spyOn<typeof redisRateLimits, "takeRateLimitSlot">>
beforeEach(() => {
	takeRateLimitSlotSpy = spyOn(redisRateLimits, "takeRateLimitSlot").mockResolvedValue(0)
})

// put the real fetch, env, and report back after each test, so that nothing leaks into other tests
afterEach(() => {
	globalThis.fetch = realFetch
	restoreEnvSettings()
	mock.restore()
})

// a sender with a key and a verified from-address
function configureResend(): void {
	Bun.env.RESEND_API_KEY = "test-key"
	Bun.env.RESEND_FROM_EMAIL = "carl@example.com"
}

test("topic scan emails and other Carl emails reply to the shared receiving mailbox", async () => {
	// exercise the shared body builder through each of the three senders
	configureResend()
	Bun.env.RESEND_FROM_EMAIL = "Carl Notes <carl@example.com>"
	Bun.env.RESEND_REPLY_EMAIL = "support@example.com"

	// a Resend that records each body it is sent
	const bodies: Record<string, unknown>[] = []
	globalThis.fetch = (async (_url, init) => {
		const body = JSON.parse(String(init?.body))
		bodies.push(...(Array.isArray(body) ? body : [body]))
		return Response.json({ id: "fixture", data: [] })
	}) as typeof fetch

	// one scan email, then one email of each other sender
	await sendScanEmailCall({ scanId: "scan-1", messages: [toTestMessage(1)] })
	await sendEmail({ ...toTestMessage(2), emailKind: "manual-scan" })
	await sendAccountEmail({ ...toTestMessage(3), emailKind: "verification" })
	expect(bodies.map((body) => body.reply_to)).toEqual(["carl@example.com", "carl@example.com", "carl@example.com"])
})

// the url, the headers, and the body that a stubbed Resend call received
type SentResendCall = { url: string; headers: Record<string, string>; body: string }

// stub fetch to record each call and respond with a fresh response from the factory. a factory that throws an error
// fails the call as a lost connection does
function stubResend(toResponse: () => Response): SentResendCall[] {
	const sentResendCalls: SentResendCall[] = []
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		// record the call, then respond
		const headers = init?.headers as Record<string, string>
		sentResendCalls.push({ url: String(url), headers, body: String(init?.body) })
		return toResponse()
	}) as typeof fetch
	return sentResendCalls
}

// the reports sent to Sentry, stubbed so that nothing is sent
function spyOnReports(): ReturnType<typeof spyOn<typeof monitoring, "reportError">> {
	return spyOn(monitoring, "reportError").mockImplementation(() => {})
}

// resend rejects a whole batch over one address it will not take, and a report names how many were dropped and never
// the addresses themselves
test("an unsendable address is told apart, and a dropped one is reported by count and never by address", () => {
	expect(isSendableAddress("user1@example.com")).toBe(true)
	expect(isSendableAddress("not-an-address")).toBe(false)

	// the report names the kind and the count alone
	const reportErrorSpy = spyOnReports()
	reportDroppedAddresses("topic-scan", 1)
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "email", {
		emailKind: "topic-scan",
		droppedCount: "1",
	})
})

// every send path reports a missing key or from-address, so mail that never goes out reaches Sentry
test("a send without configuration is reported by every send path", async () => {
	const reportErrorSpy = spyOnReports()
	delete Bun.env.RESEND_API_KEY

	// the single sender and the scan email call each report once, and the scan call is rejected for good
	expect(await sendEmail({ ...toTestMessage(1), emailKind: "notifications" })).toBe(false)
	const scanEmailCallResult = await sendScanEmailCall({ scanId: "scan-1", messages: [toTestMessage(1)] })
	expect(scanEmailCallResult).toEqual({
		outcome: "rejected",
		failure: { httpStatus: null, resendError: "missing configuration" },
	})
	expect(reportErrorSpy).toHaveBeenCalledTimes(2)
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "email", { emailKind: "notifications" })
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "email", { emailKind: "topic-scan" })

	// an account email reports the missing configuration by its kind and makes no second attempt
	const sleepSpy = spyOn(Bun, "sleep").mockResolvedValue(undefined)
	expect(await sendAccountEmail({ ...toTestMessage(1), emailKind: "verification" })).toBe(false)
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "email", { emailKind: "verification" })
	expect(sleepSpy).not.toHaveBeenCalled()
})

// one message posts to the single endpoint and a batch to the batch endpoint, each under a key for its exact body
test("a scan email call keys each body and picks its endpoint by the message count", async () => {
	configureResend()
	const sentResendCalls = stubResend(() => new Response("{}", { status: 200 }))

	// the same single message twice, with a batch between them
	expect(await sendScanEmailCall({ scanId: "scan-1", messages: [toTestMessage(1)] })).toEqual({ outcome: "accepted" })
	await sendScanEmailCall({ scanId: "scan-1", messages: [toTestMessage(1), toTestMessage(2)] })
	await sendScanEmailCall({ scanId: "scan-1", messages: [toTestMessage(1)] })

	// the batch goes to the batch endpoint, and only the repeated body repeats its key
	expect(sentResendCalls.map((sentResendCall) => sentResendCall.url)).toEqual([
		"https://api.resend.com/emails",
		"https://api.resend.com/emails/batch",
		"https://api.resend.com/emails",
	])
	const [singleIdempotencyKey, batchIdempotencyKey, repeatedIdempotencyKey] = sentResendCalls.map(
		(sentResendCall) => sentResendCall.headers["Idempotency-Key"],
	)
	expect(singleIdempotencyKey).toStartWith("topic-scan/scan-1/")
	expect(repeatedIdempotencyKey).toBe(singleIdempotencyKey)
	expect(batchIdempotencyKey).not.toBe(singleIdempotencyKey)
})

// each Resend response and what a scan email call makes of it, following the design's table
const RESEND_RESPONSE_CASES: {
	label: string
	toResponse: () => Response
	expectedResendCallResult: ResendCallResult
}[] = [
	{
		label: "a rate limit is retried after its retry-after",
		toResponse: () =>
			new Response(JSON.stringify({ name: "rate_limit_exceeded" }), { status: 429, headers: { "retry-after": "3" } }),
		expectedResendCallResult: {
			outcome: "retryable",
			failure: { httpStatus: 429, resendError: "rate_limit_exceeded" },
			retryAfterSeconds: 3,
		},
	},
	{
		label: "a spent monthly quota is rejected",
		toResponse: () => new Response(JSON.stringify({ name: "monthly_quota_exceeded" }), { status: 429 }),
		expectedResendCallResult: {
			outcome: "rejected",
			failure: { httpStatus: 429, resendError: "monthly_quota_exceeded" },
		},
	},
	{
		label: "a busy idempotency key is retried on the backoff",
		toResponse: () => new Response(JSON.stringify({ name: "concurrent_idempotent_requests" }), { status: 409 }),
		expectedResendCallResult: {
			outcome: "retryable",
			failure: { httpStatus: 409, resendError: "concurrent_idempotent_requests" },
			retryAfterSeconds: null,
		},
	},
	{
		label: "a key reused with another body is rejected",
		toResponse: () => new Response(JSON.stringify({ name: "invalid_idempotent_request" }), { status: 409 }),
		expectedResendCallResult: {
			outcome: "rejected",
			failure: { httpStatus: 409, resendError: "invalid_idempotent_request" },
		},
	},
	{
		label: "a 5xx is retried on the backoff",
		toResponse: () => new Response(JSON.stringify({ name: "service_unavailable" }), { status: 503 }),
		expectedResendCallResult: {
			outcome: "retryable",
			failure: { httpStatus: 503, resendError: "service_unavailable" },
			retryAfterSeconds: null,
		},
	},
	{
		label: "a validation error is rejected",
		toResponse: () => new Response(JSON.stringify({ name: "validation_error" }), { status: 400 }),
		expectedResendCallResult: { outcome: "rejected", failure: { httpStatus: 400, resendError: "validation_error" } },
	},
]

// one test per row of the table
for (const { label, toResponse, expectedResendCallResult } of RESEND_RESPONSE_CASES) {
	test(`a scan email call: ${label}`, async () => {
		configureResend()
		stubResend(toResponse)
		expect(await sendScanEmailCall({ scanId: "scan-1", messages: [toTestMessage(1)] })).toEqual(
			expectedResendCallResult,
		)
	})
}

// a call waits while another call holds the rate limit slot, and goes ahead without it if Redis cannot be reached
test("a scan email call waits for the rate limit slot and goes ahead if Redis cannot be reached", async () => {
	configureResend()
	const sentResendCalls = stubResend(() => new Response("{}", { status: 200 }))

	// a held slot returns a short wait, and the take after the wait gets the slot
	takeRateLimitSlotSpy.mockResolvedValueOnce(5).mockResolvedValueOnce(0)
	await sendScanEmailCall({ scanId: "scan-1", messages: [toTestMessage(1)] })
	expect(takeRateLimitSlotSpy).toHaveBeenCalledTimes(2)
	expect(sentResendCalls).toHaveLength(1)

	// a take that cannot reach Redis lets the call go ahead
	takeRateLimitSlotSpy.mockResolvedValueOnce(null)
	expect(await sendScanEmailCall({ scanId: "scan-1", messages: [toTestMessage(1)] })).toEqual({ outcome: "accepted" })
	expect(takeRateLimitSlotSpy).toHaveBeenCalledTimes(3)
	expect(sentResendCalls).toHaveLength(2)
})

// a call that never reaches Resend is worth another attempt
test("a scan email call that cannot reach Resend is retried on the backoff", async () => {
	configureResend()
	globalThis.fetch = (async () => {
		throw new Error("connection refused")
	}) as unknown as typeof fetch
	expect(await sendScanEmailCall({ scanId: "scan-1", messages: [toTestMessage(1)] })).toEqual({
		outcome: "retryable",
		failure: { httpStatus: null, resendError: "network failure" },
		retryAfterSeconds: null,
	})
})

// a wait that would pass the deadline goes ahead without the slot, so a backlog never holds a send for good
test("a scan email call goes ahead without the slot once the wait would pass the deadline", async () => {
	configureResend()
	const sentResendCalls = stubResend(() => new Response("{}", { status: 200 }))

	// a slot held for a minute is not waited for
	takeRateLimitSlotSpy.mockResolvedValueOnce(60_000)
	expect(await sendScanEmailCall({ scanId: "scan-1", messages: [toTestMessage(1)] })).toEqual({ outcome: "accepted" })
	expect(takeRateLimitSlotSpy).toHaveBeenCalledTimes(1)
	expect(sentResendCalls).toHaveLength(1)
})

// stub Resend to fail its first call with the factory's response or error, and to accept every later call
function stubResendFailingOnce(toFailure: () => Response): SentResendCall[] {
	let isFirstCall = true
	return stubResend(() => {
		// only the first call gets the failure
		const isFailing = isFirstCall
		isFirstCall = false
		return isFailing ? toFailure() : new Response("{}", { status: 200 })
	})
}

// a rate limited account email goes out again after the wait Resend named, as the same request
test("an account email that draws a 429 is sent again after Resend's wait under the same idempotency key", async () => {
	configureResend()
	const sleepSpy = spyOn(Bun, "sleep").mockResolvedValue(undefined)
	const sentResendCalls = stubResendFailingOnce(
		() =>
			new Response(JSON.stringify({ name: "rate_limit_exceeded" }), { status: 429, headers: { "retry-after": "3" } }),
	)

	// the second call leaves after the three seconds, with the key and the body of the first
	expect(await sendAccountEmail({ ...toTestMessage(1), emailKind: "verification" })).toBe(true)
	expect(sleepSpy.mock.calls).toEqual([[3000]])
	expect(sentResendCalls).toHaveLength(2)
	expect(sentResendCalls[1]).toEqual(sentResendCalls[0])
	expect(sentResendCalls[0]?.headers["Idempotency-Key"]).toStartWith("verification/")

	// another send of the same email has a key of its own, so Resend sends it
	await sendAccountEmail({ ...toTestMessage(1), emailKind: "verification" })
	expect(sentResendCalls[2]?.headers["Idempotency-Key"]).not.toBe(sentResendCalls[0]?.headers["Idempotency-Key"])
})

// a call whose response was lost goes out again as the same request, for which Resend returns its first result
test("an account email whose response was lost is sent again under the same idempotency key", async () => {
	configureResend()
	const sleepSpy = spyOn(Bun, "sleep").mockResolvedValue(undefined)
	const sentResendCalls = stubResendFailingOnce(() => {
		throw new Error("connection reset")
	})

	// the second call leaves after the first backoff wait, with the key and the body of the first
	expect(await sendAccountEmail({ ...toTestMessage(1), emailKind: "password-reset" })).toBe(true)
	expect(sleepSpy.mock.calls).toEqual([[5000]])
	expect(sentResendCalls).toHaveLength(2)
	expect(sentResendCalls[1]).toEqual(sentResendCalls[0])
	expect(sentResendCalls[0]?.headers["Idempotency-Key"]).toStartWith("password-reset/")
})

// no attempt within the day can fix a spent quota, so the invitation is reported and not sent again
test("an account email rejected for a spent daily quota is reported by its kind and not sent again", async () => {
	configureResend()
	const reportErrorSpy = spyOnReports()
	const sleepSpy = spyOn(Bun, "sleep").mockResolvedValue(undefined)
	const sentResendCalls = stubResend(
		() => new Response(JSON.stringify({ name: "daily_quota_exceeded" }), { status: 429 }),
	)

	// one call, no wait, and one report that names the kind and what Resend said
	expect(await sendAccountEmail({ ...toTestMessage(1), emailKind: "topic-invite" })).toBe(false)
	expect(sentResendCalls).toHaveLength(1)
	expect(sleepSpy).not.toHaveBeenCalled()
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "email", {
		emailKind: "topic-invite",
		status: "429",
		resendError: "daily_quota_exceeded",
	})
})

// an email that Resend never accepts stops after its last attempt and is reported once
test("an account email that fails every attempt is reported by its kind", async () => {
	configureResend()
	const reportErrorSpy = spyOnReports()
	const sleepSpy = spyOn(Bun, "sleep").mockResolvedValue(undefined)
	const sentResendCalls = stubResend(
		() => new Response(JSON.stringify({ name: "service_unavailable" }), { status: 503 }),
	)

	// six calls under one key, with a wait that doubles between them
	expect(await sendAccountEmail({ ...toTestMessage(1), emailKind: "team-invite" })).toBe(false)
	const idempotencyKeys = sentResendCalls.map((sentResendCall) => sentResendCall.headers["Idempotency-Key"])
	expect(idempotencyKeys).toHaveLength(6)
	expect(new Set(idempotencyKeys).size).toBe(1)
	expect(sleepSpy.mock.calls).toEqual([[5000], [10_000], [20_000], [40_000], [80_000]])

	// one report, with what Resend said to the last attempt
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "email", {
		emailKind: "team-invite",
		status: "503",
		resendError: "service_unavailable",
	})
})

// the Redis key of the account emails' slot and of the shared slot
const ACCOUNT_EMAIL_SLOT_KEY = "rate-limit:resend-account-emails"
const RESEND_SLOT_KEY = "rate-limit:resend-calls"

// an account email counts against the account emails' own limit, and every other email against the shared limit
test("an account email takes the account emails' slot, and every other email the shared slot", async () => {
	configureResend()
	stubResend(() => new Response("{}", { status: 200 }))

	// one account email, one scan email, and one notifications email
	await sendAccountEmail({ ...toTestMessage(1), emailKind: "verification" })
	await sendScanEmailCall({ scanId: "scan-1", messages: [toTestMessage(1)] })
	await sendEmail({ ...toTestMessage(1), emailKind: "notifications" })
	const takenSlotKeys = takeRateLimitSlotSpy.mock.calls.map(([rateLimitSlot]) => rateLimitSlot.key)
	expect(takenSlotKeys).toEqual([ACCOUNT_EMAIL_SLOT_KEY, RESEND_SLOT_KEY, RESEND_SLOT_KEY])
})

// a bulk send that holds the shared limit's slot does not hold up an account email
test("an account email does not wait while another call holds the shared slot", async () => {
	configureResend()
	stubResend(() => new Response("{}", { status: 200 }))

	// the shared slot is held until a call has waited for it, and the account emails' slot is free
	let isSharedSlotUnchecked = true
	takeRateLimitSlotSpy.mockImplementation(async ({ key }) => (key === RESEND_SLOT_KEY && isSharedSlotUnchecked ? 5 : 0))
	const sleepSpy = spyOn(Bun, "sleep").mockImplementation(async () => {
		isSharedSlotUnchecked = false
	})

	// the verification email leaves without a wait, and a notifications email waits for the shared slot
	expect(await sendAccountEmail({ ...toTestMessage(1), emailKind: "verification" })).toBe(true)
	expect(sleepSpy).not.toHaveBeenCalled()
	await sendEmail({ ...toTestMessage(1), emailKind: "notifications" })
	expect(sleepSpy).toHaveBeenCalledTimes(1)
})
