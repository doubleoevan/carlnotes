// job lease tests over one in-memory job_leases row: a live lease turns a second run away, an expired lease is taken over,
// a lost renewal aborts the task, a renewal that throws runs out the lease, and a release deletes only its own row
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "./connectionPoolStub"
import { JobLeaseLostError, runWithJobLease } from "./jobLease"

// how often the tests renew a lease. a lease lasts four renewals, so a test lease runs 40 ms
const TEST_RENEW_INTERVAL_MS = 10

// the one job_leases row the stub keeps, timed by this process's clock in place of the database's
type LeaseRow = { holderId: string; expiresAt: number }

// the job_leases row, the statements sent, and whether a renewal throws an error, as one test's stubbed database holds them
type FakeLeases = { leaseRow: LeaseRow | null; sentQueries: SentQuery[]; isRenewalFailing: boolean }

// a stubbed database that answers the lease's take, renew, and release statements against one row
function stubLeases(): FakeLeases {
	const fakeLeases: FakeLeases = { leaseRow: null, sentQueries: [], isRenewalFailing: false }
	fakeLeases.sentQueries = stubConnectionPool((sentQuery) => {
		// each statement goes to the handler for its kind
		if (sentQuery.text.startsWith("insert")) {
			return takeFakeLease(fakeLeases, sentQuery)
		}

		// a renewal updates the row, and a release deletes it
		return sentQuery.text.startsWith("update")
			? renewFakeLease(fakeLeases, sentQuery)
			: releaseFakeLease(fakeLeases, sentQuery)
	})
	return fakeLeases
}

// the take inserts the row, or takes it over only if its lease has expired
function takeFakeLease(fakeLeases: FakeLeases, sentQuery: SentQuery): unknown[] {
	const [, holderId, leaseSeconds] = sentQuery.values as [string, string, number]
	if (fakeLeases.leaseRow && fakeLeases.leaseRow.expiresAt > Date.now()) {
		return []
	}
	fakeLeases.leaseRow = { holderId, expiresAt: Date.now() + leaseSeconds * 1000 }
	return [[holderId]]
}

// the renewal extends a live lease that the same run holds, and a lease that is gone or taken matches no row
function renewFakeLease(fakeLeases: FakeLeases, sentQuery: SentQuery): unknown[] {
	if (fakeLeases.isRenewalFailing) {
		throw new Error("connection lost")
	}

	// a lease that is gone, or held by another run, matches no row
	const [leaseSeconds, jobName, holderId] = sentQuery.values as [number, string, string]
	const { leaseRow } = fakeLeases
	if (!leaseRow || leaseRow.holderId !== holderId || leaseRow.expiresAt <= Date.now()) {
		return []
	}
	leaseRow.expiresAt = Date.now() + leaseSeconds * 1000
	return [[jobName]]
}

// the release deletes the row only for the run that holds it
function releaseFakeLease(fakeLeases: FakeLeases, sentQuery: SentQuery): unknown[] {
	const [, holderId] = sentQuery.values as [string, string]
	if (fakeLeases.leaseRow?.holderId === holderId) {
		fakeLeases.leaseRow = null
	}
	return []
}

// a task that waits until its signal aborts or the wait runs out, and then returns what it saw
function waitForAbort(waitMs: number): (signal: AbortSignal) => Promise<string> {
	return async (signal) => {
		// end early once the signal aborts, and throw the lease's error
		await new Promise<void>((resolve) => {
			const waitTimer = setTimeout(resolve, waitMs)
			signal.addEventListener("abort", () => {
				clearTimeout(waitTimer)
				resolve()
			})
		})

		// throw the lease's error if the signal aborted, and report a finished wait otherwise
		signal.throwIfAborted()
		return "finished"
	}
}

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

// a free lease runs the task, takes the lease with one statement that only takes over an expired row, and releases it
test("a free lease runs the task, takes the lease in one statement, and releases its row", async () => {
	// a task under a free lease
	const fakeLeases = stubLeases()
	const runWithJobLeaseResult = await runWithJobLease({ jobName: "monthly-budget-reset", runTask: async () => "reset" })
	expect(runWithJobLeaseResult).toBe("reset")

	// the take inserts or takes over only an expired lease, timed by the database clock, and the release ran
	const [takeQuery] = fakeLeases.sentQueries
	expect(takeQuery?.text).toContain('on conflict ("name") do update')
	expect(takeQuery?.text).toContain('where "job_leases"."expires_at" <= now()')
	expect(takeQuery?.values).toEqual(["monthly-budget-reset", expect.any(String), 120])
	expect(fakeLeases.leaseRow).toBeNull()
})

