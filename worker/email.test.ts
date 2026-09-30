// email tests: Resend's error name, the batch sender's chunks, what a scan email call makes of each Resend response,
// the wait for the rate limit slot, and the reports for missing configuration and dropped addresses
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as monitoring from "@shared/monitoring"
import * as redis from "../db/redis"
import {
	type EmailMessage,
	type ResendCallResult,
	sendEmailBatches,
	sendScanEmailCall,
	toResendErrorName,
} from "./email"

test("toResendErrorName reads the error name and handles a body it cannot parse", () => {
	expect(toResendErrorName('{"statusCode":422,"name":"validation_error","message":"..."}')).toBe("validation_error")
	expect(toResendErrorName('{"statusCode":500}')).toBe("an unnamed error")
	expect(toResendErrorName("<html>502 Bad Gateway</html>")).toBe("an unparsed error")
	expect(toResendErrorName("")).toBe("an unparsed error")
})

// a message factory for the batch tests, numbered so that each recipient is different
function toTestMessage(index: number): EmailMessage {
	return { to: `user${index}@example.com`, subject: "s", emailContent: "<p>hi</p>", emailKind: "topic-scan" }
}

// the real fetch and env to put back after each test
const realFetch = globalThis.fetch
const realApiKey = Bun.env.RESEND_API_KEY
const realFromEmail = Bun.env.RESEND_FROM_EMAIL

// give every call the rate limit slot at once so that no test reaches Redis
let takeRateLimitSlotSpy: ReturnType<typeof spyOn<typeof redis, "takeRateLimitSlot">>
beforeEach(() => {
	takeRateLimitSlotSpy = spyOn(redis, "takeRateLimitSlot").mockResolvedValue(0)
})

// put the real fetch, env, and report back after each test, so that nothing leaks into other tests
afterEach(() => {
	globalThis.fetch = realFetch
	restoreEnv("RESEND_API_KEY", realApiKey)
	restoreEnv("RESEND_FROM_EMAIL", realFromEmail)
	mock.restore()
})

// put an env value back, removing it if it was unset. assigning undefined would store the text "undefined"
function restoreEnv(name: string, value: string | undefined): void {
	if (value === undefined) {
		delete Bun.env[name]
		return
	}
	Bun.env[name] = value
}

// a sender with a key and a verified from-address
function configureResend(): void {
	Bun.env.RESEND_API_KEY = "test-key"
	Bun.env.RESEND_FROM_EMAIL = "carl@example.com"
}

// the url and the headers that a stubbed Resend call received
type SentResendCall = { url: string; headers: Record<string, string> }

// stub fetch to record each call and respond with a fresh response from the factory
function stubResend(toResponse: () => Response): SentResendCall[] {
	const sentResendCalls: SentResendCall[] = []
	globalThis.fetch = (async (url: RequestInfo | URL, init?: RequestInit) => {
		sentResendCalls.push({ url: String(url), headers: init?.headers as Record<string, string> })
		return toResponse()
	}) as typeof fetch
	return sentResendCalls
}

// the reports sent to Sentry, stubbed so that nothing is sent
function spyOnReports(): ReturnType<typeof spyOn<typeof monitoring, "reportError">> {
	return spyOn(monitoring, "reportError").mockImplementation(() => {})
}

test("sendEmailBatch returns nothing for no messages and all false without config", async () => {
	// an empty batch makes no call and needs no config
	expect(await sendEmailBatches([])).toEqual([])

	// without an api key and from-address, every message reports not accepted
	spyOnReports()
	delete Bun.env.RESEND_API_KEY
	delete Bun.env.RESEND_FROM_EMAIL
	expect(await sendEmailBatches([toTestMessage(1), toTestMessage(2)])).toEqual([false, false])
})

test("sendEmailBatch chunks at 100 per call and flags every message accepted", async () => {
	// a configured sender whose fetch records each batch call's payload size
	configureResend()
	const batchSizes: number[] = []
	globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
		batchSizes.push((JSON.parse(String(init?.body)) as unknown[]).length)
		return new Response(JSON.stringify({ data: [] }), { status: 200 })
	}) as typeof fetch

	// 205 messages split into calls of 100, 100, and 5, each message flagged accepted
	const messages = Array.from({ length: 205 }, (_, index) => toTestMessage(index))
	const accepted = await sendEmailBatches(messages)
	expect(batchSizes).toEqual([100, 100, 5])
	expect(accepted).toHaveLength(205)
	expect(accepted.every(Boolean)).toBe(true)
})

// resend rejects a whole batch over one address it will not take, so an unsendable one is held back
test("an unsendable address is held back instead of failing the batch", async () => {
	configureResend()
	spyOnReports()
	const sentAddresses: string[] = []
	globalThis.fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
		// record every address resend was actually posted, which is what this test asserts on
		const body = JSON.parse(String(init?.body)) as { to: string }[]
		sentAddresses.push(...body.map((email) => email.to))
		return new Response(JSON.stringify({ data: body.map(() => ({ id: "x" })) }), { status: 200 })
	}) as typeof fetch

	// the bad address never reaches resend, and its own flag is false while the others are true
	const messages = [toTestMessage(1), { ...toTestMessage(2), to: "not-an-address" }, toTestMessage(3)]
	const accepted = await sendEmailBatches(messages)
	expect(sentAddresses).toEqual(["user1@example.com", "user3@example.com"])
	expect(accepted).toEqual([true, false, true])
})

// a report names how many addresses were dropped and never the addresses themselves
test("a dropped address is reported by count and never by address", async () => {
	configureResend()
	const reportErrorSpy = spyOnReports()
	stubResend(() => new Response(JSON.stringify({ data: [{ id: "x" }] }), { status: 200 }))

	await sendEmailBatches([toTestMessage(1), { ...toTestMessage(2), to: "not-an-address" }])
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "email", {
		emailKind: "topic-scan",
		droppedCount: "1",
	})
})

// every send path reports a missing key or from-address, so mail that never goes out reaches Sentry
test("a send without configuration is reported by every send path", async () => {
	const reportErrorSpy = spyOnReports()
	delete Bun.env.RESEND_API_KEY

	// the batch sender and the scan email call each report once, and the scan call is rejected for good
	await sendEmailBatches([toTestMessage(1)])
	const scanEmailCallResult = await sendScanEmailCall({ scanId: "scan-1", messages: [toTestMessage(1)] })
	expect(scanEmailCallResult).toEqual({
		outcome: "rejected",
		failure: { httpStatus: null, resendError: "missing configuration" },
	})
	expect(reportErrorSpy).toHaveBeenCalledTimes(2)
	expect(reportErrorSpy).toHaveBeenCalledWith(expect.any(Error), "email", { emailKind: "topic-scan" })
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
		failure: { httpStatus: null, resendError: "connection refused" },
		retryAfterSeconds: null,
	})
})
