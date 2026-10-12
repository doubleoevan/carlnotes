// time limit tests: work that settles first keeps its outcome, and work that outlasts the limit fails with the limit's error.
import { expect, test } from "bun:test"
import { withTimeLimit } from "./time"

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
