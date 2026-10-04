// quota tests: the suggestion rate limit window key, the daily suggestion limit, each invite limit factor alone, the floor, and a connected recipient's doubled limit.
// the access row is read once per request, and on every call outside a request.
// the month's spend sums scans, chat, and podcast episodes.
// episodes stop rendering at 80 percent of the monthly budget, and after the first episode of a topic on the free plan
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { PLANS } from "@shared/plans"
import { connectionPool } from "./index"
import {
	canRenderPodcastEpisode,
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
	const poolQuery = connectionPool.query
	let queryCount = 0
	connectionPool.query = (() => {
		queryCount += 1
		return Promise.resolve({ rows: [USER_ACCESS_ROW], fields: [] })
	}) as unknown as typeof connectionPool.query

	// run the calls, then put the pool's own query back
	try {
		await runCalls()
		return queryCount
	} finally {
		connectionPool.query = poolQuery
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
	podcastEpisodeCount: number
}

// runs the calls with the connection pool's query swapped for a stub that returns the given podcast episode query rows.
// the connection pool's own query is put back no matter how the calls end
async function withPodcastEpisodeQueryRows<Result>(
	podcastEpisodeQueryRows: PodcastEpisodeQueryRows,
	runCalls: () => Promise<Result>,
): Promise<Result> {
	const originalConnectionPoolQuery = connectionPool.query
	const [scanDollars, chatDollars, podcastEpisodeDollars] = podcastEpisodeQueryRows.spendDollars
	const spendSums = [
		{ fromClause: `from "scans"`, dollars: scanDollars },
		{ fromClause: `from "chat_turns"`, dollars: chatDollars },
		{ fromClause: `from "episodes"`, dollars: podcastEpisodeDollars },
	]

	// return the podcast episode count for a count, one table's spend sum for a sum, and the access row for anything else
	connectionPool.query = ((queryConfig: string | { text: string }) => {
		const queryText = typeof queryConfig === "string" ? queryConfig : queryConfig.text
		if (queryText.includes("count(")) {
			return Promise.resolve({ rows: [[podcastEpisodeQueryRows.podcastEpisodeCount]], fields: [] })
		}

		// return the spend sum of the table that the query reads
		if (queryText.includes("sum(")) {
			const spendSumDollars = spendSums.find(({ fromClause }) => queryText.includes(fromClause))?.dollars ?? "0"
			return Promise.resolve({ rows: [[spendSumDollars]], fields: [] })
		}
		return Promise.resolve({ rows: [podcastEpisodeQueryRows.accessRow], fields: [] })
	}) as unknown as typeof connectionPool.query

	// run the calls, then put the connection pool's own query back
	try {
		return await runCalls()
	} finally {
		connectionPool.query = originalConnectionPoolQuery
	}
}

// podcast episode cost counts in the month's spend beside scans and chat
test("monthly spend sums scans, chat, and episodes", async () => {
	const podcastEpisodeQueryRows = {
		accessRow: USER_ACCESS_ROW,
		spendDollars: ["2.50", "1.25", "0.41"],
		podcastEpisodeCount: 0,
	}
	const monthlySpend = await withPodcastEpisodeQueryRows(podcastEpisodeQueryRows as PodcastEpisodeQueryRows, () =>
		monthlySpendDollars("user-1"),
	)
	expect(monthlySpend).toEqual({ scanDollars: 2.5, chatDollars: 1.25, podcastEpisodeDollars: 0.41 })
	expect(toMonthlySpendCents(monthlySpend)).toBe(416)
})

// a plus user's budget is 1500 cents, so podcast episodes stop rendering at 1200 cents of spend and not one cent before
test("episodes stop rendering at 80 percent of the monthly budget", async () => {
	const toPodcastEpisodeQueryRows = (scanDollars: string): PodcastEpisodeQueryRows => ({
		accessRow: USER_ACCESS_ROW,
		spendDollars: [scanDollars, "0", "0"],
		podcastEpisodeCount: 0,
	})
	expect(
		await withPodcastEpisodeQueryRows(toPodcastEpisodeQueryRows("11.99"), () =>
			isPodcastEpisodeBudgetShareExhausted("user-1"),
		),
	).toBe(false)
	expect(
		await withPodcastEpisodeQueryRows(toPodcastEpisodeQueryRows("12.00"), () =>
			isPodcastEpisodeBudgetShareExhausted("user-1"),
		),
	).toBe(true)
	expect(
		await withPodcastEpisodeQueryRows(toPodcastEpisodeQueryRows("14.00"), () =>
			isPodcastEpisodeBudgetShareExhausted("user-1"),
		),
	).toBe(true)
})

// a topic whose owner is on a paid plan always renders, and a topic on the free plan renders only its first episode
test("a paid plan always renders an episode, and a topic on the free plan renders only its first", async () => {
	const topic = { id: "topic-1", ownerId: "user-1" }
	const toPodcastEpisodeQueryRows = (plan: string, podcastEpisodeCount: number): PodcastEpisodeQueryRows => ({
		accessRow: ["user", plan, null],
		spendDollars: ["0", "0", "0"],
		podcastEpisodeCount,
	})

	// a paid plan renders with podcast episodes already published, and a free plan stops after its first episode
	expect(
		await withPodcastEpisodeQueryRows(toPodcastEpisodeQueryRows("plus", 5), () => canRenderPodcastEpisode(topic)),
	).toBe(true)
	expect(
		await withPodcastEpisodeQueryRows(toPodcastEpisodeQueryRows("free", 0), () => canRenderPodcastEpisode(topic)),
	).toBe(true)
	expect(
		await withPodcastEpisodeQueryRows(toPodcastEpisodeQueryRows("free", 1), () => canRenderPodcastEpisode(topic)),
	).toBe(false)

	// an admin on the free plan always renders
	const adminPodcastEpisodeQueryRows: PodcastEpisodeQueryRows = {
		accessRow: ["admin", "free", null],
		spendDollars: ["0", "0", "0"],
		podcastEpisodeCount: 3,
	}
	expect(await withPodcastEpisodeQueryRows(adminPodcastEpisodeQueryRows, () => canRenderPodcastEpisode(topic))).toBe(
		true,
	)
})
