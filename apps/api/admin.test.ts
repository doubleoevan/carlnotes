// admin tests for the contribution math that the totals summary reports, the self-demotion check, and the route that
// lists a topic's subscribers
import { afterEach, expect, test } from "bun:test"
import {
	ADMIN_USER_ACCESS_ROW,
	FREE_USER_ACCESS_ROW,
	restoreConnectionPool,
	type SentQuery,
	stubConnectionPool,
} from "@carlnotes/db/connectionPoolStub"
import { adminRoute, isSelfDemotion } from "./admin"
import { computeContributionCents } from "./adminConsole"
import { toSignedInApp } from "./testSession"

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
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
