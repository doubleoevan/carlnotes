// claim tests over a fake transaction: a claim already held, a free claim, the advisory lock statement,
// and a task that throws an error
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { db } from "."
import { runWithClaim } from "./claim"

// whether the fake transaction takes the claim, and the list that records each statement
type ToFakeTransactionOptions = { hasTakenClaim: boolean; statements: string[] }

// a fake db.transaction that records each statement and reports the claim as taken or not
function toFakeTransaction({ hasTakenClaim, statements }: ToFakeTransactionOptions): typeof db.transaction {
	const execute = async (statement: { queryChunks: unknown[] }): Promise<{ rows: { has_taken_claim: boolean }[] }> => {
		statements.push(JSON.stringify(statement.queryChunks))
		return { rows: [{ has_taken_claim: hasTakenClaim }] }
	}
	return ((run: (transaction: { execute: typeof execute }) => Promise<unknown>) =>
		run({ execute })) as unknown as typeof db.transaction
}

// put db.transaction back after each test
afterEach(() => {
	mock.restore()
})

// a claim already held skips the task and returns null
test("a claim already held skips the task", async () => {
	// a task that counts its calls, run under a claim already held
	spyOn(db, "transaction").mockImplementation(toFakeTransaction({ hasTakenClaim: false, statements: [] }))
	let taskCallCount = 0
	const runWithClaimResult = await runWithClaim({
		claimName: "scheduled-scan-sweep",
		runTask: async () => {
			taskCallCount++
			return "swept"
		},
	})
	expect(runWithClaimResult).toBeNull()
	expect(taskCallCount).toBe(0)
})

// a free claim runs the task and returns its result, and the statement tries the advisory lock on the claim's name
test("a free claim runs the task and returns its result", async () => {
	// the statements that the fake transaction records, and the result of a task under a free claim
	const statements: string[] = []
	spyOn(db, "transaction").mockImplementation(toFakeTransaction({ hasTakenClaim: true, statements }))
	const runWithClaimResult = await runWithClaim({ claimName: "monthly-budget-reset", runTask: async () => "reset" })
	expect(runWithClaimResult).toBe("reset")
	expect(statements[0]).toContain("pg_try_advisory_xact_lock(hashtext(")
	expect(statements[0]).toContain("monthly-budget-reset")
})

// a task that throws an error rejects runWithClaim with that error.
// the error ends the claim's transaction, and Postgres releases the claim with the transaction
test("a task that throws an error rejects runWithClaim with that error", async () => {
	// a task under a free claim that throws an error
	spyOn(db, "transaction").mockImplementation(toFakeTransaction({ hasTakenClaim: true, statements: [] }))
	const taskError = new Error("sweep failed")
	const runWithClaimPromise = runWithClaim({
		claimName: "scheduled-scan-sweep",
		runTask: async () => {
			throw taskError
		},
	})
	await expect(runWithClaimPromise).rejects.toBe(taskError)
})
