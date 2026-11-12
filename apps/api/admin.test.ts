// admin tests for the contribution math that the totals summary reports, the self-demotion check, the route that
// lists a topic's subscribers, the mobile minimum version write, and the spend control settings read and save
import { afterEach, beforeEach, expect, test } from "bun:test"
import { db } from "@carlnotes/db"
import {
	ADMIN_USER_ACCESS_ROW,
	FREE_USER_ACCESS_ROW,
	restoreConnectionPool,
	type SentQuery,
	stubConnectionPool,
} from "@carlnotes/db/connectionPoolStub"
import {
	type DailySpendCutoffState,
	loadDailySpendCutoffState,
	toWaitingScanFilter,
} from "@carlnotes/db/dailySpendCutoffs"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { scans } from "@carlnotes/db/schema/scans"
import { count } from "drizzle-orm"
import { adminRoute, isSelfDemotion } from "./admin"
import { computeContributionCents } from "./adminConsole"
import { loadAdminDailySpendCutoffs } from "./spendControlSettings"
import { toSignedInApp } from "./testSession"

// each test writes through an in-memory Redis
beforeEach(() => {
	stubRedisClient()
})

// put the connection pool and Redis back after each test
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
})

// contribution is net revenue minus tracked variable cost minus the optional fixed-cost constant
test("computeContributionCents nets revenue against tracked cost and the fixed constant", () => {
	// revenue over cost yields a positive contribution. the fixed constant lowers it further
	expect(computeContributionCents(10_000, 3_000, 0)).toBe(7_000)
	expect(computeContributionCents(10_000, 3_000, 2_000)).toBe(5_000)
	// a negative result is preserved, not floored. tracked cost can exceed revenue
	expect(computeContributionCents(1_000, 3_000, 0)).toBe(-2_000)
})

// contribution is unavailable when Stripe net revenue could not be read
test("computeContributionCents is null when revenue is unavailable", () => {
	expect(computeContributionCents(null, 3_000, 0)).toBeNull()
})

// an admin removing their own admin role is rejected, so the platform can never be locked out of its last admin
test("isSelfDemotion rejects an admin demoting themselves, and nothing else", () => {
	expect(isSelfDemotion("u1", "u1", "user")).toBe(true)
	// promoting yourself and changing someone else's role are both fine
	expect(isSelfDemotion("u1", "u1", "admin")).toBe(false)
	expect(isSelfDemotion("u1", "u2", "user")).toBe(false)
	expect(isSelfDemotion("u1", "u2", "admin")).toBe(false)
})

// the rows the subscribers route reads: the user's access, the topic if it exists, and one subscriber
function toSubscribersRouteRows({ text, values }: SentQuery, { isTopicFound = true } = {}): unknown[][] {
	// the subscriber's account and subscription
	if (text.includes('from "subscriptions"')) {
		return [
			[
				"user-2",
				"reader",
				"generated",
				null,
				"reader@example.com",
				"plus",
				new Date("2026-08-01T12:00:00Z"),
				null,
				new Date("2026-10-01T12:00:00Z"),
				true,
				"3",
				"2026-10-20 09:00:00+00",
			],
		]
	}

	// the user's access row, and the topic's existence
	if (text.includes('from "users"')) {
		return values.includes("admin-1") ? [ADMIN_USER_ACCESS_ROW] : [FREE_USER_ACCESS_ROW]
	}
	return text.includes('from "topics"') && isTopicFound ? [["topic-1"]] : []
}

// read topic-1's subscribers as the given user, or as a signed-out visitor for null
async function readTopicSubscribers(userId: string | null): Promise<Response> {
	const app = userId ? toSignedInApp(adminRoute, userId) : adminRoute
	return await app.request("/admin/topics/topic-1/subscribers")
}

test("a signed-out visitor gets 401 and a non-admin gets 403, and neither reads a subscriber", async () => {
	const sentQueries = stubConnectionPool((sentQuery) => toSubscribersRouteRows(sentQuery))
	expect((await readTopicSubscribers(null)).status).toBe(401)
	expect((await readTopicSubscribers("user-1")).status).toBe(403)
	expect(sentQueries.some(({ text }) => text.includes('from "subscriptions"'))).toBe(false)
})

test("an admin gets 404 for a missing topic", async () => {
	stubConnectionPool((sentQuery) => toSubscribersRouteRows(sentQuery, { isTopicFound: false }))
	expect((await readTopicSubscribers("admin-1")).status).toBe(404)
})

