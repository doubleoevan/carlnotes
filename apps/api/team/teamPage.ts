// the team page read: the team, its members, its topics, and what the user may do on it
import { toAvatarKeyVersion, toAvatarVersion } from "@carlnotes/contracts/avatars"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { db } from "@carlnotes/db"
import { invites } from "@carlnotes/db/schema/invites"
import { teamMembers, teams, teamTopics } from "@carlnotes/db/schema/teams"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { and, eq, gt, inArray, isNull, or, sql } from "drizzle-orm"
import { isAllowed, isLeaderRole } from "../authorization"
import { loadTeamChatMentions } from "../chat/mentions"
import { verifiedEmailQuery } from "../topic/permissions"
import { toTopicTableRows } from "../topic/topicTableRows"

// a team page as one user may see it: the whole page, the gate a private team shows a non-member, or no team at all
export type TeamPageResult =
	| { status: "visible"; team: TeamPageResponse }
	| { status: "gated"; teamName: string; hasRequestedToJoin: boolean }
	| { status: "missing" }

/**
 * Loads a team's page as the user may see it, or the gate a private team shows a non-member.
 */
export async function loadTeamPage(userId: string | null, teamId: string): Promise<TeamPageResult> {
	// read the team and the user's membership row in one query. a signed-out visitor joins no membership row
	const [teamRow] = await db
		.select({ team: teams, membershipRole: teamMembers.role, isMembershipActive: teamMembers.isActive })
		.from(teams)
		.leftJoin(teamMembers, and(eq(teamMembers.teamId, teams.id), userId ? eq(teamMembers.userId, userId) : sql`false`))
		.where(eq(teams.id, teamId))
	if (!teamRow) {
		return { status: "missing" }
	}

	// an active membership is the user's role, and an inactive one is a join request no leader has approved yet
	const { team } = teamRow
	const role = teamRow.isMembershipActive ? teamRow.membershipRole : null
	const hasRequestedToJoin = teamRow.isMembershipActive === false

	// check access before reading the page. a private team shows only its gate to everyone but its members, an admin,
	// and someone with a pending invite
	const isMember = role !== null
	const isInvited = !isMember && (await hasPendingTeamInvite(userId, team.id))
	if (!team.isPublic && !isMember && !isInvited && !(await isAllowed(userId, "admin:console"))) {
		return { status: "gated", teamName: team.name, hasRequestedToJoin }
	}

	// the team page's independent reads run together
	const [memberRows, topicRows, chatMentionsByTeam] = await Promise.all([
		// the members with the not-yet-activated rows included
		db
			.select({
				userId: users.id,
				username: users.username,
				avatarSource: users.avatarSource,
				avatarKey: users.avatarKey,
				role: teamMembers.role,
				isMemberVisible: teamMembers.isMemberVisible,
				isActive: teamMembers.isActive,
			})
			.from(teamMembers)
			.innerJoin(users, eq(users.id, teamMembers.userId))
			.where(eq(teamMembers.teamId, team.id))
			.orderBy(teamMembers.createdAt),
		loadTeamTopics(team.id),
		loadTeamChatMentions(userId, [team.id]),
	])

	// members see everyone, and only a leader can see who asked to join
	const isTeamLeader = isMember && isLeaderRole(role)
	const shownMembers = memberRows.filter(
		(memberRow) => (memberRow.isActive || isTeamLeader) && (isMember || memberRow.isMemberVisible),
	)

	// the hidden count reads activated rows alone, so a waiting request never shows through the number
	const activeRows = memberRows.filter((memberRow) => memberRow.isActive)
	const hiddenActiveCount =
		activeRows.length - activeRows.filter((memberRow) => isMember || memberRow.isMemberVisible).length

	// the team's topics: a non-member sees only the public ones, a member or someone with a pending invite sees them all
	const visibleTopics = topicRows.filter((topicRow) => isMember || isInvited || topicRow.visibility === "public")

	// build the page from the members and topics the user may see
	const teamPage: TeamPageResponse = {
		teamId: team.id,
		name: team.name,
		description: team.description,
		isPublic: team.isPublic,
		avatarVersion: toAvatarKeyVersion(team.avatarKey),
		role,
		hasRequestedToJoin,
		members: shownMembers.map((memberRow) => ({
			userId: memberRow.userId,
			username: memberRow.username,
			avatarSource: memberRow.avatarSource,
			avatarVersion: toAvatarVersion(memberRow),
			role: memberRow.role,
			isMemberVisible: memberRow.isMemberVisible,
			isActive: memberRow.isActive,
		})),
		hiddenMemberCount: hiddenActiveCount,
		chatMentions: chatMentionsByTeam.get(team.id) ?? [],
		topics: await toTopicTableRows(visibleTopics, userId),
	}
	return { status: "visible", team: teamPage }
}

// whether a pending invite names this user, by account or by their email address
async function hasPendingTeamInvite(userId: string | null, teamId: string): Promise<boolean> {
	if (!userId) {
		return false
	}

	// a single matching pending invite row is enough. an address matches only once the account verified it
	const [invite] = await db
		.select({ id: invites.id })
		.from(invites)
		.where(
			and(
				eq(invites.teamId, teamId),
				or(eq(invites.invitedUserId, userId), inArray(invites.email, verifiedEmailQuery(userId))),
				eq(invites.usedCount, 0),
				isNull(invites.declinedAt),
				or(isNull(invites.expiresAt), gt(invites.expiresAt, new Date())),
			),
		)
		.limit(1)
	return Boolean(invite)
}

/**
 * Returns the topics a team holds: its own plus the ones shared into it.
 */
export async function loadTeamTopics(teamId: string): Promise<(typeof topics.$inferSelect)[]> {
	const ownedTopicRows = await db.select().from(topics).where(eq(topics.teamId, teamId))
	// a shared topic is reached through its team_topics row instead of the team column
	const sharedTopicRows = await db
		.select()
		.from(teamTopics)
		.innerJoin(topics, eq(topics.id, teamTopics.topicId))
		.where(eq(teamTopics.teamId, teamId))
	return [...ownedTopicRows, ...sharedTopicRows.map((topicRow) => topicRow.topics)]
}
