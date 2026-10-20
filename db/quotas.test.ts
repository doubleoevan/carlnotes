// quota tests: the suggestion limit window and daily limit, each invite limit factor with its floor and a connected
// recipient, the per-request access read, the month's spend and its per-request read, and full podcast episodes
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { PLANS } from "@shared/plans"
import { sql } from "drizzle-orm"
import {
	ADMIN_USER_ACCESS_ROW,
	FREE_USER_ACCESS_ROW,
	PLUS_USER_ACCESS_ROW,
	restoreConnectionPool,
	stubConnectionPool,
} from "./connectionPoolStub"
import { db } from "./index"
import { isMonthlyBudgetCutoffPassed } from "./monthlyBudgetCutoffs"
import {
	hasFullPodcastEpisodes,
	incrementDaySuggestionCount,
	loadSpendSince,
	loadUserAccess,
	monthlySpendDollars,
	toInviteLimit,
	toSpendCents,
	toSuggestionRateLimitWindowKey,
} from "./quotas"
import { type SpendQueryRows, withSpendQueryRows } from "./quotaTestFixtures"
import * as redisRateLimits from "./redisRateLimits"
import { runWithRequestMemo } from "./requestMemo"

// put the spied Redis counter back after each test
afterEach(() => {
	mock.restore()
})

// the suggestion rate limit window key names the utc day and changes at utc midnight
test("the suggestion rate limit window key names the utc day", () => {
	expect(toSuggestionRateLimitWindowKey("user-1", new Date("2026-09-29T23:59:59Z"))).toBe(
		"suggestions:2026-09-29:user-1",
	)
	expect(toSuggestionRateLimitWindowKey("user-1", new Date("2026-09-30T00:00:00Z"))).toBe(
		"suggestions:2026-09-30:user-1",
	)
})

// each plan's own base, so a limit change in the plans table cannot leave these expectations behind
const FREE_BASE = PLANS.free.inviteLimit
const PLUS_BASE = PLANS.plus.inviteLimit

// an account past its first week with no reputation record sits at its plan's base
test("the plan base holds for an account past its first week with nothing measured", () => {
	expect(toInviteLimit({ plan: "free", accountAgeDays: 30, acceptedShare: null, isConnectedRecipient: false })).toBe(
		FREE_BASE,
	)
	expect(toInviteLimit({ plan: "plus", accountAgeDays: 30, acceptedShare: null, isConnectedRecipient: false })).toBe(
		PLUS_BASE,
	)
	expect(toInviteLimit({ plan: "premium", accountAgeDays: 30, acceptedShare: null, isConnectedRecipient: false })).toBe(
		PLANS.premium.inviteLimit,
	)
})

// a first-week account reaches a fifth of its base, and the seventh day is the boundary
test("the age factor cuts a first-week account to a fifth", () => {
	expect(toInviteLimit({ plan: "free", accountAgeDays: 1, acceptedShare: null, isConnectedRecipient: false })).toBe(
		Math.floor(FREE_BASE / 5),
	)
	expect(toInviteLimit({ plan: "plus", accountAgeDays: 6.9, acceptedShare: null, isConnectedRecipient: false })).toBe(
		Math.floor(PLUS_BASE / 5),
	)
	expect(toInviteLimit({ plan: "plus", accountAgeDays: 7, acceptedShare: null, isConnectedRecipient: false })).toBe(
		PLUS_BASE,
	)
})

// a sender below a fifth accepted has their limit halved, and at the fifth it holds
test("the reputation factor halves a mostly declined or ignored sender", () => {
	expect(toInviteLimit({ plan: "free", accountAgeDays: 30, acceptedShare: 0.1, isConnectedRecipient: false })).toBe(
		Math.floor(FREE_BASE / 2),
	)
	expect(toInviteLimit({ plan: "free", accountAgeDays: 30, acceptedShare: 0.2, isConnectedRecipient: false })).toBe(
		FREE_BASE,
	)
	expect(toInviteLimit({ plan: "free", accountAgeDays: 30, acceptedShare: 1, isConnectedRecipient: false })).toBe(
		FREE_BASE,
	)
})

// both factors together still leave at least one invite a day, so a mistake is recoverable
test("both factors together never take an account below one", () => {
	// a young account with nothing accepted takes a fifth and then a half, floored at one
	const youngAndUnpopular = Math.max(1, Math.floor(FREE_BASE / 5 / 2))
	expect(toInviteLimit({ plan: "free", accountAgeDays: 1, acceptedShare: 0, isConnectedRecipient: false })).toBe(
		youngAndUnpopular,
	)
	expect(youngAndUnpopular).toBeGreaterThanOrEqual(1)
})

// a connected recipient doubles whatever the factors left
test("a connected recipient doubles the limit", () => {
	expect(toInviteLimit({ plan: "free", accountAgeDays: 30, acceptedShare: null, isConnectedRecipient: true })).toBe(
		FREE_BASE * 2,
	)
	// the doubling applies after the floor, so the most reduced account doubles too
	expect(toInviteLimit({ plan: "free", accountAgeDays: 1, acceptedShare: 0, isConnectedRecipient: true })).toBe(
		Math.max(1, Math.floor(FREE_BASE / 5 / 2)) * 2,
	)
})