// a second run gets null while the first run's lease is live, and takes the lease once that lease has expired
test("a second run gets null while a lease is live and takes the lease once it expires", async () => {
	// a first run holding the lease with a long task
	const fakeLeases = stubLeases()
	const firstRun = runWithJobLease({
		jobName: "scheduled-scan-sweep",
		runTask: waitForAbort(1000),
		renewIntervalMs: TEST_RENEW_INTERVAL_MS,
	})
	await Bun.sleep(5)

	// a second run while the lease is live never runs its task
	let secondTaskCallCount = 0
	const secondRunResult = await runWithJobLease({
		jobName: "scheduled-scan-sweep",
		runTask: async () => {
			secondTaskCallCount++
			return "swept"
		},
	})
	expect(secondRunResult).toBeNull()
	expect(secondTaskCallCount).toBe(0)

	// the first run's lease expires, as if its connection went quiet, and a third run takes the lease over
	const firstHolderId = fakeLeases.leaseRow?.holderId
	if (fakeLeases.leaseRow) {
		fakeLeases.leaseRow.expiresAt = Date.now() - 1
	}
	const takeOverRun = runWithJobLease({
		jobName: "scheduled-scan-sweep",
		runTask: waitForAbort(60),
		renewIntervalMs: TEST_RENEW_INTERVAL_MS,
	})

	// the first run's next renewal finds the lease taken, so its task is aborted and the run rejects
	await expect(firstRun).rejects.toBeInstanceOf(JobLeaseLostError)
	expect(fakeLeases.leaseRow?.holderId).not.toBe(firstHolderId)

	// the first run's release deleted nothing, so the third run's lease stood until it finished
	expect(await takeOverRun).toBe("finished")
	expect(fakeLeases.leaseRow).toBeNull()
})

// a renewal that throws is tried again until the last renewed lease runs out, and then the task is aborted
test("a renewal that keeps throwing aborts the task once the lease would have expired", async () => {
	// a run whose renewals all fail
	const fakeLeases = stubLeases()
	fakeLeases.isRenewalFailing = true
	const startedAt = Date.now()
	const failedRenewalRun = runWithJobLease({
		jobName: "scheduled-scan-sweep",
		runTask: waitForAbort(1000),
		renewIntervalMs: TEST_RENEW_INTERVAL_MS,
	})

	// the task is aborted by about the 40 ms lease end, with room for a slow timer tick, after more than one renewal was
	// tried
	await expect(failedRenewalRun).rejects.toBeInstanceOf(JobLeaseLostError)
	expect(Date.now() - startedAt).toBeLessThan(80)
	const renewalCount = fakeLeases.sentQueries.filter((sentQuery) => sentQuery.text.startsWith("update")).length
	expect(renewalCount).toBeGreaterThan(1)
})

// a task that resolves after its lease was lost still rejects, so the run shows as failed
test("a run whose task ignores its signal still rejects once its lease was lost", async () => {
	// a run whose lease is taken away while its task keeps going without checking its signal
	const fakeLeases = stubLeases()
	const ignoringRun = runWithJobLease({
		jobName: "monthly-budget-reset",
		runTask: async () => {
			await Bun.sleep(40)
			return "reset"
		},
		renewIntervalMs: TEST_RENEW_INTERVAL_MS,
	})
	await Bun.sleep(5)
	fakeLeases.leaseRow = { holderId: "another-run", expiresAt: Date.now() + 60_000 }

	// the run rejects with a JobLeaseLostError, and the other run's row stands
	await expect(ignoringRun).rejects.toBeInstanceOf(JobLeaseLostError)
	expect(fakeLeases.leaseRow?.holderId).toBe("another-run")
})

// a task that throws an error rejects runWithJobLease with that error and still releases the lease
test("a task that throws an error rejects with that error and releases the lease", async () => {
	// a task under a free lease that throws an error
	const fakeLeases = stubLeases()
	const taskError = new Error("sweep failed")
	const runWithJobLeasePromise = runWithJobLease({
		jobName: "scheduled-scan-sweep",
		runTask: async () => {
			throw taskError
		},
	})

	// the error comes back and the row is gone
	await expect(runWithJobLeasePromise).rejects.toBe(taskError)
	expect(fakeLeases.leaseRow).toBeNull()
})