// the list uses the subscriber count's rule. active, and never the owner's own subscription
test("an admin reads a topic's subscribers by the subscriber count's rule", async () => {
	const sentQueries = stubConnectionPool((sentQuery) => toSubscribersRouteRows(sentQuery))
	const response = await readTopicSubscribers("admin-1")
	expect(response.status).toBe(200)
	expect(await response.json()).toEqual({
		subscribers: [
			{
				userId: "user-2",
				username: "reader",
				avatarVersion: null,
				email: "reader@example.com",
				plan: "plus",
				signedUpAt: "2026-08-01T12:00:00.000Z",
				lastLoginAt: null,
				subscribedAt: "2026-10-01T12:00:00.000Z",
				isEmailEnabled: true,
				emailCount: 3,
				lastEmailedAt: "2026-10-20T09:00:00.000Z",
			},
		],
	})

	// the subscribers query filters by the active non-owner rule, and counts the topic's emails to each subscriber
	const subscribersQuery = sentQueries.find(({ text }) => text.includes('from "subscriptions"'))
	expect(subscribersQuery?.text).toContain('"subscriptions"."is_active" = $')
	expect(subscribersQuery?.text).toContain('is distinct from "topics"."owner_id"')
	expect(subscribersQuery?.text).toContain('from "topic_email_sends"')
})

// the mobile minimum version write: the access row for the gate, and nothing else
function toMinimumVersionRouteRows({ text, values }: SentQuery): unknown[][] {
	if (text.includes('from "users"')) {
		return values.includes("admin-1") ? [ADMIN_USER_ACCESS_ROW] : [FREE_USER_ACCESS_ROW]
	}
	return []
}

// save a minimum as the given user, or as a signed-out visitor for null
async function saveMinimumVersion(userId: string | null, platform: string, minimumVersion: unknown): Promise<Response> {
	const app = userId ? toSignedInApp(adminRoute, userId) : adminRoute
	return await app.request(`/admin/mobile-minimum-versions/${platform}`, {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ minimumVersion }),
	})
}

test("a visitor gets 401, a non-admin gets 403, and neither writes a minimum version", async () => {
	const sentQueries = stubConnectionPool(toMinimumVersionRouteRows)
	expect((await saveMinimumVersion(null, "ios", "1.2.0")).status).toBe(401)
	expect((await saveMinimumVersion("user-1", "ios", "1.2.0")).status).toBe(403)
	expect(sentQueries.some(({ text }) => text.includes("mobile_minimum_versions"))).toBe(false)
})

test("an admin saves a platform's minimum, and clears it with null", async () => {
	const sentQueries = stubConnectionPool(toMinimumVersionRouteRows)
	expect((await saveMinimumVersion("admin-1", "ios", "1.2.0")).status).toBe(200)
	expect(sentQueries.some(({ text }) => text.includes('insert into "mobile_minimum_versions"'))).toBe(true)
	expect((await saveMinimumVersion("admin-1", "android", null)).status).toBe(200)
	expect(sentQueries.some(({ text }) => text.includes('delete from "mobile_minimum_versions"'))).toBe(true)
})

test("an unknown platform and a version that is not dotted integers are rejected", async () => {
	stubConnectionPool(toMinimumVersionRouteRows)
	expect((await saveMinimumVersion("admin-1", "web", "1.2.0")).status).toBe(400)
	expect((await saveMinimumVersion("admin-1", "ios", "soon")).status).toBe(400)
})

// the spend control settings body with every setting left to its default and the switch off
const DEFAULT_SPEND_CONTROL_PAYLOAD = {
	podcastEpisodesCutoffDollars: null,
	scheduledScansCutoffDollars: null,
	chatCutoffDollars: null,
	firstScanDispatchLimit: null,
	hourlySignupAlertCount: null,
	isUnverifiedFirstScanLimitOn: false,
}

// save the spend control settings as the given user, or as a signed-out visitor for null
async function saveSpendControlSettings(userId: string | null, payload: unknown): Promise<Response> {
	const app = userId ? toSignedInApp(adminRoute, userId) : adminRoute
	return await app.request("/admin/spend-control-settings", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify(payload),
	})
}

// the inserts into the spend control settings table among the sent queries
function toSpendControlInserts(sentQueries: SentQuery[]): SentQuery[] {
	return sentQueries.filter(({ text }) => text.startsWith('insert into "spend_control_settings"'))
}

test("a visitor gets 401, a non-admin gets 403 on the console and the save, and neither reads or writes the settings", async () => {
	const sentQueries = stubConnectionPool(toMinimumVersionRouteRows)
	expect((await saveSpendControlSettings(null, DEFAULT_SPEND_CONTROL_PAYLOAD)).status).toBe(401)
	expect((await saveSpendControlSettings("user-1", DEFAULT_SPEND_CONTROL_PAYLOAD)).status).toBe(403)
	expect((await toSignedInApp(adminRoute, "user-1").request("/admin/console")).status).toBe(403)
	expect(sentQueries.some(({ text }) => text.includes("spend_control_settings"))).toBe(false)
})

