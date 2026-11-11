// model call runner tests: which failures try again, how long each wait is, and the limits that end a call
import { afterEach, beforeEach, expect, type Mock, spyOn, test } from "bun:test"
import { APICallError, NoObjectGeneratedError } from "ai"
import { isRetryableModelCallError, runModelCall, toModelCallBackoffMs, toRetryAfterWaitMs } from "./modelCallRetry"

// the fake clock's start, and the waits the runner asked to sleep
const CLOCK_START_MS = 1_700_000_000_000
let nowMs = CLOCK_START_MS
let sleptMs: number[] = []
let warnSpy: Mock<typeof console.warn>

// a fake clock that each sleep moves forward, and a quiet log
beforeEach(() => {
	nowMs = CLOCK_START_MS
	sleptMs = []
	spyOn(Date, "now").mockImplementation(() => nowMs)

	// each sleep records its wait and moves the clock instead of waiting
	spyOn(Bun, "sleep").mockImplementation(async (delay) => {
		const delayMs = typeof delay === "number" ? delay : delay.getTime() - nowMs
		sleptMs.push(delayMs)
		nowMs += delayMs
	})

	// the jitter sits at its top, and the retry log is kept quiet
	spyOn(Math, "random").mockReturnValue(1)
	warnSpy = spyOn(console, "warn").mockImplementation(() => {})
})

// put the real clock, sleep, random, and log back
afterEach(() => {
	;(Date.now as Mock<typeof Date.now>).mockRestore()
	;(Bun.sleep as Mock<typeof Bun.sleep>).mockRestore()
	;(Math.random as Mock<typeof Math.random>).mockRestore()
	warnSpy.mockRestore()
})

// a failed proxy response with its status, headers, and body
function toApiCallError(
	statusCode: number,
	responseHeaders: Record<string, string> = {},
	responseBody = "",
): APICallError {
	return new APICallError({
		message: `status ${statusCode}`,
		url: "http://litellm.test/v1/chat/completions",
		requestBodyValues: {},
		statusCode,
		responseHeaders,
		responseBody,
	})
}

// an attempt that throws the given failures in order, then returns the attempt count that succeeded
function failThenSucceed(failures: unknown[]): { runAttempt: () => Promise<number>; attemptCount: () => number } {
	let attemptCount = 0
	return {
		// each attempt throws its own failure, until the failures run out
		runAttempt: async () => {
			attemptCount++
			const failure = failures[attemptCount - 1]
			if (failure) {
				throw failure
			}
			return attemptCount
		},
		attemptCount: () => attemptCount,
	}
}

test("a rate limit followed by a success returns the second attempt's result", async () => {
	// one 429 with no wait named, then a success
	const attempts = failThenSucceed([toApiCallError(429)])
	const result = await runModelCall({ runAttempt: attempts.runAttempt, waitDeadlineAt: null, label: "scoringCheap" })
	expect(result).toBe(2)
	expect(sleptMs).toEqual([4000])
	expect(warnSpy).toHaveBeenCalledTimes(1)
})

test("a rate limit that outlasts the waits throws the last attempt's error after five attempts", async () => {
	// every attempt is rate limited, and the backoff waits sum to 58 seconds at the top of the jitter
	const lastError = toApiCallError(429, {}, "still limited")
	const attempts = failThenSucceed([
		toApiCallError(429),
		toApiCallError(429),
		toApiCallError(429),
		toApiCallError(429),
		lastError,
	])
	const run = runModelCall({ runAttempt: attempts.runAttempt, waitDeadlineAt: null, label: "scoringPremium" })
	await expect(run).rejects.toBe(lastError)
	expect(attempts.attemptCount()).toBe(5)
	expect(sleptMs).toEqual([4000, 8000, 16_000, 30_000])
})

test("a rejected request fails at once", async () => {
	const attempts = failThenSucceed([toApiCallError(400, {}, "bad request")])
	const run = runModelCall({ runAttempt: attempts.runAttempt, waitDeadlineAt: null, label: "scoringCheap" })
	await expect(run).rejects.toThrow("status 400")
	expect(attempts.attemptCount()).toBe(1)
	expect(sleptMs).toEqual([])
})

test("a spent budget fails at once, on a 429 and on a 400", async () => {
	// LiteLLM names a spent budget in the body on either status
	for (const statusCode of [429, 400]) {
		const attempts = failThenSucceed([toApiCallError(statusCode, {}, '{"error":{"type":"budget_exceeded"}}')])
		const run = runModelCall({ runAttempt: attempts.runAttempt, waitDeadlineAt: null, label: "scan-report" })
		await expect(run).rejects.toThrow(`status ${statusCode}`)
		expect(attempts.attemptCount()).toBe(1)
	}
	expect(sleptMs).toEqual([])
})

test("a proxy timeout, a 5xx, and a thrown timeout are worth another attempt", () => {
	// a 408 and a 503 from the proxy, and a timeout that never reached a response
	const timeoutError = new DOMException("timed out", "TimeoutError")
	expect(isRetryableModelCallError(toApiCallError(408))).toBe(true)
	expect(isRetryableModelCallError(toApiCallError(503))).toBe(true)
	expect(isRetryableModelCallError(timeoutError)).toBe(true)
	expect(isRetryableModelCallError(new Error("some bug"))).toBe(false)
})

test("a connection that dropped after a 200 follows the SDK's own judgment", () => {
	// the SDK marks a dropped body retryable and keeps the 200 status
	const droppedBodyError = new APICallError({
		message: "network error",
		url: "http://litellm.test/v1/chat/completions",
		requestBodyValues: {},
		statusCode: 200,
		isRetryable: true,
	})
	expect(isRetryableModelCallError(droppedBodyError)).toBe(true)
})