// runs the calls with the pool's query swapped for a stub that counts its calls, and returns the count.
// the pool's own query comes back however the calls end
async function countAccessQueries(runCalls: () => Promise<unknown>): Promise<number> {
	const sentQueries = stubConnectionPool(() => [PLUS_USER_ACCESS_ROW])

	// run the calls, then put the pool's own query back
	try {
		await runCalls()
		return sentQueries.length
	} finally {
		restoreConnectionPool()
	}
}

// a topic page's permission checks each ask for the access row, and the request sends one read for every check
test("the access row is read once per request", async () => {
	let userAccessList: unknown[] = []
	const queryCount = await countAccessQueries(async () => {
		userAccessList = await runWithRequestMemo(() => Promise.all([1, 2, 3].map(() => loadUserAccess("user-1"))))
	})

	expect(queryCount).toBe(1)
	expect(userAccessList).toEqual(Array(3).fill({ isAdmin: false, plan: "plus", budgetOverrideCents: null }))
})

// the worker checks quotas outside any request, so each of its checks reads the row
test("the access row is read on every call outside a request", async () => {
	const queryCount = await countAccessQueries(async () => {
		await loadUserAccess("user-1")
		await loadUserAccess("user-1")
	})

	expect(queryCount).toBe(2)
})

// the daily suggestion limit allows the thirtieth suggestion and rejects the next
test("the daily suggestion limit allows up to 30 suggestions", async () => {
	// a plain user, and a rate limit window that returns the thirtieth hit, then the next
	const incrementRateLimitWindowSpy = spyOn(redisRateLimits, "incrementRateLimitWindow")
	const incrementDaySuggestionCountResults: boolean[] = []

	// count one suggestion for each hit, then check which suggestions were within the limit
	await countAccessQueries(async () => {
		for (const rateLimitWindowHit of [
			{ count: 30, resetAt: 0 },
			{ count: 31, resetAt: 0 },
		]) {
			incrementRateLimitWindowSpy.mockResolvedValueOnce(rateLimitWindowHit)
			incrementDaySuggestionCountResults.push(await incrementDaySuggestionCount("user-1"))
		}
	})
	expect(incrementDaySuggestionCountResults).toEqual([true, false])
})

// podcast episode cost counts in the month's spend beside scans and chat
test("monthly spend sums scans, chat, and episodes", async () => {
	const spendQueryRows = {
		accessRow: PLUS_USER_ACCESS_ROW,
		spendDollars: ["2.50", "1.25", "0.41"],
	}
	const monthlySpend = await withSpendQueryRows(spendQueryRows as SpendQueryRows, () => monthlySpendDollars("user-1"))
	expect(monthlySpend).toEqual({ scanDollars: 2.5, chatDollars: 1.25, podcastEpisodeDollars: 0.41 })
	expect(toSpendCents(monthlySpend)).toBe(416)
})

// the spend checks in one request share one set of month sums, and a write between them, such as a chat turn's spend
// row, makes the next read sum again
test("the month's spend is summed once per request until a write", async () => {
	// a sum returns no spend, and any other read returns the access row
	const sentQueries = stubConnectionPool(({ text }) => (text.includes("sum(") ? [["0"]] : [PLUS_USER_ACCESS_ROW]))
	const countSpendSums = (): number => sentQueries.filter((sentQuery) => sentQuery.text.includes("sum(")).length

	// read the spend through two cutoff checks and directly, then write and read again, all inside one request
	try {
		await runWithRequestMemo(async () => {
			await Promise.all([isMonthlyBudgetCutoffPassed("user-1", "spokenQuestions"), monthlySpendDollars("user-1")])
			await isMonthlyBudgetCutoffPassed("user-1", "manualScans")
			expect(countSpendSums()).toBe(3)

			// a spend row's insert clears the memo, so the next read sums the three tables again
			await db.execute(sql`insert into chat_turns default values`)
			await monthlySpendDollars("user-1")
			expect(countSpendSums()).toBe(6)
		})
	} finally {
		restoreConnectionPool()
	}
})

// an empty user id still filters each sum by that id, so it never sums every user's spend
test("the spend for an empty user id is filtered by that id", async () => {
	// send the three sums with an empty user id, then put the connection pool's own query back
	const sentQueries = stubConnectionPool(() => [["0"]])
	try {
		await loadSpendSince({ since: new Date("2026-10-01T00:00:00Z"), userId: "" })
	} finally {
		restoreConnectionPool()
	}

	// every sum is bound to the empty user id
	expect(sentQueries).toHaveLength(3)
	for (const sentQuery of sentQueries) {
		expect(sentQuery.values).toContain("")
	}
})

// a paid plan and an admin get full podcast episodes, and the free plan gets short ones
test("a paid plan and an admin get full episodes, and the free plan does not", async () => {
	const hasFullPodcastEpisodesFor = (accessRow: unknown[]): Promise<boolean> =>
		withSpendQueryRows({ accessRow, spendDollars: ["0", "0", "0"] }, () => hasFullPodcastEpisodes("user-1"))
	expect(await hasFullPodcastEpisodesFor(PLUS_USER_ACCESS_ROW)).toBe(true)
	expect(await hasFullPodcastEpisodesFor(FREE_USER_ACCESS_ROW)).toBe(false)
	expect(await hasFullPodcastEpisodesFor(ADMIN_USER_ACCESS_ROW)).toBe(true)
})
