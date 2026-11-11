// the team page read: the team, its members, its topics, and what the user may do on it
import { toAvatarKeyVersion, toAvatarVersion } from "@carlnotes/contracts/avatars"
import type { PodcastEpisodeCard } from "@carlnotes/contracts/home"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { db } from "@carlnotes/db"
import { teamMembers } from "@carlnotes/db/schema/teams"
import { teamTopics } from "@carlnotes/db/schema/teamTopics"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { eq } from "drizzle-orm"
import { isLeaderRole } from "../authorization"
import { loadTeamChatMentions } from "../chat/mentions"
import { loadPodcastEpisodeCards } from "../home/topicCards"
import { loadProfileTopicPodcastEpisodeVideoIds, loadTeamCards } from "../profileCards"
import { toTopicTableRows } from "../topic/topicTableRows"
import { loadTeamPageAccess } from "./teamPageAccess"

// a team page as one user may see it: the whole page, the gate a private team shows a non-member, or no team at all
export type TeamPageResult =
	| { status: "visible"; team: TeamPageResponse }
	| { status: "gated"; teamName: string; hasRequestedToJoin: boolean }
	| { status: "missing" }

/**
 * Loads a team's page as the user may see it, or the gate a private team shows a non-member.
 */
export async function loadTeamPage(userId: string | null, teamId: string): Promise<TeamPageResult> {
	// check access before reading the page
	const teamPageAccess = await loadTeamPageAccess(userId, teamId)
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
	const cardTopicIds = visibleTopics
		.filter((topicRow) => isMember || topicRow.visibility === "public")
		.map((topicRow) => topicRow.id)

	// the topic table's rows, and the cards of the card topics, of their podcast episodes, of every one of their
	// published Topic Posts, and of their films
	const [topicTableRows, teamCards, topicPodcastEpisodeVideoCards] = await Promise.all([
		toTopicTableRows(visibleTopics, userId),
		loadTeamCards(cardTopicIds, userId),
		loadTeamTopicPodcastEpisodeVideoCards(cardTopicIds),
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
		topicPodcastEpisodeVideoCards,
	}
	return { status: "visible", team: teamPage }
}

// the film cards of the topics whose cards the page shows: the ready films of their published podcast episodes, the
// ones their topics' owners pinned on their profiles first, then the most listened one of each other topic
async function loadTeamTopicPodcastEpisodeVideoCards(topicIds: string[]): Promise<PodcastEpisodeCard[]> {
	const { podcastEpisodeIds } = await loadProfileTopicPodcastEpisodeVideoIds(topicIds)
	return loadPodcastEpisodeCards(podcastEpisodeIds)
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
