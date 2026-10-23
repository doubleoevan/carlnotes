// a topic's batched finding permissions: two reads however many topics, none for a visitor, and the rate and bookmark rules
import { afterEach, expect, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { loadTopicFindingPermissions } from "./findingPermissions"

// put the connection pool's own query back after each test
afterEach(restoreConnectionPool)

// three topics: one the user has a role on, a public one they subscribe to, and a private one they subscribe to
const TOPIC_ROWS = [
	{ id: "topic-role", visibility: "private" },
	{ id: "topic-subscribed", visibility: "public" },
	{ id: "topic-private-subscribed", visibility: "private" },
] as const

test("a visitor may rate and bookmark nothing, and nothing is read", async () => {
	const sentQueries = stubConnectionPool()
	const topicFindingPermissions = await loadTopicFindingPermissions(null, [...TOPIC_ROWS])
	expect(
		[...topicFindingPermissions.values()].every(
			(findingPermissions) => !findingPermissions.canRate && !findingPermissions.canBookmark,
		),
	).toBe(true)
	expect(sentQueries).toHaveLength(0)
})

test("a role allows both, and a subscription allows rating on a topic whose subscribers may rate", async () => {
	// the role read returns the first topic, and the subscription read the other two
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "subscriptions"') ? [["topic-subscribed"], ["topic-private-subscribed"]] : [["topic-role"]],
	)
	const topicFindingPermissions = await loadTopicFindingPermissions("user-1", [...TOPIC_ROWS])

	// one read for the roles and one for the subscriptions, however many topics
	expect(sentQueries).toHaveLength(2)
	expect(Object.fromEntries(topicFindingPermissions)).toEqual({
		"topic-role": { canRate: true, canBookmark: true },
		"topic-subscribed": { canRate: true, canBookmark: false },
		"topic-private-subscribed": { canRate: false, canBookmark: false },
	})
})
