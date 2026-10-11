// the database helpers for the team api
import { toAvatarKeyVersion } from "@shared/avatars"
import type { OwnerTopic, ProfileTeamStatus, TeamSummary } from "@shared/contracts"
import { and, count, eq, gt, gte, inArray, isNotNull, isNull, or, sql } from "drizzle-orm"
import { alias } from "drizzle-orm/pg-core"
import { db } from "../../db"
import { chatTurns } from "../../db/schema/chat"
import { invites } from "../../db/schema/invites"
import { scans } from "../../db/schema/scans"
import { teamMembers, teams, teamTopics } from "../../db/schema/teams"
import { topics } from "../../db/schema/topics"
import { users } from "../../db/schema/users"
import { loadTopics } from "../activityTopics"
import { isLeaderRole } from "../authorization"
import { toProfileIdentity } from "../avatars"
import { loadTeamChatMentions } from "../chat/mentions"
import { startOfUtcMonth } from "../topic/quotas"
import { loadTeamTopics } from "./teamPage"

// the users table under a second name, so an invitation can join its sender beside its invitee
export const senders = alias(users, "senders")

// the users table under a third name, so a membership can join whoever invited the user
export const inviters = alias(users, "inviters")

/**
 * Returns the user's teams, each with the profile user's status there, an active member, invited, or neither.
 */
export async function loadProfileTeamStatuses(userId: string, profileUserId: string): Promise<ProfileTeamStatus[]> {
	// the user's active teams with their role in each
	const userTeams = await db
		.select({ teamId: teams.id, name: teams.name, avatarKey: teams.avatarKey, role: teamMembers.role })
		.from(teamMembers)
		.innerJoin(teams, eq(teams.id, teamMembers.teamId))
		.where(and(eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)))
		.orderBy(teams.createdAt)

	// no teams means there is nothing further to look up
	const teamIds = userTeams.map((teamRow) => teamRow.teamId)
	if (teamIds.length === 0) {
		return []
	}

	// the profile user's active memberships among those teams, and the pending invites to the profile user
	const [memberRows, inviteRows] = await Promise.all([
		db
			.select({ teamId: teamMembers.teamId })
			.from(teamMembers)
			.where(
				and(
					inArray(teamMembers.teamId, teamIds),
					eq(teamMembers.userId, profileUserId),
					eq(teamMembers.isActive, true),
				),
			),
		db
			.select({ teamId: invites.teamId, inviteId: invites.id, invitedByUserId: invites.invitedByUserId })
			.from(invites)
			.where(
				and(
					inArray(invites.teamId, teamIds),
					eq(invites.invitedUserId, profileUserId),
					eq(invites.usedCount, 0),
					isNull(invites.declinedAt),
					or(isNull(invites.expiresAt), gt(invites.expiresAt, new Date())),
				),
			),
	])

	// each team row names its status: a member row wins over an invited one, and neither type reads as none
	const membersByTeamId = new Set(memberRows.map((memberRow) => memberRow.teamId))
	const invitesByTeamId = new Map(inviteRows.map((inviteRow) => [inviteRow.teamId, inviteRow]))
	return userTeams.map((teamRow) => {
		const invite = invitesByTeamId.get(teamRow.teamId)
		return {
			teamId: teamRow.teamId,
			name: teamRow.name,
			avatarVersion: toAvatarKeyVersion(teamRow.avatarKey),
			role: teamRow.role,
			status: membersByTeamId.has(teamRow.teamId)
				? ("member" as const)
				: invite
					? ("invited" as const)
					: ("none" as const),
			inviteId: invite?.inviteId ?? null,
			canDeleteInvite: Boolean(invite && (isLeaderRole(teamRow.role) || invite.invitedByUserId === userId)),
		}
	})
}

/**
 * One team's topics in the shape the admin page renders them. An admin sees every topic the team holds and its scan costs.
 */
export async function loadAdminTeamTopics({
	teamId,
	adminUserId,
}: {
	teamId: string
	adminUserId: string
}): Promise<OwnerTopic[] | null> {
	const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId))
	if (!team) {
		return null
	}

	// the same rows a user's own topics table reads, so both subtables show the same columns and totals
	const teamTopicIds = (await loadTeamTopics(teamId)).map((topicRow) => topicRow.id)
	return loadTopics({ topicIds: teamTopicIds, signedInUserId: adminUserId })
}

/**
 * This month's spend in cents across each of these teams' topics, keyed by team id. A team holds no key
 * of its own, so what it costs is what its topics cost, split by what produced the spend.
 */
