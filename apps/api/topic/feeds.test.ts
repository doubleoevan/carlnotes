// feed tests for the rate-eligibility rule that the batched feed uses, and for the topic section ids that every
// replica shares through Redis
import { afterEach, expect, test } from "bun:test"
import type { visibilities } from "@carlnotes/contracts/enums"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import {
	canRateInFeed,
	clearSharedTopicFeedCaches,
	clearVisitorTopicCaches,
	readPublicSectionTopicIds,
	readVisitorTopicFeeds,
	toVisitorTopicPageKey,
} from "./feeds"

// put the pool and the Redis client back after each test
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
})

// a topic with just the fields canRateInFeed needs
function topic(ownerId: string, visibility: (typeof visibilities)[number]): Parameters<typeof canRateInFeed>[0] {
	return { id: "t1", ownerId, visibility }
}

// no memberships, the common case
const noMembers = new Set<string>()

// the owner can always rate their own topic, whatever its visibility or the subscriber set is
test("canRateInFeed lets the owner rate their own topic", () => {
	expect(canRateInFeed(topic("u1", "private"), "u1", new Set(), noMembers)).toBe(true)
	expect(canRateInFeed(topic("u1", "public"), "u1", new Set(), noMembers)).toBe(true)
})

// a non-owner can rate a public or invite topic only when the batched set marks them a subscriber
test("canRateInFeed lets a subscriber rate a public or invite topic", () => {
	// a subscription puts the topic id in the set
	expect(canRateInFeed(topic("owner", "public"), "u2", new Set(["t1"]), noMembers)).toBe(true)
	expect(canRateInFeed(topic("owner", "invite"), "u2", new Set(["t1"]), noMembers)).toBe(true)
	// not subscribed: the set does not contain the topic id
	expect(canRateInFeed(topic("owner", "public"), "u2", new Set(), noMembers)).toBe(false)
})

// a team member rates their team's topics like an owner, private ones included
test("canRateInFeed lets a team member rate a team topic of any visibility", () => {
	expect(canRateInFeed(topic("owner", "private"), "u2", new Set(), new Set(["t1"]))).toBe(true)
	expect(canRateInFeed(topic("owner", "public"), "u2", new Set(), new Set(["t1"]))).toBe(true)
})

// a private topic is only allowed to be rated by the owner, and a signed-out visitor is never allowed to rate
test("canRateInFeed rejects a private topic and a signed-out visitor", () => {
	// even if the subscriber set somehow has a user, a private topic cannot be rated without a role
	expect(canRateInFeed(topic("owner", "private"), "u2", new Set(["t1"]), noMembers)).toBe(false)
	// a signed-out visitor can be neither an owner, a member, nor a subscriber
	expect(canRateInFeed(topic("owner", "public"), null, new Set(), new Set(["t1"]))).toBe(false)
})

// two replicas share one Redis key, so the second reads the first's order without a query, and a featuring change
// deletes the key so both read the new order
test("two replicas read the same section order after a featuring change", async () => {
	// one Redis for both replicas, and a database whose featured order flips after the change
	stubRedisClient()
	let featuredTopicIdRows = [["t1"], ["t2"]]
	const sentQueries = stubConnectionPool((sentQuery) =>
		sentQuery.text.includes("is not null") ? featuredTopicIdRows : [["t3"]],
	)

	// the first replica loads the order from the database, and the second reads it from Redis
	const firstReplicaOrder = await readPublicSectionTopicIds()
	const secondReplicaOrder = await readPublicSectionTopicIds()
	expect(firstReplicaOrder).toEqual({ featuredIds: ["t1", "t2"], popularIds: ["t3"] })
	expect(secondReplicaOrder).toEqual(firstReplicaOrder)
	expect(sentQueries).toHaveLength(2)

	// the popular read is limited
	const popularQuery = sentQueries.find(({ text }) => text.includes("is null"))
	expect(popularQuery?.text).toContain("limit")
	expect(popularQuery?.values).toContain(50)

	// a featuring change deletes the key, so the next read on either replica loads the new order and the other shares it
	featuredTopicIdRows = [["t2"], ["t1"]]
	await clearSharedTopicFeedCaches()
	const secondReplicaNewOrder = await readPublicSectionTopicIds()
	const firstReplicaNewOrder = await readPublicSectionTopicIds()
	expect(secondReplicaNewOrder).toEqual({ featuredIds: ["t2", "t1"], popularIds: ["t3"] })
	expect(firstReplicaNewOrder).toEqual(secondReplicaNewOrder)
	expect(sentQueries).toHaveLength(4)
})

// the visitors' feed is built once per view per half minute, and a listing change clears both views with the section
// order
test("the visitors' feed is built once per view and cleared with the section order", async () => {
	// one Redis and a database with nothing in it
	stubRedisClient()
	const sentQueries = stubConnectionPool(() => [])

	// the first read builds the feed, and the second reads the copy
	await readVisitorTopicFeeds(false)
	const buildQueryCount = sentQueries.length
	await readVisitorTopicFeeds(false)
	expect(buildQueryCount).toBeGreaterThan(0)
	expect(sentQueries).toHaveLength(buildQueryCount)

	// the other view is its own copy, and a clearing rebuilds the first
	await readVisitorTopicFeeds(true)
	const bothViewsQueryCount = sentQueries.length
	expect(bothViewsQueryCount).toBeGreaterThan(buildQueryCount)
	await clearSharedTopicFeedCaches()
	await readVisitorTopicFeeds(false)
	expect(sentQueries.length).toBeGreaterThan(bothViewsQueryCount)
})

// a change always drops the topic's page copy, and drops the visitors' feeds only if the topic was or is public or the
// change released its feature order
test("clearVisitorTopicCaches drops the page copy always and the feeds only for a public or featured topic", async () => {
	// one Redis holding a topic's page copy and the feed views
	const storedValueByKey = stubRedisClient()
	stubConnectionPool(() => [])
	const fillCopies = async (): Promise<void> => {
		storedValueByKey.set(toVisitorTopicPageKey("t1"), "{}")
		await readVisitorTopicFeeds(false)
	}
	const hasFeedCopy = (): boolean => [...storedValueByKey.keys()].some((key) => key.startsWith("topic-feed:visitor"))

	// a change to a topic that stays private keeps the feed copy
	await fillCopies()
	const storedKeyCount = storedValueByKey.size
	await clearVisitorTopicCaches({ topicId: "t1", visibility: "private" })
	expect(storedValueByKey.has(toVisitorTopicPageKey("t1"))).toBe(false)
	expect(storedValueByKey.size).toBe(storedKeyCount - 1)

	// a change to a public topic, a topic made public, a topic made private, and a released feature order each drop the
	// feed copies too
	for (const clearVisitorTopicCachesOptions of [
		{ topicId: "t1", visibility: "public" },
		{ topicId: "t1", visibility: "public", previousVisibility: "invite" },
		{ topicId: "t1", visibility: "private", previousVisibility: "public" },
		{ topicId: "t1", visibility: "invite", isFeatureOrderReleased: true },
	] as const) {
		await fillCopies()
		await clearVisitorTopicCaches(clearVisitorTopicCachesOptions)
		expect(storedValueByKey.has(toVisitorTopicPageKey("t1"))).toBe(false)
		expect(hasFeedCopy()).toBe(false)
	}
})
