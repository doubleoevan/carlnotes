// the team page read: the team, its members, its topics, and what the user may do on it
import { toAvatarKeyVersion, toAvatarVersion } from "@carlnotes/contracts/avatars"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { db } from "@carlnotes/db"
import { teamMembers } from "@carlnotes/db/schema/teams"
import { teamTopics } from "@carlnotes/db/schema/teamTopics"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { eq, inArray, or, sql } from "drizzle-orm"
import { isLeaderRole } from "../authorization"
import { loadTeamChatMentions } from "../chat/mentions"
import { loadTeamCards } from "../profileCards"
import { toTopicTableRows } from "../topic/topicTableRows"
import { loadTeamPageAccess, type TeamPageAccess } from "./teamPageAccess"

// a team page as one user may see it: the whole page, the gate a private team shows a non-member, or no team at all
export type TeamPageResult =
	| { status: "visible"; team: TeamPageResponse }
	| { status: "gated"; teamName: string; hasRequestedToJoin: boolean }
	| { status: "missing" }

/**
 * Loads a team's page as the user may see it, or the gate a private team shows a non-member. A caller that already
 * loaded what the user is to the team passes it.
 */
export async function loadTeamPage(
	userId: string | null,
	teamId: string,
	loadedTeamPageAccess?: TeamPageAccess,
): Promise<TeamPageResult> {
	// check access before reading the page, unless the caller already did
	const teamPageAccess = loadedTeamPageAccess ?? (await loadTeamPageAccess(userId, teamId))
	if (!teamPageAccess) {
		return { status: "missing" }
	}

	// a private team shows only its gate to someone its page does not open for
	const { team, role, hasRequestedToJoin, isInvited } = teamPageAccess
	const isMember = Boolean(role)
	if (!teamPageAccess.canOpen) {
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

	// the topics whose cards the page shows: every one for a member, and the public ones for anyone else, a pending
	// invitee included
	const cardTopicRows = visibleTopics.filter((topicRow) => isMember || topicRow.visibility === "public")

	// the topic table's rows, and the cards of the card topics, of their podcast episodes and films, and of every one of
	// their published Topic Posts
	const [topicTableRows, { topicVideoCards, ...teamCards }] = await Promise.all([
		toTopicTableRows(visibleTopics, userId),
		loadTeamCards(cardTopicRows, userId),
	])

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
		topics: topicTableRows,
		...teamCards,
		topicPodcastEpisodeVideoCards: topicVideoCards,
		viewerCount: team.viewerCount,
	}
	return { status: "visible", team: teamPage }
}

/**
 * Returns the topics a team holds: its own plus the ones shared into it.
 */
export function loadTeamTopics(teamId: string): Promise<(typeof topics.$inferSelect)[]> {
	// a shared topic is reached through its team_topics row
	const sharedTopicIds = db
		.select({ topicId: teamTopics.topicId })
		.from(teamTopics)
		.where(eq(teamTopics.teamId, teamId))

	// one read of its own topics and the shared ones, its own first
	return db
		.select()
		.from(topics)
		.where(or(eq(topics.teamId, teamId), inArray(topics.id, sharedTopicIds)))
		.orderBy(sql`${topics.teamId} is not distinct from ${teamId} desc`)
}
