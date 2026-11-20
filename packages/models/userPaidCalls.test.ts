// a user's paid call with no row of its own: a spent budget makes no call, and a call that runs is recorded as the
// user's spend and gives its reservation back
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as monitoring from "@carlnotes/server/monitoring"
import * as spendReservations from "./spendReservations"
import { runUserPaidCall } from "./userPaidCalls"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// a page fetch that a user's Topic asks for
const PAGE_FETCH = { userId: "user-1", kind: "urlAttachmentFetch", topicId: "topic-1", maxDollars: 0.001 } as const

test("a spent budget makes no call and records nothing", async () => {
	const sentQueries = stubConnectionPool(() => [])
	spyOn(spendReservations, "reserveUserSpend").mockResolvedValue("rejected")
	const runCall = mock(async () => ({ callResult: "the page", dollars: 0.001 }))
	expect(await runUserPaidCall(PAGE_FETCH, runCall)).toEqual({ status: "budgetSpent" })
	expect(runCall).not.toHaveBeenCalled()
	expect(sentQueries).toEqual([])
})

test("a call that runs is recorded as the user's spend, and its reservation is given back", async () => {
	// the reservation holds the call's largest cost while it runs
	const sentQueries = stubConnectionPool(() => [])
	const release = mock(async () => {})
	const reserveSpy = spyOn(spendReservations, "reserveUserSpend").mockResolvedValue({ release })
	const paidCall = await runUserPaidCall(PAGE_FETCH, async () => ({ callResult: "the page", dollars: 0.001 }))
	expect(paidCall).toEqual({ status: "ran", callResult: "the page" })
	expect(reserveSpy).toHaveBeenCalledWith({ userId: "user-1", kind: "paidCall", maxDollars: 0.001 })

	// one spends row with the user and the Topic, then the release
	expect(sentQueries).toHaveLength(1)
	expect(sentQueries[0]?.text).toStartWith('insert into "spends"')
	expect(sentQueries[0]?.values).toEqual(expect.arrayContaining(["urlAttachmentFetch", 0.001, "user-1", "topic-1"]))
	expect(release).toHaveBeenCalledTimes(1)
})

test("a call that fails gives its reservation back and records nothing", async () => {
	const sentQueries = stubConnectionPool(() => [])
	const release = mock(async () => {})
	spyOn(spendReservations, "reserveUserSpend").mockResolvedValue({ release })
	const failedCall = runUserPaidCall(PAGE_FETCH, async () => {
		throw new Error("the page could not be read")
	})

	// the call's own error reaches the caller
	await expect(failedCall).rejects.toThrow("the page could not be read")
	expect(release).toHaveBeenCalledTimes(1)
	expect(sentQueries).toEqual([])
})

test("a spend write that fails is reported, and the call's result still reaches the caller", async () => {
	// the spends insert fails after the call ran
	stubConnectionPool(() => {
		throw new Error("the database is down")
	})
	const release = mock(async () => {})
	spyOn(spendReservations, "reserveUserSpend").mockResolvedValue({ release })
	const report = spyOn(monitoring, "reportError").mockImplementation(() => {})
	const paidCall = await runUserPaidCall(PAGE_FETCH, async () => ({ callResult: "the page", dollars: 0.001 }))

	// the caller gets the page, the failed write is reported, and the reservation is given back
	expect(paidCall).toEqual({ status: "ran", callResult: "the page" })
	expect(report).toHaveBeenCalledTimes(1)
	expect(report.mock.calls[0]?.[2]).toEqual({ userId: "user-1", kind: "urlAttachmentFetch", step: "paid-call-spend" })
	expect(release).toHaveBeenCalledTimes(1)
})
