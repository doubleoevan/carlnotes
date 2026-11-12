// quota tests: the suggestion limit window and daily limit, each invite limit factor with its floor and a connected
// recipient, the per-request access read, the month's spend and its per-request read, and full podcast episodes
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { isOverageBillable } from "@carlnotes/contracts/plans"
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
	loadBillingAccess,
	loadDiscussionRegenerationQuota,
	loadSpendSince,
	loadTopicImageRegenerationQuota,
	loadUserAccess,
	monthlySpendDollars,
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
	expect(userAccessList).toEqual(
		Array(3).fill({
			isAdmin: false,
			isAdminBlocked: false,
			plan: "plus",
			budgetOverrideCents: null,
			freeTopicLimit: 1,
		}),
	)
})

// the worker checks quotas outside any request, so each of its checks reads the row
test("the access row is read on every call outside a request", async () => {
	const queryCount = await countAccessQueries(async () => {
		await loadUserAccess("user-1")
		await loadUserAccess("user-1")
	})

	expect(queryCount).toBe(2)
})

// a monthly store subscription with a card reads its provider, and the provider keeps its daily limit hard
test("a store billing row reads its provider and bills no overage", async () => {
	stubConnectionPool(() => [["app_store", true, "monthly"]])
	try {
		// the row as read, and whether its overage is billable
		const billingAccess = await loadBillingAccess("user-1")
		expect(billingAccess).toEqual({ provider: "app_store", hasPaymentMethod: true, billingInterval: "monthly" })
		expect(isOverageBillable(billingAccess)).toBe(false)
	} finally {
		restoreConnectionPool()
	}
})

// a free user has no row, so no provider and nothing to bill
test("a user with no billing row reads no provider", async () => {
	stubConnectionPool(() => [])
	try {
		expect(await loadBillingAccess("user-1")).toEqual({
			provider: null,
			hasPaymentMethod: false,
			billingInterval: "monthly",
		})
	} finally {
		restoreConnectionPool()
	}
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

// podcast episode cost and topic image render cost count in the month's spend beside scans and chat
test("monthly spend sums scans, chat, episodes, and topic image renders", async () => {
	const spendQueryRows = {
		accessRow: PLUS_USER_ACCESS_ROW,
		spendDollars: ["2.50", "1.25", "0.41", "0.034"],
	}
	const monthlySpend = await withSpendQueryRows(spendQueryRows as SpendQueryRows, () => monthlySpendDollars("user-1"))
	expect(monthlySpend).toEqual({
		scanDollars: 2.5,
		chatDollars: 1.25,
		podcastEpisodeDollars: 0.41,
		personalSourcesDollars: 0,
		topicImageDollars: 0.034,
	})
	expect(toSpendCents(monthlySpend)).toBe(419)
})

// the regeneration count is the owner's regenerate rows this month against the plan's limit, and an admin is never short
test("the image regeneration quota counts this month's regenerate rows against the plan", async () => {
	// a count returns one row, and any other read returns the access row
	stubConnectionPool(({ text }) => (text.includes("count(") ? [["2"]] : [FREE_USER_ACCESS_ROW]))
	try {
		expect(await loadTopicImageRegenerationQuota("user-1")).toEqual({ used: 2, limit: 2, remaining: 0 })
	} finally {
		restoreConnectionPool()
	}

	// an admin's limit is the admin quota
	stubConnectionPool(({ text }) => (text.includes("count(") ? [["40"]] : [ADMIN_USER_ACCESS_ROW]))
	try {
		expect((await loadTopicImageRegenerationQuota("admin-1")).remaining).toBeGreaterThan(0)
	} finally {
		restoreConnectionPool()
	}
})

// a film image's regeneration is a regenerate row like a topic's, a podcast episode's, and a Topic Post's, and the
// count reads every one the user started
test("the image regeneration quota counts a user's regenerate rows whichever image they drew", async () => {
	const sentQueries = stubConnectionPool(({ text }) => (text.includes("count(") ? [["14"]] : [PLUS_USER_ACCESS_ROW]))
	try {
		expect(await loadTopicImageRegenerationQuota("user-1")).toEqual({ used: 14, limit: 15, remaining: 1 })
	} finally {
		restoreConnectionPool()
	}

	// the count filters by the user, the kind, and the month alone, never by the image a render drew
	const countQuery = sentQueries.find((sentQuery) => sentQuery.text.includes("count("))
	expect(countQuery?.text).toContain('from "topic_image_renders"')
	expect(countQuery?.values).toEqual(expect.arrayContaining(["user-1", "regenerate"]))
	for (const imageColumn of ["topic_podcast_episode_video_id", "podcast_episode_id", "topic_post_id"]) {
		expect(countQuery?.text).not.toContain(imageColumn)
	}
})

// a discussion's regenerations count against their own monthly limit, separate from the image limit, by plan
test("a person's discussion regenerations are counted against the plan's own limit", async () => {
	// two regenerations this month on the free plan, which allows two
	stubConnectionPool(({ text }) => (text.includes("count(") ? [["2"]] : [FREE_USER_ACCESS_ROW]))
	try {
		expect(await loadDiscussionRegenerationQuota("user-1")).toEqual({ used: 2, limit: 2, remaining: 0 })
	} finally {
		restoreConnectionPool()
	}

	// the same two on the plus plan leave eight, and the count reads the discussion rows
	const sentQueries = stubConnectionPool(({ text }) => (text.includes("count(") ? [["2"]] : [PLUS_USER_ACCESS_ROW]))
	try {
		expect(await loadDiscussionRegenerationQuota("user-1")).toEqual({ used: 2, limit: 10, remaining: 8 })
		expect(sentQueries.some((sentQuery) => sentQuery.text.includes('from "topic_post_discussions"'))).toBe(true)
	} finally {
		restoreConnectionPool()
	}
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
			expect(countSpendSums()).toBe(7)

			// a spend row's insert clears the memo, so the next read sums every spend table again
			await db.execute(sql`insert into chat_turns default values`)
			await monthlySpendDollars("user-1")
			expect(countSpendSums()).toBe(14)
		})
	} finally {
		restoreConnectionPool()
	}
})

