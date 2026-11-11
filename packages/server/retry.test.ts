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

	test("waits what the delay function returns, and reports the failure and the wait", async () => {
		// each wait is chosen from the attempt that failed
		const retries: { attempt: number; message: string; delayMs: number }[] = []
		const result = await runWithRetries({
			attempts: 3,
			toDelayMs: (_error, attempt) => attempt - 1,
			runAttempt: failUntil(3),
			onRetry: (attempt, error, delayMs) =>
				retries.push({ attempt, message: error instanceof Error ? error.message : "", delayMs }),
		})
		expect(result).toBe(3)
		expect(retries).toEqual([
			{ attempt: 1, message: "not yet", delayMs: 0 },
			{ attempt: 2, message: "not yet", delayMs: 1 },
		])
	})

	test("throws a failure whose delay function returns null without another attempt", async () => {
		// a null wait ends the run on the first failure
		let attemptCount = 0
		const run = runWithRetries({
			attempts: 5,
			toDelayMs: () => null,
			runAttempt: async (attempt) => {
				attemptCount = attempt
				throw new Error("too long a wait")
			},
		})
		await expect(run).rejects.toThrow("too long a wait")
		expect(attemptCount).toBe(1)
	})
})
