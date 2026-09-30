// a database claim for a job that must not overlap itself, as an advisory lock that works through Neon's connection pooler
import { sql } from "drizzle-orm"
import { db } from "."

// the claim's name, and the task to run under the claim
export type RunWithClaimOptions<Result> = { claimName: string; runTask: () => Promise<Result> }

/**
 * Runs a task under the named claim, or returns null without running the task if the claim is already held.
 * The claim is a transaction-level advisory lock, held while the task runs and released no matter how the task ends.
 * Neon's transaction-mode connection pooler keeps a transaction on one server connection.
 * The task's own queries run outside the claim's transaction, on the connection pool's other connections.
 */
export function runWithClaim<Result>({ claimName, runTask }: RunWithClaimOptions<Result>): Promise<Result | null> {
	// ponytail: the claim's transaction stays open while the task runs.
	// a lease row with an expiry is the upgrade if the connection pooler ever closes an idle transaction
	return db.transaction(async (transaction) => {
		// try to take the claim and run the task only if this transaction took the claim
		const { rows: claimRows } = await transaction.execute(
			sql`select pg_try_advisory_xact_lock(hashtext(${claimName})) as has_taken_claim`,
		)
		const hasTakenClaim = claimRows[0]?.has_taken_claim === true
		return hasTakenClaim ? runTask() : null
	})
}
