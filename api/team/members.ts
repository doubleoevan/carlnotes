// team membership: who holds
import { PLANS, type Plan } from "@shared/plans"
import { and, count, eq, inArray, notInArray } from "drizzle-orm"
import { db } from "../../db"
import {
	chatRoomMentions,
	chatRoomMessages,
	subscriptions,
	teamMembers,
	teams,
	teamTopics,
	topics,
	users,
} from "../../db/schema"
import { isAdminRole } from "../authorization"
import { updateTopicSubscriberCount } from "../topic/subscriberCounts"

// the transaction shape the membership writes run inside
export type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0]

/**
 * The user's role on a team, or null for an outsider. The one team authority answer routes build on.
 */
export async function toTeamRole(userId: string | null, teamId: string): Promise<"leader" | "member" | null> {
	// a signed-out user is not a team member
	if (!userId) {
		return null
	}

	// the team membership row has the team role. only an active member can be a team member
	const [membership] = await db
		.select({ role: teamMembers.role })
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)))
		.limit(1)
	return membership?.role ?? null
}

/**
 * Join a user to the team, writing the membership and a non-active subscription per team topic in one transaction.
 * The invite acceptance and any later join path both come through here.
 */
export async function joinTeam(userId: string, teamId: string, invitedByUserId: string | null): Promise<boolean> {
	// the team member limit reads the best plan among the team's leaders
	const memberLimit = await teamMemberLimit(teamId)

	// the member limit check and the team membership write share one transaction.
	return db.transaction(async (transaction) => {
		const [memberCountRow] = await transaction
			.select({ count: count() })
			.from(teamMembers)
			.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.isActive, true)))
		if (memberLimit !== null && (memberCountRow?.count ?? 0) >= memberLimit) {
			return false
		}

		// the team membership and its delivery rows are written together, and a waiting request row activates
		await transaction
			.insert(teamMembers)
			.values({ teamId, userId, invitedByUserId })
			.onConflictDoUpdate({ target: [teamMembers.teamId, teamMembers.userId], set: { isActive: true } })
		// a non-active subscription per team topic puts the user in the team member's table without an email subscription
		await saveTeamTopicSubscriptions(transaction, [userId], await loadTeamTopics(transaction, teamId))
		return true
	})
}

/**
 * Ask to join the team, writes a team member row that isn't active for a team leader to toggle on.
 * False when there is no such team or the user already belongs, and a repeat ask is the same single row.
 */
export async function requestToJoinTeam(userId: string, teamId: string): Promise<boolean> {
	// the team must exist, and the user must not already be an active team member
	const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId))
	if (!team || (await toTeamRole(userId, teamId)) !== null) {
		return false
	}
	await db.insert(teamMembers).values({ teamId, userId, isActive: false }).onConflictDoNothing()
	return true
}

/**
 * Delete the user's join team request. Their non-active team membership row is deleted.
 */
export async function deleteJoinTeamRequest(userId: string, teamId: string): Promise<void> {
	await db
		.delete(teamMembers)
		.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId), eq(teamMembers.isActive, false)))
}

/**
 * A team leader can approve a join request by toggling the user's team member status to active.
 */
export async function approveJoinTeamRequest(
	teamId: string,
	teamUserId: string,
	joinUserId: string,
): Promise<"joined" | "forbidden" | "limited"> {
	// only a leader can approve a join request
	if ((await toTeamRole(teamUserId, teamId)) !== "leader") {
		return "forbidden"
	}

	// only someone who asked to join has a team member row that isn't active
	const [request] = await db
		.select({ userId: teamMembers.userId })
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, joinUserId), eq(teamMembers.isActive, false)))
	if (!request) {
		return "forbidden"
	}

	// accepting a join request activates the team member row or writes an error message if the team is at its limit
	return (await joinTeam(joinUserId, teamId, teamUserId)) ? "joined" : "limited"
}

