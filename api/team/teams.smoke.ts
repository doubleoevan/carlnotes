// a live smoke test for the team lifecycle
// run it with: doppler run -- bun api/team/teams.smoke.ts. needs Doppler secrets
import { PLANS } from "@shared/plans"
import { and, count, eq, inArray } from "drizzle-orm"
import { connectionPool, db } from "../../db"
import { subscriptions, teamMembers, teams, teamTopics, topicEmailSends, topics, users } from "../../db/schema"
import { isLeaderRole } from "../authorization"
import { canSeeTopic, toTopicRole } from "../topic/permissions"
import { updateTopicSubscriberCount } from "../topic/subscriberCounts"
import {
	approveJoinTeamRequest,
	deleteJoinTeamRequest,
	joinTeam,
	removeTeamMember,
	requestToJoinTeam,
	setTeamMemberRole,
	toTeamRole,
} from "./members"
import { createTeam, deleteTeam, removeTopicFromTeam } from "./teams"

// the free plan's team member limit, which these fills sit exactly at
const FREE_TEAM_MEMBER_LIMIT = PLANS.free.teamMemberLimit ?? 0

// one id per run, so a re-run's ids, names, and emails never collide with an earlier run's
const runId = Date.now()

// every fixture id includes the run id
const toId = (name: string): string => `smoke-${runId}-${name}`

// the people the scenarios need, created in one insert. the nine fillers pad the limit team to ten members
const personNames = [
	"owner",
	"creator",
	"joiner",
	"member",
	"hold-leader",
	"outsider",
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

// create the users, teams, memberships, topics, shares, and the owner's own subscription row
async function seedFixtures(): Promise<void> {
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

	// the share rows. the succession pair is spaced apart so the oldest owner-led team with it is deterministic
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

// 1. createTeam makes the creator the leader, and a same-name create loses to the case-insensitive unique index
async function checkCreateTeam(createdTeamIds: string[]): Promise<void> {
	console.log("\n=== 1. createTeam ===")
	// the first create wins the name
	const created = await createTeam(toId("creator"), { name: `Smoke Created ${runId}`, topicIds: [] })
	check(created.status === "created", "createTeam answers created")
	createdTeamIds.push(created.teamId)

	// the creator holds the leader role on the new team
	const [membership] = await db
		.select({ role: teamMembers.role })
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, created.teamId), eq(teamMembers.userId, toId("creator"))))
	check(membership !== undefined && isLeaderRole(membership.role), "the creator is the new team's leader")

	// the same name in a different case returns name-taken
	const retaken = await createTeam(toId("creator"), { name: `SMOKE CREATED ${runId}`, topicIds: [] })
	check(retaken.status === "name-taken", "a same-name create returns name-taken")
}

// 2. joining fans out one subscription with email off per held topic, counted, with no email send recorded
async function checkJoinFanOut(): Promise<void> {
	console.log("\n=== 2. joinTeam fan-out ===")
	check(await joinTeam(toId("joiner"), toId("team-hold"), null), "joinTeam answers true under the limit")

	// one subscription with email off per held topic: the owned topic and the shared-in one
	for (const topicName of ["topic-owned", "topic-shared"]) {
		const subscription = await loadSubscription(toId("joiner"), toId(topicName))
		check(subscription?.isActive === true, `${topicName}: the joiner's subscription is active`)
		check(subscription?.isEmailEnabled === false, `${topicName}: the joiner's subscription has email off`)
		// the stored count includes the joiner and never the owner
		const topic = await loadTopic(toId(topicName))
		check(topic.subscriberCount === 1, `${topicName}: the subscriber count includes the joiner`)
	}

	// the join sent nothing
	const [sendRow] = await db
		.select({ count: count() })
		.from(topicEmailSends)
		.where(inArray(topicEmailSends.topicId, [toId("topic-owned"), toId("topic-shared")]))
	check((sendRow?.count ?? 0) === 0, "no topic email sends were written for the join")
}

