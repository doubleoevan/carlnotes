// recorded spend tests: the month's spend and its per-request read, the platform's own spend, and the user, plan, and
// film filters of each sum
import { expect, test } from "bun:test"
import { sql } from "drizzle-orm"
import { PLUS_USER_ACCESS_ROW, restoreConnectionPool, stubConnectionPool } from "./connectionPoolStub"
import { db } from "./index"
import { isMonthlyBudgetCutoffPassed } from "./monthlyBudgetCutoffs"
import { type SpendQueryRows, withSpendQueryRows } from "./quotaTestFixtures"
import { loadSpendSince, monthlySpendDollars, toSpendCents } from "./recordedSpend"
import { runWithRequestMemo } from "./requestMemo"

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
		otherDollars: 0,
		platformDollars: 0,
	})
	expect(toSpendCents(monthlySpend)).toBe(419)
})

// the platform's own cost must reach the day's total, and never a user's budget or a plan's cutoff
test("the platform's spend counts for every user together, and for no one user and no plan", async () => {
	// the spends table holds twenty cents that bill users and thirty cents with no user
	const since = new Date("2026-10-01T00:00:00Z")
	const sentQueries = stubConnectionPool(({ text }) => (text.includes('from "spends"') ? [["0.2", "0.3"]] : [["0"]]))
	const toSpendsQuery = (): string =>
		sentQueries.findLast((sentQuery) => sentQuery.text.includes('from "spends"'))?.text ?? ""
	try {
		// the sum across every user has both, and filters by no user
		const everyUserSpend = await loadSpendSince({ since })
		expect([everyUserSpend.otherDollars, everyUserSpend.platformDollars]).toEqual([0.2, 0.3])
		expect(toSpendCents(everyUserSpend)).toBe(50)
		expect(toSpendsQuery()).not.toContain('"spends"."user_id" =')

		// one user's sum and a plan's sum each keep a row only if its user matches, which a row with no user never does
		await loadSpendSince({ since, userId: "user-1" })
		expect(toSpendsQuery()).toContain('"spends"."user_id" = $')
		await loadSpendSince({ since, billedPlan: "free" })
		expect(toSpendsQuery()).toContain('"spends"."user_id" in (select')
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
			expect(countSpendSums()).toBe(8)

			// a spend row's insert clears the memo, so the next read sums every spend table again
			await db.execute(sql`insert into chat_turns default values`)
			await monthlySpendDollars("user-1")
			expect(countSpendSums()).toBe(16)
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
	expect(sentQueries).toHaveLength(8)
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
	expect(sentQueries).toHaveLength(8)
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
		if (text.includes('from "topic_videos"')) {
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
	const filmSumQuery = sentQueries.find((sentQuery) => sentQuery.text.includes('from "topic_videos"'))
	expect(filmSumQuery?.text).toContain('"episodes"."owner_id"')
	expect(filmSumQuery?.values).toContain("user-1")
})