// the topics the team has: its own plus the ones it shares
async function loadTeamTopics(
	transaction: DbTransaction,
	teamId: string,
): Promise<{ id: string; frequency: (typeof topics.$inferSelect)["frequency"] }[]> {
	// the topics the team owns and can edit
	const ownedTopicRows = await transaction
		.select({ id: topics.id, frequency: topics.frequency })
		.from(topics)
		.where(eq(topics.teamId, teamId))

	// the shared team topics that the team does not own and can't edit
	const sharedTopicRows = await transaction
		.select({ id: topics.id, frequency: topics.frequency })
		.from(teamTopics)
		.innerJoin(topics, eq(topics.id, teamTopics.topicId))
		.where(eq(teamTopics.teamId, teamId))
	return [...ownedTopicRows, ...sharedTopicRows]
}

/**
 * Subscribes team members to the team topics with email off.
 */
export async function saveTeamTopicSubscriptions(
	transaction: DbTransaction,
	userIds: string[],
	teamTopics: { id: string; frequency: (typeof topics.$inferSelect)["frequency"] }[],
): Promise<void> {
	// nothing to write with no members or no topics
	if (userIds.length === 0 || teamTopics.length === 0) {
		return
	}

	// every user-topic pair goes into one multi-row upsert instead of a round-trip each
	const topicRows = teamTopics.flatMap((teamTopic) =>
		userIds.map((userId) => ({
			topicId: teamTopic.id,
			subscriberUserId: userId,
			isEmailEnabled: false,
			frequency: teamTopic.frequency,
		})),
	)
	await transaction
		.insert(subscriptions)
		.values(topicRows)
		.onConflictDoUpdate({
			target: [subscriptions.topicId, subscriptions.subscriberUserId],
			set: { isActive: true },
		})

	// update each topic's subscriber count
	for (const teamTopic of teamTopics) {
		await updateTopicSubscriberCount(teamTopic.id, transaction)
	}
}

/**
 * Remove a team member. A leader removes anyone. A member removes only themself.
 * A team must have at least one leader, so a leader cannot remove themself if they are the only leader.
 */
export async function removeTeamMember(
	userId: string,
	teamId: string,
	removeUserId: string,
): Promise<"removed" | "forbidden" | "lastLeader"> {
	// you can remove a user if you are a leader or yourself if you are not the only leader
	const teamRole = await toTeamRole(userId, teamId)
	if (userId !== removeUserId && teamRole !== "leader") {
		return "forbidden"
	}
	if (teamRole === null) {
		return "forbidden"
	}

	// a leader cannot remove themself if they are the only leader
	if ((await toTeamRole(removeUserId, teamId)) === "leader" && (await teamLeaderCount(teamId)) <= 1) {
		return "lastLeader"
	}

	// the team member row and their chat mentions are deleted
	await db.transaction(async (transaction) => {
		await transaction
			.delete(teamMembers)
			.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, removeUserId)))
		await deactivateTeamTopicSubscriptions(transaction, teamId, [removeUserId])
		// the mentions still waiting for them, found through the team's own room messages
		const teamMessageIds = transaction
			.select({ id: chatRoomMessages.id })
			.from(chatRoomMessages)
			.where(eq(chatRoomMessages.teamId, teamId))
		// drop only their mentions, leaving the messages themselves for the rest of the room
		await transaction
			.delete(chatRoomMentions)
			.where(and(eq(chatRoomMentions.userId, removeUserId), inArray(chatRoomMentions.messageId, teamMessageIds)))
	})
	return "removed"
}

/**
 * Deactivates a team member's subscriptions on the team's topics.
 * A team member that the topic can still reach through another of their teams keeps their subscription to it.
 * A team member that owns the topic keeps their subscription to it.
 */
