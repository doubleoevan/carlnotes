// quota tests: the suggestion rate limit window key, the daily suggestion limit, each invite limit factor alone, the floor, and a connected recipient's doubled limit.
// the access row is read once per request, and on every call outside a request.
// the month's spend sums scans, chat, and podcast episodes.
// episodes stop recording at the plan's share of the monthly budget, and only a paid plan or an admin gets full episodes
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { PLANS } from "@shared/plans"
import { restoreConnectionPool, stubConnectionPool } from "./connectionPoolStub"
import {
	hasFullPodcastEpisodes,
	incrementDaySuggestionCount,
	isPodcastEpisodeBudgetShareExhausted,
	loadUserAccess,
	monthlySpendDollars,
	toInviteLimit,
	toMonthlySpendCents,
	toSuggestionRateLimitWindowKey,
} from "./quotas"
import * as redis from "./redis"
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

// the access row as the database returns it: a plain user on the plus plan with no budget override
const USER_ACCESS_ROW = ["user", "plus", null]

// runs the calls with the pool's query swapped for a stub that counts its calls, and returns the count.
// the pool's own query comes back however the calls end
async function countAccessQueries(runCalls: () => Promise<unknown>): Promise<number> {
	const sentQueries = stubConnectionPool(() => [USER_ACCESS_ROW])

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

// the daily suggestion limit allows the three hundredth suggestion, rejects the next, and allows one that Redis could not count
test("the daily suggestion limit allows up to 300 suggestions and allows one that Redis could not count", async () => {
	// a plain user, and a rate limit window that returns the three hundredth hit, the next, and no count
	const incrementRateLimitWindowSpy = spyOn(redis, "incrementRateLimitWindow")
	const incrementDaySuggestionCountResults: boolean[] = []

	// count one suggestion for each hit, then check which suggestions were within the limit
	await countAccessQueries(async () => {
		for (const rateLimitWindowHit of [{ count: 300, resetAt: 0 }, { count: 301, resetAt: 0 }, null]) {
			incrementRateLimitWindowSpy.mockResolvedValueOnce(rateLimitWindowHit)
			incrementDaySuggestionCountResults.push(await incrementDaySuggestionCount("user-1"))
		}
	})
	expect(incrementDaySuggestionCountResults).toEqual([true, false, true])
})

// the rows that the podcast episode checks read. the stub picks each row by a pattern in the query's SQL
type PodcastEpisodeQueryRows = {
	accessRow: unknown[]
	spendDollars: [string, string, string]
}

// runs the calls with the connection pool's query swapped for a stub that returns the given podcast episode query rows.
// the connection pool's own query is put back no matter how the calls end
async function withPodcastEpisodeQueryRows<Result>(
	podcastEpisodeQueryRows: PodcastEpisodeQueryRows,
	runCalls: () => Promise<Result>,
): Promise<Result> {
	const [scanDollars, chatDollars, podcastEpisodeDollars] = podcastEpisodeQueryRows.spendDollars
	const spendSums = [
		{ fromClause: `from "scans"`, dollars: scanDollars },
		{ fromClause: `from "chat_turns"`, dollars: chatDollars },
		{ fromClause: `from "episodes"`, dollars: podcastEpisodeDollars },
	]

	// return one table's spend sum for a sum, and the access row for anything else
	stubConnectionPool(({ text: queryText }) => {
		if (queryText.includes("sum(")) {
			const spendSumDollars = spendSums.find(({ fromClause }) => queryText.includes(fromClause))?.dollars ?? "0"
			return [[spendSumDollars]]
		}
		return [podcastEpisodeQueryRows.accessRow]
	})

	// run the calls, then put the connection pool's own query back
	try {
		return await runCalls()
	} finally {
		restoreConnectionPool()
	}
}

// podcast episode cost counts in the month's spend beside scans and chat
test("monthly spend sums scans, chat, and episodes", async () => {
	const podcastEpisodeQueryRows = {
		accessRow: USER_ACCESS_ROW,
		spendDollars: ["2.50", "1.25", "0.41"],
	}
	const monthlySpend = await withPodcastEpisodeQueryRows(podcastEpisodeQueryRows as PodcastEpisodeQueryRows, () =>
		monthlySpendDollars("user-1"),
	)
	expect(monthlySpend).toEqual({ scanDollars: 2.5, chatDollars: 1.25, podcastEpisodeDollars: 0.41 })
	expect(toMonthlySpendCents(monthlySpend)).toBe(416)
})

// a plus user's budget is 1500 cents, so podcast episodes stop recording at 1200 cents of spend and not one cent before.
// a free user's budget is 300 cents, so podcast episodes stop recording at 150 cents
test("episodes stop recording at 80 percent of a paid budget and 50 percent of a free one", async () => {
	const isExhaustedAt = (plan: string, scanDollars: string): Promise<boolean> =>
		withPodcastEpisodeQueryRows({ accessRow: ["user", plan, null], spendDollars: [scanDollars, "0", "0"] }, () =>
			isPodcastEpisodeBudgetShareExhausted("user-1"),
		)
	expect(await isExhaustedAt("plus", "11.99")).toBe(false)
	expect(await isExhaustedAt("plus", "12.00")).toBe(true)
	expect(await isExhaustedAt("plus", "14.00")).toBe(true)
	expect(await isExhaustedAt("free", "1.49")).toBe(false)
	expect(await isExhaustedAt("free", "1.50")).toBe(true)
})

// a paid plan and an admin get full podcast episodes, and the free plan gets short ones
test("a paid plan and an admin get full episodes, and the free plan does not", async () => {
	const hasFullPodcastEpisodesFor = (accessRow: unknown[]): Promise<boolean> =>
		withPodcastEpisodeQueryRows({ accessRow, spendDollars: ["0", "0", "0"] }, () => hasFullPodcastEpisodes("user-1"))
	expect(await hasFullPodcastEpisodesFor(["user", "plus", null])).toBe(true)
	expect(await hasFullPodcastEpisodesFor(["user", "free", null])).toBe(false)
	expect(await hasFullPodcastEpisodesFor(["admin", "free", null])).toBe(true)
})