// an empty user id still filters each sum by that id, so it never sums every user's spend
test("the spend for an empty user id is filtered by that id", async () => {
	// send each sum with an empty user id, then put the connection pool's own query back
	const sentQueries = stubConnectionPool(() => [["0"]])
	try {
		await loadSpendSince({ since: new Date("2026-10-01T00:00:00Z"), userId: "" })
	} finally {
		restoreConnectionPool()
	}

	// every sum is bound to the empty user id
	expect(sentQueries).toHaveLength(7)
	for (const sentQuery of sentQueries) {
		expect(sentQuery.values).toContain("")
	}
})

// a plan's spend sums only the users on that plan who are not admins, so a paid user's and an admin's spend stay out
test("the spend for a plan is filtered to that plan's users who are not admins", async () => {
	// send each sum for the free plan, then put the connection pool's own query back
	const sentQueries = stubConnectionPool(() => [["0"]])
	try {
		await loadSpendSince({ since: new Date("2026-10-01T00:00:00Z"), billedPlan: "free" })
	} finally {
		restoreConnectionPool()
	}

	// every sum keeps the billed users on the free plan and leaves out the admins
	expect(sentQueries).toHaveLength(7)
	for (const sentQuery of sentQueries) {
		expect(sentQuery.text).toContain('"users"."plan" = $')
		expect(sentQuery.text).toContain(`"users"."role" <> 'admin'`)
		expect(sentQuery.values).toContain("free")
	}
})

// a podcast episode film's cost adds to the podcast episode spend of its podcast episode's owner
test("the films' cost counts as podcast episode spend", async () => {
	// the podcast episode sum and the film sum each return a cost, and every other sum returns none
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "topic_podcast_episode_videos"')) {
			return [["0.25"]]
		}
		return [[text.includes('from "episodes"') ? "1.5" : "0"]]
	})

	// sum the month's spend for the owner
	try {
		const recordedSpend = await loadSpendSince({ since: new Date("2026-10-01T00:00:00Z"), userId: "user-1" })
		expect(recordedSpend.podcastEpisodeDollars).toBe(1.75)
	} finally {
		restoreConnectionPool()
	}

	// the film sum filters by the podcast episode's owner
	const filmSumQuery = sentQueries.find((sentQuery) => sentQuery.text.includes('from "topic_podcast_episode_videos"'))
	expect(filmSumQuery?.text).toContain('"episodes"."owner_id"')
	expect(filmSumQuery?.values).toContain("user-1")
})

// a paid plan and an admin get full podcast episodes, and the free plan gets short ones
test("a paid plan and an admin get full episodes, and the free plan does not", async () => {
	const hasFullPodcastEpisodesFor = (accessRow: unknown[]): Promise<boolean> =>
		withSpendQueryRows({ accessRow, spendDollars: ["0", "0", "0"] }, () => hasFullPodcastEpisodes("user-1"))
	expect(await hasFullPodcastEpisodesFor(PLUS_USER_ACCESS_ROW)).toBe(true)
	expect(await hasFullPodcastEpisodesFor(FREE_USER_ACCESS_ROW)).toBe(false)
	expect(await hasFullPodcastEpisodesFor(ADMIN_USER_ACCESS_ROW)).toBe(true)
})
