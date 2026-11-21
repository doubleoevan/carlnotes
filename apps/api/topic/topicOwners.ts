// the owner and the owning team that a topic table row names

import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import type { TeamIdentity } from "@carlnotes/contracts/teamIdentity"
import { db } from "@carlnotes/db"
import { memoizeInRequest } from "@carlnotes/db/requestMemo"
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import { and, eq, inArray, sql } from "drizzle-orm"
import { toTeamIdentity, withAvatarVersion } from "../avatars"

// a topic's owner, and its owning team if the user may see the team named
export type TopicOwner = { owner: ProfileIdentity; team: TeamIdentity | null }

/**
 * Loads each topic's owner and owning team by topic id. A private team is named only to its active members, so
 * anyone else, a visitor included, gets null for it. A request that asks again for the same user and topics, as a
 * page's table and its cards do, shares the first read.
 */
export function loadTopicOwners(topicIds: string[], userId: string | null): Promise<Map<string, TopicOwner>> {
	if (topicIds.length === 0) {
		return Promise.resolve(new Map())
	}
	const topicIdsKey = topicIds.toSorted().join(",")
	return memoizeInRequest(`topic-owners:${userId ?? ""}:${topicIdsKey}`, () => readTopicOwners(topicIds, userId))
}

// each topic's owner and owning team, read for one request
async function readTopicOwners(topicIds: string[], userId: string | null): Promise<Map<string, TopicOwner>> {
	// each topic's owner and team, with the user's active membership of that team
	const topicOwnerRows = await db
		.select({
			topicId: topics.id,
			owner: {
				userId: users.id,
				username: users.username,
				avatarSource: users.avatarSource,
				avatarKey: users.avatarKey,
			},
			team: {
				teamId: teams.id,
				name: teams.name,
				avatarKey: teams.avatarKey,
				isPublic: teams.isPublic,
				memberUserId: teamMembers.userId,
			},
		})
		.from(topics)
		.innerJoin(users, eq(users.id, topics.ownerId))
		.leftJoin(teams, eq(teams.id, topics.teamId))
		.leftJoin(
			teamMembers,
			and(
				eq(teamMembers.teamId, teams.id),
				userId === null ? sql`false` : eq(teamMembers.userId, userId),
				eq(teamMembers.isActive, true),
			),
		)
		.where(inArray(topics.id, topicIds))
	return new Map(
		topicOwnerRows.map((topicOwnerRow) => [
			topicOwnerRow.topicId,
			{ owner: withAvatarVersion(topicOwnerRow.owner), team: toTeamIdentity(topicOwnerRow.team) },
		]),
	)
}
