// claim tests over one in-memory claims row: a live lease turns a second run away, an expired lease is taken over,
// a lost renewal aborts the task, a renewal that throws runs out the lease, and a release deletes only its own row
import { afterEach, expect, test } from "bun:test"
import { ClaimLostError, runWithClaim } from "./claim"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "./connectionPoolStub"

// how often the tests renew a lease. a lease lasts four renewals, so a test lease runs 40 ms
const TEST_RENEW_INTERVAL_MS = 10

// the one claims row the stub keeps, timed by this process's clock in place of the database's
type ClaimRow = { holderId: string; expiresAt: number }

// the claims row, the statements sent, and whether a renewal throws an error, as one test's stubbed database holds them
type FakeClaims = { claimRow: ClaimRow | null; sentQueries: SentQuery[]; isRenewalFailing: boolean }

// a stubbed database that answers the claim's take, renew, and release statements against one row
function stubClaims(): FakeClaims {
	const fakeClaims: FakeClaims = { claimRow: null, sentQueries: [], isRenewalFailing: false }
	fakeClaims.sentQueries = stubConnectionPool((sentQuery) => {
		// each statement goes to the handler for its kind
		if (sentQuery.text.startsWith("insert")) {
			return takeFakeClaim(fakeClaims, sentQuery)
		}

		// a renewal updates the row, and a release deletes it
		return sentQuery.text.startsWith("update")
			? renewFakeClaim(fakeClaims, sentQuery)
			: releaseFakeClaim(fakeClaims, sentQuery)
	})
	return fakeClaims
}

// the take inserts the row, or takes it over only if its lease has expired
function takeFakeClaim(fakeClaims: FakeClaims, sentQuery: SentQuery): unknown[] {
	const [, holderId, leaseSeconds] = sentQuery.values as [string, string, number]
	if (fakeClaims.claimRow && fakeClaims.claimRow.expiresAt > Date.now()) {
		return []
	}
	fakeClaims.claimRow = { holderId, expiresAt: Date.now() + leaseSeconds * 1000 }
	return [[holderId]]
}

// the renewal extends a live lease that the same run holds, and a lease that is gone or taken matches no row
function renewFakeClaim(fakeClaims: FakeClaims, sentQuery: SentQuery): unknown[] {
	if (fakeClaims.isRenewalFailing) {
		throw new Error("connection lost")
	}

	// a lease that is gone, or held by another run, matches no row
	const [leaseSeconds, claimName, holderId] = sentQuery.values as [number, string, string]
	const { claimRow } = fakeClaims
	if (!claimRow || claimRow.holderId !== holderId || claimRow.expiresAt <= Date.now()) {
		return []
	}
	claimRow.expiresAt = Date.now() + leaseSeconds * 1000
	return [[claimName]]
}

// the release deletes the row only for the run that holds it
function releaseFakeClaim(fakeClaims: FakeClaims, sentQuery: SentQuery): unknown[] {
	const [, holderId] = sentQuery.values as [string, string]
	if (fakeClaims.claimRow?.holderId === holderId) {
		fakeClaims.claimRow = null
	}
	return []
}

// a task that waits until its signal aborts or the wait runs out, and then returns what it saw
function waitForAbort(waitMs: number): (signal: AbortSignal) => Promise<string> {
	return async (signal) => {
		// end early once the signal aborts, and throw the claim's error
		await new Promise<void>((resolve) => {
			const waitTimer = setTimeout(resolve, waitMs)
			signal.addEventListener("abort", () => {
				clearTimeout(waitTimer)
				resolve()
			})
		})

		// throw the claim's error if the signal aborted, and report a finished wait otherwise
		signal.throwIfAborted()
		return "finished"
	}
}

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

// a free claim runs the task, takes the lease with one statement that only takes over an expired row, and releases it
test("a free claim runs the task, takes the lease in one statement, and releases its row", async () => {
	// a task under a free claim
	const fakeClaims = stubClaims()
	const runWithClaimResult = await runWithClaim({ claimName: "monthly-budget-reset", runTask: async () => "reset" })
	expect(runWithClaimResult).toBe("reset")

	// the take inserts or takes over only an expired lease, timed by the database clock, and the release ran
	const [takeQuery] = fakeClaims.sentQueries
	expect(takeQuery?.text).toContain('on conflict ("name") do update')
	expect(takeQuery?.text).toContain('where "claims"."expires_at" <= now()')
	expect(takeQuery?.values).toEqual(["monthly-budget-reset", expect.any(String), 120])
	expect(fakeClaims.claimRow).toBeNull()
})