test("a model output that fails its schema fails at once", () => {
	const noObjectError = new NoObjectGeneratedError({
		message: "no object",
		text: "{}",
		response: { id: "response", timestamp: new Date(), modelId: "cheap-model" },
		usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } as never,
		finishReason: "stop",
	})
	expect(isRetryableModelCallError(noObjectError)).toBe(false)
})

test("a wrapped rate limit is still found in the error chain", () => {
	const wrappedError = new Error("scoring failed", { cause: toApiCallError(429) })
	expect(isRetryableModelCallError(wrappedError)).toBe(true)
})

test("each retry-after header form names the wait", async () => {
	// the four forms, each with its own wait, and an http date three seconds out
	const headerCases: { responseHeaders: Record<string, string>; expectedDelayMs: number }[] = [
		{ responseHeaders: { "retry-after-ms": "1500" }, expectedDelayMs: 1500 },
		{ responseHeaders: { "retry-after": "3" }, expectedDelayMs: 3000 },
		{ responseHeaders: { "llm_provider-retry-after-ms": "2500" }, expectedDelayMs: 2500 },
		{ responseHeaders: { "llm_provider-retry-after": "5" }, expectedDelayMs: 5000 },
		{ responseHeaders: { "retry-after": new Date(CLOCK_START_MS + 3000).toUTCString() }, expectedDelayMs: 3000 },
	]

	// the jitter sits at its bottom, so each wait is the header's own
	;(Math.random as Mock<typeof Math.random>).mockReturnValue(0)
	for (const { responseHeaders, expectedDelayMs } of headerCases) {
		// each case runs on a fresh clock
		nowMs = CLOCK_START_MS
		sleptMs = []
		const attempts = failThenSucceed([toApiCallError(429, responseHeaders)])
		await runModelCall({ runAttempt: attempts.runAttempt, waitDeadlineAt: null, label: "embedding" })
		expect(sleptMs).toEqual([expectedDelayMs])
	}
})

test("a retry-after wait gets up to a fifth more, never past thirty seconds", () => {
	expect(toRetryAfterWaitMs(3000, () => 0)).toBe(3000)
	expect(toRetryAfterWaitMs(3000, () => 0.5)).toBe(3300)
	expect(toRetryAfterWaitMs(3000, () => 1)).toBe(3600)
	expect(toRetryAfterWaitMs(28_000, () => 1)).toBe(30_000)
})

test("a retry-after past thirty seconds fails at once", async () => {
	const attempts = failThenSucceed([toApiCallError(429, { "retry-after": "45" })])
	const run = runModelCall({ runAttempt: attempts.runAttempt, waitDeadlineAt: null, label: "scoringCheap" })
	await expect(run).rejects.toThrow("status 429")
	expect(attempts.attemptCount()).toBe(1)
	expect(sleptMs).toEqual([])
})

test("a wait that would pass the call's total wait fails at once", async () => {
	// 25 and 25 seconds are within the total, and a third wait of 20 would reach 70. the jitter sits at its bottom
	;(Math.random as Mock<typeof Math.random>).mockReturnValue(0)
	const rateLimit = (seconds: string): APICallError => toApiCallError(429, { "retry-after": seconds })
	const attempts = failThenSucceed([rateLimit("25"), rateLimit("25"), rateLimit("20")])
	const run = runModelCall({ runAttempt: attempts.runAttempt, waitDeadlineAt: null, label: "scoringCheap" })
	await expect(run).rejects.toThrow("status 429")
	expect(attempts.attemptCount()).toBe(3)
	expect(sleptMs).toEqual([25_000, 25_000])
})

test("a wait that would end past the review's wait deadline fails at once", async () => {
	// the deadline is two seconds away and the backoff asks for four
	const attempts = failThenSucceed([toApiCallError(429)])
	const run = runModelCall({
		runAttempt: attempts.runAttempt,
		waitDeadlineAt: CLOCK_START_MS + 2000,
		label: "scoringCheap",
	})
	await expect(run).rejects.toThrow("status 429")
	expect(sleptMs).toEqual([])
})

test("an attempt that ran past three minutes is not tried again", async () => {
	// a premium attempt that timed out after five minutes at the proxy
	let attemptCount = 0
	const run = runModelCall({
		runAttempt: async () => {
			attemptCount++
			nowMs += 5 * 60 * 1000
			throw toApiCallError(408)
		},
		waitDeadlineAt: null,
		label: "scoringPremium",
	})
	await expect(run).rejects.toThrow("status 408")
	expect(attemptCount).toBe(1)
})

test("a private call logs its label and numbers alone", async () => {
	const attempts = failThenSucceed([toApiCallError(429, { "retry-after": "1" }, "private text echoed")])
	await runModelCall({
		runAttempt: attempts.runAttempt,
		waitDeadlineAt: null,
		label: "scoringPremium",
		isPrivate: true,
	})
	expect(warnSpy).toHaveBeenCalledWith("model call scoringPremium attempt 1 failed, trying again in 1200 ms")
})

test("the backoff doubles from four seconds to thirty, scaled by a random half to whole", () => {
	// the bottom and the top of the jitter
	expect([1, 2, 3, 4, 5].map((attempt) => toModelCallBackoffMs(attempt, () => 0))).toEqual([
		2000, 4000, 8000, 15_000, 15_000,
	])
	expect([1, 2, 3, 4, 5].map((attempt) => toModelCallBackoffMs(attempt, () => 1))).toEqual([
		4000, 8000, 16_000, 30_000, 30_000,
	])
})
