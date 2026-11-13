// tests for the concurrency limit shared across callers
import { expect, test } from "bun:test"
import { createConcurrencyLimiter } from "./concurrency"

test("a concurrency limit runs no more than its limit at once and runs every task", async () => {
	// six tasks under a limit of two, each counting how many run beside it
	const runLimited = createConcurrencyLimiter(2)
	let runningCount = 0
	let mostRunningCount = 0
	const results = await Promise.all(
		Array.from({ length: 6 }, (_, i) =>
			runLimited(async () => {
				// count the task while it runs
				runningCount++
				mostRunningCount = Math.max(mostRunningCount, runningCount)
				await Bun.sleep(5)
				runningCount--
				return i
			}),
		),
	)
	expect(results).toEqual([0, 1, 2, 3, 4, 5])
	expect(mostRunningCount).toBe(2)
})

test("a failed task frees its slot", async () => {
	// one slot, a failing task, then a task that needs the slot
	const runLimited = createConcurrencyLimiter(1)
	const failedTask = runLimited(() => Promise.reject(new Error("failed")))
	const nextTask = runLimited(async () => "ran")
	await expect(failedTask).rejects.toThrow("failed")
	expect(await nextTask).toBe("ran")
})