// a second run gets null while the first run's lease is live, and takes the claim once that lease has expired
test("a second run gets null while a lease is live and takes the claim once it expires", async () => {
	// a first run holding the claim with a long task
	const fakeClaims = stubClaims()
	const firstRun = runWithClaim({
		claimName: "scheduled-scan-sweep",
		runTask: waitForAbort(1000),
		renewIntervalMs: TEST_RENEW_INTERVAL_MS,
	})
	await Bun.sleep(5)

	// a second run while the lease is live never runs its task
	let secondTaskCallCount = 0
	const secondRunResult = await runWithClaim({
		claimName: "scheduled-scan-sweep",
		runTask: async () => {
			secondTaskCallCount++
			return "swept"
		},
	})
	expect(secondRunResult).toBeNull()
	expect(secondTaskCallCount).toBe(0)

	// the first run's lease expires, as if its connection went quiet, and a third run takes the claim over
	const firstHolderId = fakeClaims.claimRow?.holderId
	if (fakeClaims.claimRow) {
		fakeClaims.claimRow.expiresAt = Date.now() - 1
	}
	const takeOverRun = runWithClaim({
		claimName: "scheduled-scan-sweep",
		runTask: waitForAbort(60),
		renewIntervalMs: TEST_RENEW_INTERVAL_MS,
	})

	// the first run's next renewal finds the claim taken, so its task is aborted and the run rejects
	await expect(firstRun).rejects.toBeInstanceOf(ClaimLostError)
	expect(fakeClaims.claimRow?.holderId).not.toBe(firstHolderId)

	// the first run's release deleted nothing, so the third run's lease stood until it finished
	expect(await takeOverRun).toBe("finished")
	expect(fakeClaims.claimRow).toBeNull()
})

// a renewal that throws is tried again until the last renewed lease runs out, and then the task is aborted
test("a renewal that keeps throwing aborts the task once the lease would have expired", async () => {
	// a run whose renewals all fail
	const fakeClaims = stubClaims()
	fakeClaims.isRenewalFailing = true
	const startedAt = Date.now()
	const failedRenewalRun = runWithClaim({
		claimName: "scheduled-scan-sweep",
		runTask: waitForAbort(1000),
		renewIntervalMs: TEST_RENEW_INTERVAL_MS,
	})

	// the task is aborted before the 40 ms lease runs out, after more than one renewal was tried
	await expect(failedRenewalRun).rejects.toBeInstanceOf(ClaimLostError)
	expect(Date.now() - startedAt).toBeLessThan(40)
	const renewalCount = fakeClaims.sentQueries.filter((sentQuery) => sentQuery.text.startsWith("update")).length
	expect(renewalCount).toBeGreaterThan(1)
})

// a task that resolves after its claim was lost still rejects, so the run shows as failed
test("a run whose task ignores its signal still rejects once its claim was lost", async () => {
	// a run whose lease is taken away while its task keeps going without checking its signal
	const fakeClaims = stubClaims()
	const ignoringRun = runWithClaim({
		claimName: "monthly-budget-reset",
		runTask: async () => {
			await Bun.sleep(40)
			return "reset"
		},
		renewIntervalMs: TEST_RENEW_INTERVAL_MS,
	})
	await Bun.sleep(5)
	fakeClaims.claimRow = { holderId: "another-run", expiresAt: Date.now() + 60_000 }

	// the run rejects with a ClaimLostError, and the other run's row stands
	await expect(ignoringRun).rejects.toBeInstanceOf(ClaimLostError)
	expect(fakeClaims.claimRow?.holderId).toBe("another-run")
})

// a task that throws an error rejects runWithClaim with that error and still releases the claim
test("a task that throws an error rejects with that error and releases the claim", async () => {
	// a task under a free claim that throws an error
	const fakeClaims = stubClaims()
	const taskError = new Error("sweep failed")
	const runWithClaimPromise = runWithClaim({
		claimName: "scheduled-scan-sweep",
		runTask: async () => {
			throw taskError
		},
	})

	// the error comes back and the row is gone
	await expect(runWithClaimPromise).rejects.toBe(taskError)
	expect(fakeClaims.claimRow).toBeNull()
})