// 3. unsubscribing from a team topic ends delivery while the membership keeps the role
async function checkUnsubscribeKeepsAccess(): Promise<void> {
	console.log("\n=== 3. unsubscribing keeps access ===")
	// deactivate the joiner's subscription the way the unsubscribe route does, then recount
	await db
		.update(subscriptions)
		.set({ isActive: false, isEmailEnabled: false })
		.where(and(eq(subscriptions.topicId, toId("topic-owned")), eq(subscriptions.subscriberUserId, toId("joiner"))))
	await updateTopicSubscriberCount(toId("topic-owned"))

	// the role still resolves through the membership, and the count no longer includes them
	const topic = await loadTopic(toId("topic-owned"))
	check((await toTopicRole(toId("joiner"), topic)) === "member", "toTopicRole still answers member")
	check(topic.subscriberCount === 0, "the recount no longer includes the unsubscribed member")
}

// 4. a team whose every leader is on the free plan rejects the join past its limit and writes nothing
async function checkMemberLimit(): Promise<void> {
	console.log("\n=== 4. member limit ===")
	check(
		(await joinTeam(toId("limit-joiner"), toId("team-limit"), null)) === false,
		"joinTeam answers false at the limit",
	)

	// the membership stayed at the limit and the rejected joiner gained no subscription
	const [memberRow] = await db
		.select({ count: count() })
		.from(teamMembers)
		.where(eq(teamMembers.teamId, toId("team-limit")))
	check((memberRow?.count ?? 0) === FREE_TEAM_MEMBER_LIMIT, "the team still has its limit of members")
	// a rejected join writes no subscription rows either
	const [subscriptionRow] = await db
		.select({ count: count() })
		.from(subscriptions)
		.where(eq(subscriptions.subscriberUserId, toId("limit-joiner")))
	check((subscriptionRow?.count ?? 0) === 0, "the rejected joiner gained no subscriptions")
}

// 5. the last leader can neither be demoted nor removed until another leader exists
async function checkLastLeaderRule(): Promise<void> {
	console.log("\n=== 5. last-leader rule ===")
	// alone, the leader is held in place
	const teamId = toId("team-roles")
	const demotedOnlyTeamLeader = await setTeamMemberRole(toId("leader-a"), teamId, toId("leader-a"), "member")
	check(demotedOnlyTeamLeader === "lastLeader", "demoting the only leader is rejected")
	const removedOnlyTeamLeader = await removeTeamMember(toId("leader-a"), teamId, toId("leader-a"))
	check(removedOnlyTeamLeader === "lastLeader", "removing the only leader is rejected")

	// a second leader unlocks the demotion
	check(
		(await setTeamMemberRole(toId("leader-a"), teamId, toId("leader-b"), "leader")) === "saved",
		"a second leader is promoted",
	)
	const demotedBeside = await setTeamMemberRole(toId("leader-a"), teamId, toId("leader-a"), "member")
	check(demotedBeside === "saved", "demoting a leader beside another is allowed")

	// restored to two leaders, removing one is allowed too
	check(
		(await setTeamMemberRole(toId("leader-b"), teamId, toId("leader-a"), "leader")) === "saved",
		"the leader is restored",
	)
	const removedBeside = await removeTeamMember(toId("leader-b"), teamId, toId("leader-a"))
	check(removedBeside === "removed", "removing a leader beside another is allowed")
}

// 6. deleting the team returns its owned topic to the creator and drops its share rows
async function checkTeamDeletion(): Promise<void> {
	console.log("\n=== 6. team deletion ===")
	check(
		(await deleteTeam(toId("owner"), toId("team-del"))).status === "deleted",
		"deleteTeam answers deleted for a leader alone on the team",
	)

	// a team with other members survives: leadership passes to the oldest member and the caller leaves
	const deleteTeamResult = await deleteTeam(toId("limit-leader"), toId("team-limit"))
	check(deleteTeamResult.status === "handedOver", "deleting a populated team hands it over instead")
	const [leaderRow] = await db
		.select({ count: count() })
		.from(teamMembers)
		.where(
			and(eq(teamMembers.teamId, toId("team-limit")), eq(teamMembers.role, "leader"), eq(teamMembers.isActive, true)),
		)
	check((leaderRow?.count ?? 0) === 1, "the surviving team has exactly one leader")
	check((await toTeamRole(toId("limit-leader"), toId("team-limit"))) === null, "the deleting leader left the team")

	// the owned topic returned through the set-null, and the share rows went with the team
	const topic = await loadTopic(toId("topic-del"))
	check(topic.teamId === null, "the owned topic returned to its creator")
	const [shareRow] = await db
		.select({ count: count() })
		.from(teamTopics)
		.where(eq(teamTopics.teamId, toId("team-del")))
	check((shareRow?.count ?? 0) === 0, "the deleted team's share rows are gone")
	// the team itself is gone with them
	const [teamRow] = await db
		.select({ count: count() })
		.from(teams)
		.where(eq(teams.id, toId("team-del")))
	check((teamRow?.count ?? 0) === 0, "the team row is gone")
}

