// the team smoke's membership sections: creating a team, the join fan-out, unsubscribing, the member limit, the
// last-leader rule, and join requests
import { and, count, eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import { teamMembers } from "../../db/schema/teams"
import { subscriptions, topicEmailSends } from "../../db/schema/topics"
import { isLeaderRole } from "../authorization"
import { toTopicRole } from "../topic/permissions"
import { updateTopicSubscriberCount } from "../topic/subscriberCounts"
import {
	approveJoinTeamRequest,
	deleteJoinTeamRequest,
	joinTeam,
	removeTeamMember,
	requestToJoinTeam,
	setTeamMemberRole,
} from "./members"
import {
	check,
	FREE_TEAM_MEMBER_LIMIT,
	loadMembership,
	loadSubscription,
	loadTopic,
	runId,
	toId,
} from "./teamSmokeFixtures"
import { createTeam } from "./teams"

/** 1. createTeam makes the creator the leader, and a same-name create loses to the case-insensitive unique index. */
export async function checkCreateTeam(createdTeamIds: string[]): Promise<void> {
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

/** 2. Joining fans out one subscription with email off per held topic, counted, with no email send recorded. */
export async function checkJoinFanOut(): Promise<void> {
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

/** 3. Unsubscribing from a team topic ends delivery while the membership keeps the role. */
export async function checkUnsubscribeKeepsAccess(): Promise<void> {
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

/** 4. A team whose every leader is on the free plan rejects the join past its limit and writes nothing. */
export async function checkMemberLimit(): Promise<void> {
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

/** 5. The last leader can neither be demoted nor removed until another leader exists. */
export async function checkLastLeaderRule(): Promise<void> {
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

/** 10. A join request writes an inactive row, withdrawing deletes it, and only a leader admits the requester. */
export async function checkJoinRequests(): Promise<void> {
	console.log("\n=== 10. join requests ===")
	// the ask writes the inactive row, and the requester still holds no topic role
	check(await requestToJoinTeam(toId("non-member"), toId("team-hold")), "requestToJoinTeam answers true")
	const requestRow = await loadMembership(toId("non-member"), toId("team-hold"))
	check(requestRow?.isActive === false, "the request row is a member that is not active")
	check(
		(await toTopicRole(toId("non-member"), await loadTopic(toId("topic-owned")))) === null,
		"the request grants nothing",
	)

	// taking it back deletes the row, and a fresh ask writes it again
	await deleteJoinTeamRequest(toId("non-member"), toId("team-hold"))
	check((await loadMembership(toId("non-member"), toId("team-hold"))) === undefined, "the withdrawn request is gone")
	check(await requestToJoinTeam(toId("non-member"), toId("team-hold")), "a fresh ask writes the row again")

	// only a leader admits, and never someone who did not ask
	check(
		(await approveJoinTeamRequest(toId("member"), toId("team-hold"), toId("non-member"))) === "forbidden",
		"a member cannot admit",
	)
	check(
		(await approveJoinTeamRequest(toId("hold-leader"), toId("team-hold"), toId("joiner"))) === "forbidden",
		"someone who never asked cannot be admitted",
	)

	// the leader's admission activates the row and writes the subscriptions with email off a join gets
	check(
		(await approveJoinTeamRequest(toId("hold-leader"), toId("team-hold"), toId("non-member"))) === "joined",
		"the leader admits the requester",
	)
	const admittedRow = await loadMembership(toId("non-member"), toId("team-hold"))
	check(admittedRow?.isActive === true, "the admitted row is active")
	const subscription = await loadSubscription(toId("non-member"), toId("topic-owned"))
	check(
		subscription?.isActive === true && subscription.isEmailEnabled === false,
		"the admission wrote the subscription with email off",
	)
}
