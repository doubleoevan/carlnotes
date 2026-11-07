// social limit tests: the daily write counts and their keys, the account signal weight's factors, and the user block
// and admin block filters
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { DAY_MS } from "@carlnotes/contracts/time"
import { restoreConnectionPool, stubConnectionPool } from "./connectionPoolStub"
import { hasUserBlockBetween, toNotAdminBlockedAuthorFilter, toNoUserBlockBetweenFilter } from "./contentFilters"
import { db } from "./index"
import { toAccountSignalWeight } from "./inviteLimits"
import * as redisRateLimits from "./redisRateLimits"
import { comments } from "./schema/social"
import { countSocialWriteToday, loadAccountSignalWeights } from "./socialLimits"

// put the spied Redis counter and the connection pool back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

test("a save counts in the user's UTC day against 200, whatever the account's age", async () => {
	// a counter that accepts every hit and records what it was asked
	const countRateLimitHit = spyOn(redisRateLimits, "countRateLimitHit").mockResolvedValue(true)
	expect(await countSocialWriteToday("user-1", "reaction")).toBe(true)
	expect(await countSocialWriteToday("user-1", "comment")).toBe(true)

	// each kind has its own key for the day, a day-long rate limit window, and the flat limit
	const today = new Date().toISOString().slice(0, 10)
	expect(countRateLimitHit.mock.calls.map(([options]) => options)).toEqual([
		{ key: `social-reaction:${today}:user-1`, rateLimitWindowMs: DAY_MS, limit: 200 },
		{ key: `social-comment:${today}:user-1`, rateLimitWindowMs: DAY_MS, limit: 200 },
	])
})

test("the save past the limit is rejected", async () => {
	spyOn(redisRateLimits, "countRateLimitHit").mockResolvedValue(false)
	expect(await countSocialWriteToday("user-1", "reaction")).toBe(false)
})

test("an account weighs a fifth in its first week and half with a low accepted share", () => {
	expect(toAccountSignalWeight({ accountAgeDays: 30, acceptedShare: null })).toBe(1)
	expect(toAccountSignalWeight({ accountAgeDays: 30, acceptedShare: 0.5 })).toBe(1)
	expect(toAccountSignalWeight({ accountAgeDays: 2, acceptedShare: null })).toBe(1 / 5)
	expect(toAccountSignalWeight({ accountAgeDays: 30, acceptedShare: 0.1 })).toBe(1 / 2)
	expect(toAccountSignalWeight({ accountAgeDays: 2, acceptedShare: 0.1 })).toBe(1 / 10)
})

test("the weights of many accounts load in two reads", async () => {
	// an account created a month ago and one created today, with no measured invitations
	const monthAgo = new Date(Date.now() - 30 * DAY_MS)
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "users"')
			? [
					["user-1", monthAgo],
					["user-2", new Date()],
				]
			: [],
	)
	const accountSignalWeights = await loadAccountSignalWeights(["user-1", "user-2"])
	expect(accountSignalWeights.get("user-1")).toBe(1)
	expect(accountSignalWeights.get("user-2")).toBe(1 / 5)
	expect(sentQueries).toHaveLength(2)
})

test("no accounts load no weights and send no query", async () => {
	const sentQueries = stubConnectionPool()
	expect((await loadAccountSignalWeights([])).size).toBe(0)
	expect(sentQueries).toHaveLength(0)
})

test("a block between two users is found in either direction", async () => {
	// one user block row whichever way the query names the pair
	const sentQueries = stubConnectionPool(() => [["user-2"]])
	expect(await hasUserBlockBetween("user-1", "user-2")).toBe(true)

	// the one query names both users as the blocker and as the blocked
	expect(sentQueries[0]?.text).toContain(
		'"user_blocks"."blocker_user_id" = $1 and "user_blocks"."blocked_user_id" = $2',
	)
	expect(sentQueries[0]?.text).toContain(
		'"user_blocks"."blocker_user_id" = $3 and "user_blocks"."blocked_user_id" = $4',
	)
	expect(sentQueries[0]?.values.slice(0, 4)).toEqual(["user-1", "user-2", "user-2", "user-1"])
})

test("no block row reads as no block", async () => {
	stubConnectionPool()
	expect(await hasUserBlockBetween("user-1", "user-2")).toBe(false)
})

test("the read filters pass a row with no author and hide a blocked or admin-blocked author", () => {
	// the filters as a comment read applies them
	const { sql: filterSql } = db
		.select({ id: comments.id })
		.from(comments)
		.where(toNoUserBlockBetweenFilter("user-1", comments.authorUserId))
		.toSQL()
	expect(filterSql).toContain('"comments"."author_user_id" is null or not exists')
	expect(filterSql).toContain('"user_blocks"."blocked_user_id" = "comments"."author_user_id"')
	expect(filterSql).toContain('"user_blocks"."blocker_user_id" = "comments"."author_user_id"')

	// an admin block is read off the author's own row
	const { sql: adminBlockSql } = db
		.select({ id: comments.id })
		.from(comments)
		.where(toNotAdminBlockedAuthorFilter(comments.authorUserId))
		.toSQL()
	expect(adminBlockSql).toContain('"users"."admin_blocked_at" is not null')
})