// 7. when the owning team lets go, the oldest owner-led team with it becomes the owning team
async function checkRemoveSuccession(): Promise<void> {
	console.log("\n=== 7. detach succession ===")
	check(
		await removeTopicFromTeam(toId("owner"), toId("team-detach-a"), toId("topic-detach")),
		"removeTopicFromTeam answers true",
	)

	// the older owner-led team took over, consuming its own share row
	const topic = await loadTopic(toId("topic-detach"))
	check(topic.teamId === toId("team-detach-b"), "the oldest owner-led team with it became the owning team")
	const shareRows = await db
		.select({ teamId: teamTopics.teamId })
		.from(teamTopics)
		.where(eq(teamTopics.topicId, toId("topic-detach")))
	// only the share of the team the owner does not lead remains
	check(shareRows.length === 1, "the successor's share row is consumed")
	check(shareRows[0]?.teamId === toId("team-detach-c"), "the team the owner does not lead keeps only its share")
}

// 8. detaching deactivates the departed members' subscriptions, keeping the owner's and any covered member's
async function checkRemoveDeactivation(): Promise<void> {
	console.log("\n=== 8. detach deactivation ===")
	// join both members to the owning team, and the covered one to the other team with it as well
	check(await joinTeam(toId("member-gone"), toId("team-multi-d"), null), "the departing member joins the owning team")
	check(await joinTeam(toId("member-kept"), toId("team-multi-d"), null), "the covered member joins the owning team")
	check(
		await joinTeam(toId("member-kept"), toId("team-multi-e"), null),
		"the covered member joins the other team with it",
	)

	// detach from the owning team. no owner-led team with it remains, so the topic returns to its creator
	check(
		await removeTopicFromTeam(toId("owner"), toId("team-multi-d"), toId("topic-multi")),
		"removeTopicFromTeam answers true",
	)
	const topic = await loadTopic(toId("topic-multi"))
	check(topic.teamId === null, "no team the owner does not lead inherited the topic")

	// the departed member deactivated, the covered member and the owner both kept their subscriptions
	const goneSubscription = await loadSubscription(toId("member-gone"), toId("topic-multi"))
	check(goneSubscription?.isActive === false, "the departed member's subscription deactivated")
	const keptSubscription = await loadSubscription(toId("member-kept"), toId("topic-multi"))
	check(keptSubscription?.isActive === true, "the member covered by another team with it keeps theirs")
	const ownerSubscription = await loadSubscription(toId("owner"), toId("topic-multi"))
	check(ownerSubscription?.isActive === true, "the owner keeps theirs")
}

// 9. the topic role matrix, and the view gate on a private team topic
async function checkTopicRoleMatrix(): Promise<void> {
	console.log("\n=== 9. toTopicRole matrix ===")
	// the owned team topic and the shared-in one, read fresh
	const ownedTopic = await loadTopic(toId("topic-owned"))
	const sharedTopic = await loadTopic(toId("topic-shared"))

	// the four role outcomes: owner over membership, leader, member, and nothing
	check((await toTopicRole(toId("owner"), ownedTopic)) === "owner", "the owner outranks their team membership")
	check((await toTopicRole(toId("hold-leader"), ownedTopic)) === "leader", "a leader of the owning team answers leader")
	check((await toTopicRole(toId("member"), sharedTopic)) === "member", "a member of a shared-in team answers member")
	check((await toTopicRole(toId("outsider"), ownedTopic)) === null, "a non-member answers null")

	// the private team topic opens to a member and stays closed to an outsider
	check(await canSeeTopic(toId("member"), ownedTopic), "a member sees the private team topic")
	check((await canSeeTopic(toId("outsider"), ownedTopic)) === false, "an outsider never sees it")
}

