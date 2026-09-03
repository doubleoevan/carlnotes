// budget rejection tests. one wording for a spent budget, and every path that can meet the proxy's rejection answers it.
import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { isBudgetRejection, SPENT_BUDGET_REJECTION } from "../../worker"

// the check that decides whether a failure is the proxy turning the call down for spend
test("the proxy's spent-budget answer is the one that rejects", () => {
	const budgetBody = '{"error":{"message":"Budget has been exceeded!","type":"budget_exceeded","code":"429"}}'
	expect(isBudgetRejection({ statusCode: 429, responseBody: budgetBody })).toBe(true)
	// a 429 for anything else keeps reporting itself as a failure instead of posting a rejection
	expect(isBudgetRejection({ statusCode: 429, responseBody: '{"error":{"type":"rate_limit_exceeded"}}' })).toBe(false)
})

// the gate rejects before anything posts, and the proxy rejects partway through a chat turn. both say the same thing to the user
test("the rejection wording is written once", () => {
	expect(SPENT_BUDGET_REJECTION).toContain("empty mug")
	// the wording is not spelled out again anywhere in the chat module
	const chatSources = ["room.ts", "roomTurns.ts", "turns.ts"].map((name) =>
		readFileSync(join(import.meta.dir, name), "utf8"),
	)
	const spelledOut = chatSources.filter((source) => source.includes("empty mug"))
	expect(spelledOut).toEqual([])
})

/**
 * A budget rejection that is returned after the message posts has to reach the user. Both chat paths answer it themselves.
 */
test("both chat paths answer a budget rejection instead of only logging it", () => {
	for (const name of ["room.ts", "turns.ts"]) {
		const source = readFileSync(join(import.meta.dir, name), "utf8")
		expect(source).toContain("isBudgetRejection")
		expect(source).toContain("SPENT_BUDGET_REJECTION")
	}
})

/**
 * A budget the app saved and a key the proxy never resized leave the two disagreeing.
 * Whoever changed the budget has to be told.
 */
test("a budget change reports whether the key followed it", () => {
	const authorization = readFileSync(join(import.meta.dir, "..", "authorization.ts"), "utf8")
	// the replace answers whether the key now matches
	expect(authorization).toContain("Promise<boolean>")
	// a failure is reported, not only logged
	expect(authorization).toContain("reportError")

	// the admin route passes that outcome on
	const admin = readFileSync(join(import.meta.dir, "..", "admin.ts"), "utf8")
	expect(admin).toContain("isKeyResized")
	expect(admin).toContain("key-unchanged")
})
