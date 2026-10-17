// a database claim for a job that must not overlap itself, as a lease row that the run renews while its task runs
import { and, eq, gt, lte, type SQL, sql } from "drizzle-orm"
import { db } from "."
import { claims } from "./schema/claims"

// how often a run renews its lease, and how many renewals one lease lasts through, so a lease runs two minutes
const RENEW_INTERVAL_MS = 30_000
const RENEWALS_PER_LEASE = 4

// the claim's name, the task to run under the claim, and how often to renew the lease
export type RunWithClaimOptions<Result> = {
	claimName: string
	runTask: (signal: AbortSignal) => Promise<Result>
	renewIntervalMs?: number
}

/**
 * The error a task's signal aborts with once its claim's lease expired or another run took the claim.
 */
export class ClaimLostError extends Error {
	constructor(claimName: string) {
		super(`the ${claimName} claim was lost while its task ran`)
		this.name = "ClaimLostError"
	}
}

/**
 * Runs a task under the named claim, or returns null without running the task if another run's lease is live.
 * The lease is renewed while the task runs, and the run deletes its own row when the task ends, however it ends.
 * A renewal that finds the lease expired or taken aborts the task's signal, and the run rejects with a ClaimLostError.
 */
export async function runWithClaim<Result>({
	claimName,
	runTask,
	renewIntervalMs = RENEW_INTERVAL_MS,
}: RunWithClaimOptions<Result>): Promise<Result | null> {
	// take the claim for this run, and return null without running the task if another run's lease is live
	const holderId = crypto.randomUUID()
	const leaseMs = renewIntervalMs * RENEWALS_PER_LEASE
	const takenAt = Date.now()
	if (!(await takeClaim(claimName, holderId, leaseMs))) {
		return null
	}

	// renew the lease while the task runs, and abort the task once the lease is lost
	const claimAbortController = new AbortController()
	const renewTimer = startRenewing({ claimName, holderId, leaseMs, renewIntervalMs, takenAt, claimAbortController })

	// run the task. if the claim was lost, the run rejects with the ClaimLostError even if the task resolved
	try {
		const taskResult = await runTask(claimAbortController.signal)
		claimAbortController.signal.throwIfAborted()
		return taskResult
	} finally {
		// stop renewing and delete this run's own row. a failed delete leaves a lease that expires on its own
		clearInterval(renewTimer)
		await releaseClaim(claimName, holderId).catch((error: unknown) => {
			console.error(`could not release the ${claimName} claim`, error)
		})
	}
}

// the claim to renew, its holder, the lease length, how often to renew, when the claim was taken, and what to abort
type StartRenewingOptions = {
	claimName: string
	holderId: string
	leaseMs: number
	renewIntervalMs: number
	takenAt: number
	claimAbortController: AbortController
}

// renew the lease on an interval, and abort once a renewal finds the lease gone or the last renewed lease has run out
function startRenewing({
	claimName,
	holderId,
	leaseMs,
	renewIntervalMs,
	takenAt,
	claimAbortController,
}: StartRenewingOptions): ReturnType<typeof setInterval> {
	// when the last lease this run renewed runs out, timed from before its statement was sent so it never reads late,
	// and whether a renewal is still waiting on the database
	let leaseEndsAt = takenAt + leaseMs
	let isRenewing = false
	const renewTimer = setInterval(async () => {
		// skip a tick while the last renewal still waits, and stop renewing once the claim is lost
		if (isRenewing || claimAbortController.signal.aborted) {
			return
		}
		isRenewing = true
		const renewStartedAt = Date.now()
		try {
			// a renewal that matches no row means the lease expired or another run took it
			if (await renewClaim(claimName, holderId, leaseMs)) {
				leaseEndsAt = renewStartedAt + leaseMs
			} else {
				claimAbortController.abort(new ClaimLostError(claimName))
			}
		} catch (error) {
			// a renewal that throws is tried again on the next tick, and the task is aborted if the next tick would land
			// after the lease it last renewed runs out
			console.error(`could not renew the ${claimName} claim`, error)
			if (Date.now() + renewIntervalMs >= leaseEndsAt) {
				claimAbortController.abort(new ClaimLostError(claimName))
			}
		} finally {
			isRenewing = false
		}
		// stop the timer once the claim is lost
		if (claimAbortController.signal.aborted) {
			clearInterval(renewTimer)
		}
	}, renewIntervalMs)
	return renewTimer
}

// a lease that ends after this many milliseconds, timed by the database clock
function toLeaseEnd(leaseMs: number): SQL {
	return sql`now() + make_interval(secs => ${leaseMs / 1000})`
}

// insert the claim's row, or take it over only if its lease has expired. true if this run now holds the claim
async function takeClaim(claimName: string, holderId: string, leaseMs: number): Promise<boolean> {
	const takenClaims = await db
		.insert(claims)
		.values({ name: claimName, holderId, takenAt: sql`now()`, expiresAt: toLeaseEnd(leaseMs) })
		.onConflictDoUpdate({
			target: claims.name,
			set: {
				holderId: sql`excluded.holder_id`,
				takenAt: sql`excluded.taken_at`,
				expiresAt: sql`excluded.expires_at`,
			},
			where: lte(claims.expiresAt, sql`now()`),
		})
		.returning({ holderId: claims.holderId })
	return takenClaims.length > 0
}

// extend this run's lease if it still holds a live one. false if the lease expired or another run took the claim
async function renewClaim(claimName: string, holderId: string, leaseMs: number): Promise<boolean> {
	const renewedClaims = await db
		.update(claims)
		.set({ expiresAt: toLeaseEnd(leaseMs) })
		.where(and(eq(claims.name, claimName), eq(claims.holderId, holderId), gt(claims.expiresAt, sql`now()`)))
		.returning({ name: claims.name })
	return renewedClaims.length > 0
}

// delete the claim's row only if this run still holds it
async function releaseClaim(claimName: string, holderId: string): Promise<void> {
	await db.delete(claims).where(and(eq(claims.name, claimName), eq(claims.holderId, holderId)))
}
