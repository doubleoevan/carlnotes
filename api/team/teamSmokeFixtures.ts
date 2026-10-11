// the team smoke's fixtures: the run id, the people and teams it seeds, the row reads every section shares, and
// the cleanup
import { PLANS } from "@shared/plans"
import { and, count, eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import { teamMembers, teams, teamTopics } from "../../db/schema/teams"
import { subscriptions, topics } from "../../db/schema/topics"
import { users } from "../../db/schema/users"

// the free plan's team member limit, which these fills sit exactly at
export const FREE_TEAM_MEMBER_LIMIT = PLANS.free.teamMemberLimit ?? 0

// one id per run, so a re-run's ids, names, and emails never collide with an earlier run's
export const runId = Date.now()

// every fixture id includes the run id
export const toId = (name: string): string => `smoke-${runId}-${name}`

// the people the scenarios need, created in one insert. the nine fillers pad the limit team to ten members
const personNames = [
	"owner",
	"creator",
	"joiner",
	"member",
	"hold-leader",
	"non-member",
	"leader-a",
	"leader-b",
	"other-leader",
	"member-gone",
	"member-kept",
	"limit-leader",
	"limit-joiner",
	...Array.from({ length: FREE_TEAM_MEMBER_LIMIT - 1 }, (_, index) => `filler-${index}`),
]

// the seeded teams
const teamNames = [
	"team-hold",
	"team-limit",
	"team-roles",
	"team-del",
	"team-detach-a",
	"team-detach-b",
	"team-detach-c",
	"team-multi-d",
	"team-multi-e",
]

/** Creates the users, teams, memberships, topics, shares, and the owner's own subscription row. */
export async function seedFixtures(): Promise<void> {
	// the people, one row each with the run id in every unique column
	await db.insert(users).values(
		personNames.map((name) => ({
			id: toId(name),
			name,
			email: `smoke-${runId}-${name}@carlnotes.test`,
			username: `smoke-${runId}-${name}`,
			usernameNormalized: `smoke${runId}${name}`.replaceAll("-", ""),
		})),
	)

	// the teams, each named with the run id so the case-insensitive unique name index never collides
	await db.insert(teams).values(teamNames.map((name) => ({ id: toId(name), name: `smoke ${name} ${runId}` })))

	// the memberships. every owning team is led by the topics' owner, matching the app's own invariant
	await db.insert(teamMembers).values([
		{ teamId: toId("team-hold"), userId: toId("owner"), role: "leader" as const },
		{ teamId: toId("team-hold"), userId: toId("hold-leader"), role: "leader" as const },
		{ teamId: toId("team-hold"), userId: toId("member"), role: "member" as const },
		{ teamId: toId("team-roles"), userId: toId("leader-a"), role: "leader" as const },
		{ teamId: toId("team-roles"), userId: toId("leader-b"), role: "member" as const },
		{ teamId: toId("team-del"), userId: toId("owner"), role: "leader" as const },
		{ teamId: toId("team-detach-a"), userId: toId("owner"), role: "leader" as const },
		{ teamId: toId("team-detach-b"), userId: toId("owner"), role: "leader" as const },
		{ teamId: toId("team-detach-c"), userId: toId("other-leader"), role: "leader" as const },
		{ teamId: toId("team-multi-d"), userId: toId("owner"), role: "leader" as const },
		{ teamId: toId("team-multi-e"), userId: toId("other-leader"), role: "leader" as const },
		// the limit team at exactly the free plan's limit: one free-plan leader and the rest members
		{ teamId: toId("team-limit"), userId: toId("limit-leader"), role: "leader" as const },
		...Array.from({ length: FREE_TEAM_MEMBER_LIMIT - 1 }, (_, index) => ({
			teamId: toId("team-limit"),
			userId: toId(`filler-${index}`),
			role: "member" as const,
		})),
	])

	// the owner's topics: one owned by each team that needs one, and one that is only ever shared in
	await db.insert(topics).values([
		{ id: toId("topic-owned"), ownerId: toId("owner"), name: "smoke owned", teamId: toId("team-hold") },
		{ id: toId("topic-shared"), ownerId: toId("owner"), name: "smoke shared" },
		{ id: toId("topic-del"), ownerId: toId("owner"), name: "smoke del", teamId: toId("team-del") },
		{ id: toId("topic-detach"), ownerId: toId("owner"), name: "smoke detach", teamId: toId("team-detach-a") },
		{ id: toId("topic-multi"), ownerId: toId("owner"), name: "smoke multi", teamId: toId("team-multi-d") },
	])

	// the share rows. the succession pair is spaced apart, so the oldest owner-led team with it is deterministic
	await db.insert(teamTopics).values([
		{ teamId: toId("team-hold"), topicId: toId("topic-shared") },
		{ teamId: toId("team-del"), topicId: toId("topic-shared") },
		{ teamId: toId("team-detach-b"), topicId: toId("topic-detach"), createdAt: new Date(runId - 120000) },
		{ teamId: toId("team-detach-c"), topicId: toId("topic-detach"), createdAt: new Date(runId - 60000) },
		{ teamId: toId("team-multi-e"), topicId: toId("topic-multi") },
	])

	// the owner's own delivery subscription on the multi-team topic, the row scenario 8 proves survives
	await db.insert(subscriptions).values({ topicId: toId("topic-multi"), subscriberUserId: toId("owner") })
}

/** Logs a passing check, or throws an error so the run stops loudly at the first wrong result. */
export function check(isPassed: boolean, label: string): asserts isPassed {
	if (!isPassed) {
		throw new Error(`FAIL  ${label}`)
	}
	console.log(`PASS  ${label}`)
}

/** The topic row, freshly read so the stored count and the owning team reflect the latest write. */
export async function loadTopic(topicId: string): Promise<typeof topics.$inferSelect> {
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		throw new Error(`missing topic ${topicId}`)
	}
	return topic
}

