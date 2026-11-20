// quota tests: the suggestion limit window and daily limit, the per-request access read, the billing provider, the
// regeneration quotas, and full podcast episodes
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { isOverageBillable } from "@carlnotes/contracts/plans"
import {
	ADMIN_USER_ACCESS_ROW,
	FREE_USER_ACCESS_ROW,
	PLUS_USER_ACCESS_ROW,
	restoreConnectionPool,
	stubConnectionPool,
} from "./connectionPoolStub"
import {
	hasFullPodcastEpisodes,
	incrementDaySuggestionCount,
	loadBillingAccess,
	loadDiscussionRegenerationQuota,
	loadTopicImageRegenerationQuota,
	loadUserAccess,
	toSuggestionRateLimitWindowKey,
} from "./quotas"
import { withSpendQueryRows } from "./quotaTestFixtures"
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

// a paid plan and an admin get full podcast episodes, and the free plan gets short ones
test("a paid plan and an admin get full episodes, and the free plan does not", async () => {
	const hasFullPodcastEpisodesFor = (accessRow: unknown[]): Promise<boolean> =>
		withSpendQueryRows({ accessRow, spendDollars: ["0", "0", "0"] }, () => hasFullPodcastEpisodes("user-1"))
	expect(await hasFullPodcastEpisodesFor(PLUS_USER_ACCESS_ROW)).toBe(true)
	expect(await hasFullPodcastEpisodesFor(FREE_USER_ACCESS_ROW)).toBe(false)
	expect(await hasFullPodcastEpisodesFor(ADMIN_USER_ACCESS_ROW)).toBe(true)
})
