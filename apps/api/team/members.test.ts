// team membership tests: the subscriptions a leaving or deleting member keeps on the team's topics, and the visitor
// page copies a membership change clears
import { afterEach, expect, test } from "bun:test"
import { db } from "@carlnotes/db"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { toVisitorProfilePageKey, toVisitorTeamPageKey } from "@carlnotes/db/visitorPageCaches"
import { deactivateTeamTopicSubscriptions, removeTeamMember, setTeamMemberRole } from "./members"

// put the connection pool's own query and the Redis client back after each test
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
})

// the team's page and the member's profile list the member's role
test("a leader's role change for a member clears the team's page copy and the member's profile copy", async () => {
	// every membership read finds a leader, so the acting leader may change the role and the team keeps a leader
	stubConnectionPool(({ text }) => (text.startsWith("select") ? [["leader"]] : []))
	const storedValueByKey = stubRedisClient()
	storedValueByKey.set(toVisitorTeamPageKey("team-1"), "{}")
	storedValueByKey.set(toVisitorProfilePageKey("member-1"), "{}")
	storedValueByKey.set(toVisitorTeamPageKey("team-2"), "{}")

	// the copies that show the membership go, and another team's stays
	expect(await setTeamMemberRole("leader-1", "team-1", "member-1", "leader")).toBe("saved")
	expect([...storedValueByKey.keys()]).toEqual([toVisitorTeamPageKey("team-2")])
})

// the topic read returns the team's one owned topic, and every other query returns no rows
test("deactivateTeamTopicSubscriptions leaves out the topics the member owns themself", async () => {
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith("select") && text.includes('from "topics"') ? [["topic-1", "weekly"]] : [],
	)
	await db.transaction((transaction) => deactivateTeamTopicSubscriptions(transaction, "team-1", ["owner-1"]))

	// the deactivation leaves out the member's own topics, beside the ones their other teams reach or own
	const deactivation = sentQueries.find(({ text }) => text.startsWith('update "subscriptions"'))
	expect(deactivation?.text).toContain('"topics"."owner_id" = $')
	expect(deactivation?.values).toContain("owner-1")
})

// the member's own news showed the team's topics, which the removal stops delivering to them
test("a member who leaves a team has their own news cleared", async () => {
	// every membership read finds a plain member, who may remove themself
	stubConnectionPool(({ text }) => (text.startsWith("select") ? [["member"]] : []))
	const storedValueByKey = stubRedisClient()
	storedValueByKey.set("own-news:member-1:week", "{}")
	storedValueByKey.set("own-news:member-2:week", "{}")

	// the leaving member's own news goes, and another member's stays
	expect(await removeTeamMember("member-1", "team-1", "member-1")).toBe("removed")
	expect([...storedValueByKey.keys()]).toEqual(["own-news:member-2:week"])
})