/** One user's membership row on one team, or undefined with none. */
export async function loadMembership(userId: string, teamId: string): Promise<{ isActive: boolean } | undefined> {
	const [membership] = await db
		.select({ isActive: teamMembers.isActive })
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
	return membership
}

/** One user's subscription row on one topic, or undefined with none. */
export async function loadSubscription(
	userId: string,
	topicId: string,
): Promise<{ isActive: boolean; isEmailEnabled: boolean } | undefined> {
	const [subscription] = await db
		.select({ isActive: subscriptions.isActive, isEmailEnabled: subscriptions.isEmailEnabled })
		.from(subscriptions)
		.where(and(eq(subscriptions.topicId, topicId), eq(subscriptions.subscriberUserId, userId)))
	return subscription
}

/** Deletes everything the run created, then verifies nothing is left behind. */
export async function cleanUpFixtures(createdTeamIds: string[]): Promise<void> {
	// the seeded teams plus whatever createTeam made. a team row has no owner cascade, so it goes by id
	const teamIds = [...teamNames.map(toId), ...createdTeamIds]
	await db.delete(teams).where(inArray(teams.id, teamIds))

	// deleting the users cascades their topics, subscriptions, and memberships
	const personIds = personNames.map(toId)
	await db.delete(users).where(inArray(users.id, personIds))

	// the final count over every fixture table the deletes were meant to empty
	const [userRow] = await db.select({ count: count() }).from(users).where(inArray(users.id, personIds))
	const [teamRow] = await db.select({ count: count() }).from(teams).where(inArray(teams.id, teamIds))
	const [topicRow] = await db.select({ count: count() }).from(topics).where(inArray(topics.ownerId, personIds))
	const leftBehind = (userRow?.count ?? 0) + (teamRow?.count ?? 0) + (topicRow?.count ?? 0)
	// a leftover row is a cleanup bug worth failing over
	if (leftBehind > 0) {
		throw new Error(`cleanup left ${leftBehind} rows behind`)
	}
	console.log("\ncleanup removed every fixture row")
}