export async function toSpendByTeamId(
	teamIds: string[],
): Promise<Map<string, { scanCents: number; chatCents: number }>> {
	if (teamIds.length === 0) {
		return new Map()
	}

	// the scans and the chat turns on those teams' topics, each summed in one grouped query, plus the teams' own
	const monthStart = startOfUtcMonth(new Date())
	const [scanRows, chatRows, teamRoomRows] = await Promise.all([
		db
			.select({ teamId: topics.teamId, dollars: sql<string>`coalesce(sum(${scans.cost}), 0)` })
			.from(scans)
			.innerJoin(topics, eq(topics.id, scans.topicId))
			.where(and(inArray(topics.teamId, teamIds), gte(scans.startedAt, monthStart)))
			.groupBy(topics.teamId),
		db
			.select({ teamId: topics.teamId, dollars: sql<string>`coalesce(sum(${chatTurns.cost}), 0)` })
			.from(chatTurns)
			.innerJoin(topics, eq(topics.id, chatTurns.topicId))
			.where(and(inArray(topics.teamId, teamIds), gte(chatTurns.createdAt, monthStart)))
			.groupBy(topics.teamId),
		db
			.select({ teamId: chatTurns.teamId, dollars: sql<string>`coalesce(sum(${chatTurns.cost}), 0)` })
			.from(chatTurns)
			// only chat room turns count. a member's private team conversation spends on their own meter alone
			.where(
				and(
					inArray(chatTurns.teamId, teamIds),
					isNotNull(chatTurns.roomMessageId),
					gte(chatTurns.createdAt, monthStart),
				),
			)
			.groupBy(chatTurns.teamId),
	])

	// the totals combine per team in cents
	const chatCentsByTeamId = new Map(
		chatRows.map((chatRow) => [chatRow.teamId, Math.round(Number(chatRow.dollars) * 100)] as const),
	)
	for (const teamRoomRow of teamRoomRows) {
		const cents = Math.round(Number(teamRoomRow.dollars) * 100)
		chatCentsByTeamId.set(teamRoomRow.teamId, (chatCentsByTeamId.get(teamRoomRow.teamId) ?? 0) + cents)
	}
	// one spend entry per team id. zeros where nothing was spent
	const spendByTeamId = new Map<string, { scanCents: number; chatCents: number }>()
	for (const teamId of teamIds) {
		const scanRow = scanRows.find((teamScanRow) => teamScanRow.teamId === teamId)
		spendByTeamId.set(teamId, {
			scanCents: Math.round(Number(scanRow?.dollars ?? 0) * 100),
			chatCents: chatCentsByTeamId.get(teamId) ?? 0,
		})
	}
	return spendByTeamId
}

/**
 * The teams the user belongs to with their role in each, for the teams page.
 */
export async function loadTeamSummaries(userId: string): Promise<TeamSummary[]> {
	// one join returns the team and the user's role
	const teamRows = await db
		.select({
			teamId: teams.id,
			name: teams.name,
			role: teamMembers.role,
			isPublic: teams.isPublic,
			description: teams.description,
			avatarKey: teams.avatarKey,
			// who invited the user, null if they joined on their own or the inviter's account closed
			inviter: {
				userId: inviters.id,
				username: inviters.username,
				avatarSource: inviters.avatarSource,
				avatarKey: inviters.avatarKey,
			},
		})
		.from(teamMembers)
		.innerJoin(teams, eq(teams.id, teamMembers.teamId))
		.leftJoin(inviters, eq(inviters.id, teamMembers.invitedByUserId))
		.where(and(eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)))
		.orderBy(teams.createdAt)

	// each team's counts, shared with the received invitations that render beside these rows
	const teamIds = teamRows.map((teamRow) => teamRow.teamId)
	const countsByTeamId = await toCountsByTeamId(teamIds)

	// how many active leaders each team has
	const teamLeaderRows = await db
		.select({ teamId: teamMembers.teamId, leaderCount: count() })
		.from(teamMembers)
		.where(and(inArray(teamMembers.teamId, teamIds), eq(teamMembers.isActive, true), eq(teamMembers.role, "leader")))
		.groupBy(teamMembers.teamId)
	const leaderCountByTeamId = new Map(
		teamLeaderRows.map((teamLeaderRow) => [teamLeaderRow.teamId, teamLeaderRow.leaderCount]),
	)

	// what each team's topics cost this month, and the user's unseen team chat room mentions
	const spendByTeamId = await toSpendByTeamId(teamIds)
	const mentionsByTeamId = await loadTeamChatMentions(userId, teamIds)
	return teamRows.map(({ avatarKey, inviter, ...row }) => ({
		...row,
		invitedBy: toProfileIdentity(inviter),
		isOnlyLeader: isLeaderRole(row.role) && (leaderCountByTeamId.get(row.teamId) ?? 0) <= 1,
		memberCount: countsByTeamId.get(row.teamId)?.memberCount ?? 1,
		topicCount: countsByTeamId.get(row.teamId)?.topicCount ?? 0,
		avatarVersion: toAvatarKeyVersion(avatarKey),
		scanSpendCents: spendByTeamId.get(row.teamId)?.scanCents ?? 0,
		chatSpendCents: spendByTeamId.get(row.teamId)?.chatCents ?? 0,
		chatMentions: mentionsByTeamId.get(row.teamId) ?? [],
	}))
}

