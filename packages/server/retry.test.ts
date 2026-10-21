import { describe, expect, test } from "bun:test"
import { runWithRetries } from "./retry"

// an attempt that fails until the given attempt, then returns that attempt's number
function failUntil(succeedingAttempt: number, error = new Error("not yet")) {
	return async (attempt: number) => {
		if (attempt < succeedingAttempt) {
			throw error
		}
		return attempt
	}
}

describe("runWithRetries", () => {
	test("tries again until an attempt succeeds, reporting each failed attempt", async () => {
		// two failures, then the third attempt's result
		const retriedAttempts: number[] = []
		const result = await runWithRetries({
			attempts: 3,
			delayMs: 0,
			runAttempt: failUntil(3),
			onRetry: (attempt) => retriedAttempts.push(attempt),
		})
		expect(result).toBe(3)
		expect(retriedAttempts).toEqual([1, 2])
	})

	test("throws the last attempt's failure", async () => {
		const run = runWithRetries({ attempts: 2, delayMs: 0, runAttempt: failUntil(3), onRetry: () => {} })
		await expect(run).rejects.toThrow("not yet")
	})

	test("throws a failure that is not retryable without another attempt", async () => {
		// the first failure is not retryable, so nothing is tried again
		const retriedAttempts: number[] = []
		const run = runWithRetries({
			attempts: 5,
			delayMs: 0,
			runAttempt: failUntil(3, new Error("rejected")),
			isRetryable: () => false,
			onRetry: (attempt) => retriedAttempts.push(attempt),
		})
		await expect(run).rejects.toThrow("rejected")
		expect(retriedAttempts).toEqual([])
	})
})
