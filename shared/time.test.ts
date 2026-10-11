// time limit tests: work that settles first keeps its outcome, and work that outlasts the limit fails with the limit's error.
import { expect, test } from "bun:test"
import { withTimeLimit } from "./time"

// work that settles inside the limit returns its result or its own error
test("withTimeLimit returns work that settles before the limit", async () => {
	// a result and a rejection, each well inside the limit
	expect(await withTimeLimit(Promise.resolve("done"), 1000, () => new Error("too slow"))).toBe("done")
	await expect(withTimeLimit(Promise.reject(new Error("broke")), 1000, () => new Error("too slow"))).rejects.toThrow(
		"broke",
	)
})

// work that never settles fails with the limit's error once the limit passes
test("withTimeLimit rejects with the limit's error once the limit passes", async () => {
	await expect(withTimeLimit(new Promise<never>(() => {}), 5, () => new Error("too slow"))).rejects.toThrow("too slow")
})