export async function deactivateTeamTopicSubscriptions(
	transaction: DbTransaction,
	teamId: string,
	userIds: string[],
): Promise<void> {
	// nothing to deactivate on a team with no topics or no members
	const teamTopicIds = (await loadTeamTopics(transaction, teamId)).map((topicRow) => topicRow.id)
	if (teamTopicIds.length === 0 || userIds.length === 0) {
		return
	}

	// a team member that the topic can still reach through another of their teams keeps their subscription to it
	// biome-ignore lint/nursery/useExplicitReturnType: drizzle's select builder type is generated, and naming it here would break on an upgrade
	const subscribedTopicIds = (userId: string) =>
		transaction
			.select({ topicId: teamTopics.topicId })
			.from(teamTopics)
			.innerJoin(teamMembers, and(eq(teamMembers.teamId, teamTopics.teamId), eq(teamMembers.isActive, true)))
			.where(and(eq(teamMembers.userId, userId), notInArray(teamTopics.teamId, [teamId])))
	// a team member that owns the topic keeps their subscription to it
	// biome-ignore lint/nursery/useExplicitReturnType: drizzle's select builder type is generated, and naming it here would break on an upgrade
	const ownedTopicIds = (userId: string) =>
		transaction
			.select({ topicId: topics.id })
			.from(topics)
			.innerJoin(teamMembers, and(eq(teamMembers.teamId, topics.teamId), eq(teamMembers.isActive, true)))
			.where(and(eq(teamMembers.userId, userId), notInArray(topics.teamId, [teamId])))

	// the rows deactivate instead of being deleted
	for (const userId of userIds) {
		await transaction
			.update(subscriptions)
			.set({ isActive: false, isEmailEnabled: false })
			.where(
				and(
					inArray(subscriptions.topicId, teamTopicIds),
					eq(subscriptions.subscriberUserId, userId),
					notInArray(subscriptions.topicId, subscribedTopicIds(userId)),
					notInArray(subscriptions.topicId, ownedTopicIds(userId)),
				),
			)
	}

	// update each topic's subscriber count
	for (const topicId of teamTopicIds) {
		await updateTopicSubscriberCount(topicId, transaction)
	}
}

/**
 * Set a team member's role. Only a team leader can update a member's role, and the last leader cannot demote themself.
 */
export async function setTeamMemberRole(
	actingUserId: string,
	teamId: string,
	targetUserId: string,
	role: "leader" | "member",
): Promise<"saved" | "forbidden" | "lastLeader"> {
	if ((await toTeamRole(actingUserId, teamId)) !== "leader") {
		return "forbidden"
	}
	// demoting the last leader would leave the team with no leader and is not allowed
	const isRoleDemotion = role !== "leader"
	if (isRoleDemotion && (await toTeamRole(targetUserId, teamId)) === "leader" && (await teamLeaderCount(teamId)) <= 1) {
		return "lastLeader"
	}

	// update the team member's role
	await db
		.update(teamMembers)
		.set({ role })
		.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, targetUserId)))
	return "saved"
}

// how many leaders the team has
async function teamLeaderCount(teamId: string): Promise<number> {
	const [teamLeaderRow] = await db
		.select({ count: count() })
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, "leader"), eq(teamMembers.isActive, true)))
	return teamLeaderRow?.count ?? 0
}

// the team member limit from the best plan among the team's leaders, or null for unlimited
async function teamMemberLimit(teamId: string): Promise<number | null> {
	// the team leaders' plans, sorted so a paying leader lifts the member limit for the whole team
	const teamLeaderPlanRows = await db
		.select({ plan: users.plan, role: users.role })
		.from(teamMembers)
		.innerJoin(users, eq(users.id, teamMembers.userId))
		.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.role, "leader"), eq(teamMembers.isActive, true)))

	// return the highest limit of all the team leaders' plans
	let highestLimit: number | null = 0
	for (const planRow of teamLeaderPlanRows) {
		// an admin leader means no limit at all
		if (isAdminRole(planRow.role)) {
			return null
		}

		// an unlimited plan among team leaders returns null for unlimited
		const planLimit = PLANS[planRow.plan as Plan].teamMemberLimit
		if (planLimit === null) {
			return null
		}
		highestLimit = Math.max(highestLimit ?? 0, planLimit)
	}
	return highestLimit
}