// 10
async function checkJoinRequests(): Promise<void> {
	console.log("\n=== 10. join requests ===")
	// the ask writes the inactive row, and the requester still holds no topic role
	check(await requestToJoinTeam(toId("outsider"), toId("team-hold")), "requestToJoinTeam answers true")
	const requestRow = await loadMembership(toId("outsider"), toId("team-hold"))
	check(requestRow?.isActive === false, "the request row is a member that is not active")
	check(
		(await toTopicRole(toId("outsider"), await loadTopic(toId("topic-owned")))) === null,
		"the request grants nothing",
	)

	// taking it back deletes the row, and a fresh ask writes it again
	await deleteJoinTeamRequest(toId("outsider"), toId("team-hold"))
	check((await loadMembership(toId("outsider"), toId("team-hold"))) === undefined, "the withdrawn request is gone")
	check(await requestToJoinTeam(toId("outsider"), toId("team-hold")), "a fresh ask writes the row again")

	// only a leader admits, and never someone who did not ask
	check(
		(await approveJoinTeamRequest(toId("member"), toId("team-hold"), toId("outsider"))) === "forbidden",
		"a member cannot admit",
	)
	check(
		(await approveJoinTeamRequest(toId("hold-leader"), toId("team-hold"), toId("joiner"))) === "forbidden",
		"someone who never asked cannot be admitted",
	)

	// the leader's admission activates the row and writes the subscriptions with email off a join gets
	check(
		(await approveJoinTeamRequest(toId("hold-leader"), toId("team-hold"), toId("outsider"))) === "joined",
		"the leader admits the requester",
	)
	const admittedRow = await loadMembership(toId("outsider"), toId("team-hold"))
	check(admittedRow?.isActive === true, "the admitted row is active")
	const subscription = await loadSubscription(toId("outsider"), toId("topic-owned"))
	check(
		subscription?.isActive === true && subscription.isEmailEnabled === false,
		"the admission wrote the subscription with email off",
	)
}

// log a passing check, or throw an error so the run stops loudly at the first wrong answer
function check(isPassed: boolean, label: string): asserts isPassed {
	if (!isPassed) {
		throw new Error(`FAIL  ${label}`)
	}
	console.log(`PASS  ${label}`)
}

// the topic row, freshly read so the stored count and the owning team reflect the latest write
async function loadTopic(topicId: string): Promise<typeof topics.$inferSelect> {
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		throw new Error(`missing topic ${topicId}`)
	}
	return topic
}

// one user's membership row on one team, or undefined with none
async function loadMembership(userId: string, teamId: string): Promise<{ isActive: boolean } | undefined> {
	const [membership] = await db
		.select({ isActive: teamMembers.isActive })
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId)))
	return membership
}

// one user's subscription row on one topic, or undefined with none
async function loadSubscription(
	userId: string,
	topicId: string,
): Promise<{ isActive: boolean; isEmailEnabled: boolean } | undefined> {
	const [subscription] = await db
		.select({ isActive: subscriptions.isActive, isEmailEnabled: subscriptions.isEmailEnabled })
		.from(subscriptions)
		.where(and(eq(subscriptions.topicId, topicId), eq(subscriptions.subscriberUserId, userId)))
	return subscription
}

// delete everything the run created, then verify nothing is left behind
async function cleanUpFixtures(createdTeamIds: string[]): Promise<void> {
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

// seed, run the scenarios in order, and always delete what the run created
async function smokeTest(): Promise<number> {
	// the ids createTeam makes, collected so cleanup can delete them beside the seeded teams
	const createdTeamIds: string[] = []
	try {
		await seedFixtures()
		// creation and membership: the create path, the join fan-out, and the boundaries on both
		await checkCreateTeam(createdTeamIds)
		await checkJoinFanOut()
		await checkUnsubscribeKeepsAccess()
		await checkMemberLimit()
		await checkLastLeaderRule()
		// the held topics: deletion, detachment, and the role results built on what remains
		await checkTeamDeletion()
		await checkRemoveSuccession()
		await checkRemoveDeactivation()
		await checkTopicRoleMatrix()
		await checkJoinRequests()
		// every check passed
		console.log("\n=== smoke PASSED ===")
		return 0
	} catch (error) {
		// the first failed check is caught and printed here, with the cleanup still running after it
		console.error(error)
		console.log("\n=== smoke FAILED ===")
		return 1
	} finally {
		await cleanUpFixtures(createdTeamIds)
	}
}

// run the smoke test, then close the pool so the process exits on its own
const exitCode = await smokeTest()
await connectionPool.end()
process.exitCode = exitCode
