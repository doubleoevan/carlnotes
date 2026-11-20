// time limit tests: work that settles first keeps its outcome, and work that outlasts the limit fails with the limit's error.
// and the jittered backoff wait
import { expect, test } from "bun:test"
import { isDoneWithin, toJitteredBackoffMs, withTimeLimit } from "./time"

// the wait doubles from the first wait, stops at the longest wait, and the jitter scales it from half to all of it
test("a jittered backoff doubles up to its longest wait and scales by half to all of it", () => {
	expect(toJitteredBackoffMs({ firstWaitMs: 1000, doublingCount: 2, random: () => 1 })).toBe(4000)
	expect(toJitteredBackoffMs({ firstWaitMs: 1000, doublingCount: 2, random: () => 0 })).toBe(2000)
	expect(toJitteredBackoffMs({ firstWaitMs: 1000, doublingCount: 9, maximumWaitMs: 30_000, random: () => 1 })).toBe(
		30_000,
	)
	expect(toJitteredBackoffMs({ firstWaitMs: 4000, doublingCount: 0, random: () => 0.5 })).toBe(3000)
})

// work that settles inside the limit returns its result or its own error
test("withTimeLimit returns work that settles before the limit", async () => {
	// a result and a rejection, each well inside the limit
	expect(
		await withTimeLimit({ work: Promise.resolve("done"), timeLimitMs: 1000, toError: () => new Error("too slow") }),
	).toBe("done")
	await expect(
		withTimeLimit({
			work: Promise.reject(new Error("broke")),
			timeLimitMs: 1000,
			toError: () => new Error("too slow"),
		}),
	).rejects.toThrow("broke")
})

// work that never settles fails with the limit's error once the limit passes
test("withTimeLimit rejects with the limit's error once the limit passes", async () => {
	await expect(
		withTimeLimit({ work: new Promise<never>(() => {}), timeLimitMs: 5, toError: () => new Error("too slow") }),
	).rejects.toThrow("too slow")
})

// work is done within the limit if it settles first, and is not if the limit passes first
test("isDoneWithin says whether the work finished before the limit", async () => {
	// a finished work, a work that never settles, and a work that fails
	expect(await isDoneWithin(Promise.resolve(), 1000)).toBe(true)
	expect(await isDoneWithin(new Promise<never>(() => {}), 5)).toBe(false)
	await expect(isDoneWithin(Promise.reject(new Error("broke")), 1000)).rejects.toThrow("broke")
})