/**
 * The teams a user belongs to as another user sees them: the public ones they are a member of.
 * Who invited them and their unopened chat mentions belong to the user's teams page.
 */
export async function loadPublicTeams(userId: string): Promise<TeamSummary[]> {
	// a membership to a team that isn't public does not show up on the profile for a visitor
	const teamRows = await db
		.select({
			teamId: teams.id,
			name: teams.name,
			description: teams.description,
			isPublic: teams.isPublic,
			avatarKey: teams.avatarKey,
			role: teamMembers.role,
		})
		.from(teamMembers)
		.innerJoin(teams, eq(teams.id, teamMembers.teamId))
		.where(
			and(
				eq(teamMembers.userId, userId),
				eq(teamMembers.isActive, true),
				eq(teamMembers.isMemberVisible, true),
				eq(teams.isPublic, true),
			),
		)
		.orderBy(teams.name)

	// the counts the team row's subtables open, loaded for every listed team at once
	const countsByTeamId = await toCountsByTeamId(teamRows.map((teamRow) => teamRow.teamId))
	return teamRows.map((teamRow) => ({
		teamId: teamRow.teamId,
		name: teamRow.name,
		description: teamRow.description,
		isPublic: teamRow.isPublic,
		avatarVersion: toAvatarKeyVersion(teamRow.avatarKey),
		memberCount: countsByTeamId.get(teamRow.teamId)?.memberCount ?? 0,
		topicCount: countsByTeamId.get(teamRow.teamId)?.topicCount ?? 0,
		// a team's spend is its members' business, so a profile visitor is told none of it
		scanSpendCents: 0,
		chatSpendCents: 0,
		role: teamRow.role,
		isOnlyLeader: false,
		invitedBy: null,
		chatMentions: [],
	}))
}

/**
 * Returns each team's active-member and topic counts, one grouped query per table.
 */
export async function toCountsByTeamId(
	teamIds: string[],
): Promise<Map<string, { memberCount: number; topicCount: number }>> {
	if (teamIds.length === 0) {
		return new Map()
	}
	// the active members, the team owned topics, and the shared team topics
	const [memberRows, ownedTopicRows, sharedTopicRows] = await Promise.all([
		db
			.select({ teamId: teamMembers.teamId, memberCount: count() })
			.from(teamMembers)
			.where(and(inArray(teamMembers.teamId, teamIds), eq(teamMembers.isActive, true)))
			.groupBy(teamMembers.teamId),
		db
			.select({ teamId: topics.teamId, topicCount: count() })
			.from(topics)
			.where(inArray(topics.teamId, teamIds))
			.groupBy(topics.teamId),
		db
			.select({ teamId: teamTopics.teamId, topicCount: count() })
			.from(teamTopics)
			.where(inArray(teamTopics.teamId, teamIds))
			.groupBy(teamTopics.teamId),
	])

	// the team topics are the owned ones plus the shared ones
	const topicCountByTeamId = new Map(
		ownedTopicRows.map((ownedTopicRow) => [ownedTopicRow.teamId, ownedTopicRow.topicCount]),
	)
	for (const sharedTopicRow of sharedTopicRows) {
		topicCountByTeamId.set(
			sharedTopicRow.teamId,
			(topicCountByTeamId.get(sharedTopicRow.teamId) ?? 0) + sharedTopicRow.topicCount,
		)
	}
	const memberCountByTeamId = new Map(memberRows.map((memberRow) => [memberRow.teamId, memberRow.memberCount]))
	return new Map(
		teamIds.map((teamId) => [
			teamId,
			{ memberCount: memberCountByTeamId.get(teamId) ?? 0, topicCount: topicCountByTeamId.get(teamId) ?? 0 },
		]),
	)
}