test("an admin's save writes the overrides in cents, and an empty value clears its override", async () => {
	const sentQueries = stubConnectionPool(toMinimumVersionRouteRows)
	const payload = { ...DEFAULT_SPEND_CONTROL_PAYLOAD, scheduledScansCutoffDollars: 42.5, firstScanDispatchLimit: 0 }
	expect((await saveSpendControlSettings("admin-1", payload)).status).toBe(200)

	// the scheduled scans cutoff in cents, a dispatch limit of zero, and a null for each setting left empty
	const spendControlInserts = toSpendControlInserts(sentQueries)
	expect(spendControlInserts).toHaveLength(1)
	expect(spendControlInserts[0]?.values.slice(0, 7)).toEqual([1, null, 4250, null, 0, null, false])
})

test("invalid values are rejected and leave the row unchanged", async () => {
	const sentQueries = stubConnectionPool(toMinimumVersionRouteRows)
	const invalidPayloads = [
		{ ...DEFAULT_SPEND_CONTROL_PAYLOAD, podcastEpisodesCutoffDollars: 0 },
		{ ...DEFAULT_SPEND_CONTROL_PAYLOAD, scheduledScansCutoffDollars: -5 },
		{ ...DEFAULT_SPEND_CONTROL_PAYLOAD, chatCutoffDollars: 0 },
		{ ...DEFAULT_SPEND_CONTROL_PAYLOAD, firstScanDispatchLimit: -1 },
		{ ...DEFAULT_SPEND_CONTROL_PAYLOAD, firstScanDispatchLimit: 2.5 },
		{ ...DEFAULT_SPEND_CONTROL_PAYLOAD, hourlySignupAlertCount: 0 },
		{ ...DEFAULT_SPEND_CONTROL_PAYLOAD, isUnverifiedFirstScanLimitOn: "yes" },
	]
	for (const invalidPayload of invalidPayloads) {
		expect((await saveSpendControlSettings("admin-1", invalidPayload)).status).toBe(400)
	}
	expect(toSpendControlInserts(sentQueries)).toHaveLength(0)
})

test("a save clears the cached cutoff state, so the next read uses the saved settings", async () => {
	// the stored scheduled scans cutoff starts at 50 dollars, and the day's free-plan spend is 60
	let storedScheduledScansCutoffCents = 5_000
	stubConnectionPool((sentQuery) => {
		// the stored overrides row
		if (sentQuery.text.includes('from "spend_control_settings"')) {
			return [[null, storedScheduledScansCutoffCents, null, null, null, false]]
		}

		// the spend sums, with the day's spend in the scans sum
		if (sentQuery.text.includes("coalesce(sum(")) {
			return [[sentQuery.text.includes('from "scans"') ? "60" : "0"]]
		}
		return toMinimumVersionRouteRows(sentQuery)
	})

	// the first read passes the cutoff and is cached
	const firstCutoffState = await loadDailySpendCutoffState()
	expect(firstCutoffState).toMatchObject({ status: "loaded", settings: { scheduledScansCutoffCents: 5_000 } })

	// a save of 100 dollars, then a read that uses it
	storedScheduledScansCutoffCents = 10_000
	const payload = { ...DEFAULT_SPEND_CONTROL_PAYLOAD, scheduledScansCutoffDollars: 100 }
	expect((await saveSpendControlSettings("admin-1", payload)).status).toBe(200)
	const savedCutoffState = await loadDailySpendCutoffState()
	expect(savedCutoffState).toMatchObject({ status: "loaded", settings: { scheduledScansCutoffCents: 10_000 } })
})

test("the console's waiting scan count reads the waiting scan filter of the settings in effect", async () => {
	// an empty settings table, a day's free-plan spend of 150 dollars past the default cutoff, and three waiting scans
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes("coalesce(sum(")) {
			return [[text.includes('from "scans"') ? "150" : "0"]]
		}
		return text.startsWith("select count(*)") ? [[3]] : []
	})
	const dailySpendCutoffs = await loadAdminDailySpendCutoffs()

	// the spend, the count, and every cutoff passed, the chat cutoff at its amount
	expect(dailySpendCutoffs).toMatchObject({ freePlanSpendCents: 15_000, waitingScanCount: 3 })
	expect(dailySpendCutoffs.cutoffs.map((cutoff) => [cutoff.kind, cutoff.isPassed])).toEqual([
		["podcastEpisodes", true],
		["scheduledScans", true],
		["chat", true],
	])

	// the count's filter is the waiting scan filter for the loaded state at the default settings
	const readState: DailySpendCutoffState = {
		status: "loaded",
		freePlanSpendCents: 15_000,
		settings: {
			podcastEpisodesCutoffCents: 6_500,
			scheduledScansCutoffCents: 10_000,
			chatCutoffCents: 15_000,
			firstScanDispatchLimit: 5,
			hourlySignupAlertCount: 50,
			isUnverifiedFirstScanLimitOn: false,
		},
	}
	const waitingScanCountQuery = sentQueries.find(({ text }) => text.startsWith('select count(*) from "scans"'))
	const expectedCountSql = db.select({ count: count() }).from(scans).where(toWaitingScanFilter(readState)).toSQL().sql
	expect(waitingScanCountQuery?.text).toBe(expectedCountSql)
})
