// a job lease for a job that must not overlap itself, as a row that the run renews while its task runs
import { and, eq, gt, lte, type SQL, sql } from "drizzle-orm"
import { db } from "./index"
import { jobLeases } from "./schema/jobLeases"

// how often a run renews its lease, and how many renewals one lease lasts through, so a lease runs two minutes
const RENEW_INTERVAL_MS = 30_000
const RENEWALS_PER_LEASE = 4

// the job's name, the task to run under the lease, and how often to renew the lease
export type RunWithJobLeaseOptions<Result> = {
	jobName: string
	runTask: (signal: AbortSignal) => Promise<Result>
	renewIntervalMs?: number
}

/**
 * The error a task's signal aborts with once its lease expired or another run took the lease.
 */
export class JobLeaseLostError extends Error {
	constructor(jobName: string) {
		super(`the ${jobName} lease was lost while its task ran`)
		this.name = "JobLeaseLostError"
	}
}

/**
 * Runs a task under the named job's lease, or returns null without running the task if another run's lease is live.
 * The lease is renewed while the task runs, and the run deletes its own row when the task ends, however it ends.
 * A renewal that finds the lease expired or taken aborts the task's signal, and the run rejects with a JobLeaseLostError.
 */
export async function runWithJobLease<Result>({
	jobName,
	runTask,
	renewIntervalMs = RENEW_INTERVAL_MS,
}: RunWithJobLeaseOptions<Result>): Promise<Result | null> {
	// take the lease for this run, and return null without running the task if another run's lease is live
	const holderId = crypto.randomUUID()
	const leaseMs = renewIntervalMs * RENEWALS_PER_LEASE
	const takenAt = Date.now()
	if (!(await takeJobLease(jobName, holderId, leaseMs))) {
		return null
	}

	// renew the lease while the task runs, and abort the task once the lease is lost
	const leaseAbortController = new AbortController()
	const renewTimer = startRenewing({ jobName, holderId, leaseMs, renewIntervalMs, takenAt, leaseAbortController })

	// run the task. if the lease was lost, the run rejects with the JobLeaseLostError even if the task resolved
	try {
		const taskResult = await runTask(leaseAbortController.signal)
		leaseAbortController.signal.throwIfAborted()
		return taskResult
	} finally {
		// stop renewing and delete this run's own row. a failed delete leaves a lease that expires on its own
		clearInterval(renewTimer)
		await releaseJobLease(jobName, holderId).catch((error: unknown) => {
			console.error(`could not release the ${jobName} lease`, error)
		})
	}
}

// the lease to renew, its holder, the lease length, how often to renew, when the lease was taken, and what to abort
type StartRenewingOptions = {
	jobName: string
	holderId: string
	leaseMs: number
	renewIntervalMs: number
	takenAt: number
	leaseAbortController: AbortController
}

// renew the lease on an interval, and abort once a renewal finds the lease gone or the last renewed lease has run out
function startRenewing({
	jobName,
	holderId,
	leaseMs,
	renewIntervalMs,
	takenAt,
	leaseAbortController,
}: StartRenewingOptions): ReturnType<typeof setInterval> {
	// when the last lease this run renewed runs out, timed from before its statement was sent so it never reads late,
	// and whether a renewal is still waiting on the database
	let leaseEndsAt = takenAt + leaseMs
	let isRenewing = false
	const renewTimer = setInterval(async () => {
		// skip a tick while the last renewal still waits, and stop renewing once the lease is lost
		if (isRenewing || leaseAbortController.signal.aborted) {
			return
		}
		isRenewing = true
		const renewStartedAt = Date.now()
		try {
			// a renewal that matches no row means the lease expired or another run took it
			if (await renewJobLease(jobName, holderId, leaseMs)) {
				leaseEndsAt = renewStartedAt + leaseMs
			} else {
				leaseAbortController.abort(new JobLeaseLostError(jobName))
			}
		} catch (error) {
			// a renewal that throws is tried again on the next tick, and the task is aborted if the next tick would land
			// after the lease it last renewed runs out
			console.error(`could not renew the ${jobName} lease`, error)
			if (Date.now() + renewIntervalMs >= leaseEndsAt) {
				leaseAbortController.abort(new JobLeaseLostError(jobName))
			}
		} finally {
			isRenewing = false
		}
		// stop the timer once the lease is lost
		if (leaseAbortController.signal.aborted) {
			clearInterval(renewTimer)
		}
	}, renewIntervalMs)
	return renewTimer
}

// a lease that ends after this many milliseconds, timed by the database clock
function toLeaseEnd(leaseMs: number): SQL {
	return sql`now() + make_interval(secs => ${leaseMs / 1000})`
}

// insert the job's row, or take it over only if its lease has expired. true if this run now holds the lease
async function takeJobLease(jobName: string, holderId: string, leaseMs: number): Promise<boolean> {
	const takenLeases = await db
		.insert(jobLeases)
		.values({ name: jobName, holderId, takenAt: sql`now()`, expiresAt: toLeaseEnd(leaseMs) })
		.onConflictDoUpdate({
			target: jobLeases.name,
			set: {
				holderId: sql`excluded.holder_id`,
				takenAt: sql`excluded.taken_at`,
				expiresAt: sql`excluded.expires_at`,
			},
			where: lte(jobLeases.expiresAt, sql`now()`),
		})
		.returning({ holderId: jobLeases.holderId })
	return takenLeases.length > 0
}

// extend this run's lease if it still holds a live one. false if the lease expired or another run took the lease
async function renewJobLease(jobName: string, holderId: string, leaseMs: number): Promise<boolean> {
	const renewedLeases = await db
		.update(jobLeases)
		.set({ expiresAt: toLeaseEnd(leaseMs) })
		.where(and(eq(jobLeases.name, jobName), eq(jobLeases.holderId, holderId), gt(jobLeases.expiresAt, sql`now()`)))
		.returning({ name: jobLeases.name })
	return renewedLeases.length > 0
}

// delete the job's row only if this run still holds it
async function releaseJobLease(jobName: string, holderId: string): Promise<void> {
	await db.delete(jobLeases).where(and(eq(jobLeases.name, jobName), eq(jobLeases.holderId, holderId)))
}
