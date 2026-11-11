// the Topics a person's news reads, in its three groups: the Topics they own, the Topics their Teams hold, and the
// Topics they follow, narrowed to what the reader may open

import { db } from "@carlnotes/db"
import { toConvertedPersonalSourcesFilter } from "@carlnotes/db/personalSourcesAuthority"
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import { teamTopics } from "@carlnotes/db/schema/teamTopics"
import { subscriptions, topics } from "@carlnotes/db/schema/topics"
import { and, eq, inArray, ne, or } from "drizzle-orm"

// the groups of a person's news, in the order the news reads them
export const newsGroups = ["own", "team", "followed"] as const

export type NewsGroup = (typeof newsGroups)[number]

// each group's Topic ids. a Topic is in the first group it fits
export type NewsTopicIds = Record<NewsGroup, string[]>

// whose news it is, and whether the reader is that person
type LoadNewsTopicIdsOptions = { profileUserId: string; isOwnNews: boolean }

/**
 * Loads the Topic ids of a person's three news groups. The person reads every Topic of theirs they may open. Anyone
 * else reads the public Topics the person owns and those of public Teams that show the person's membership, and no
 * Topic the person follows.
 */
export async function loadNewsTopicIds({ profileUserId, isOwnNews }: LoadNewsTopicIdsOptions): Promise<NewsTopicIds> {
	// anyone but the person reads public Topics alone
	const publicTopicFilter = isOwnNews ? undefined : eq(topics.visibility, "public")
	const [ownTopicRows, teamTopicRows, followedTopicRows] = await Promise.all([
		db
			.select({ id: topics.id })
			.from(topics)
			.where(and(eq(topics.ownerId, profileUserId), publicTopicFilter)),
		loadTeamTopicRows({ profileUserId, isOwnNews }),
		isOwnNews ? loadFollowedTopicRows(profileUserId) : [],
	])
	return toNewsTopicIds(
		ownTopicRows.map((topicRow) => topicRow.id),
		teamTopicRows.map((topicRow) => topicRow.id),
		followedTopicRows.map((topicRow) => topicRow.id),
	)
}

/**
 * Returns the three groups' Topic ids with each Topic kept in the first group that holds it.
 */
export function toNewsTopicIds(
	ownTopicIds: string[],
	teamTopicIds: string[],
	followedTopicIds: string[],
): NewsTopicIds {
	const ownTopicIdSet = new Set(ownTopicIds)
	const teamOnlyTopicIds = [...new Set(teamTopicIds)].filter((topicId) => !ownTopicIdSet.has(topicId))
	const earlierTopicIdSet = new Set([...ownTopicIds, ...teamOnlyTopicIds])
	return {
		own: ownTopicIds,
		team: teamOnlyTopicIds,
		followed: followedTopicIds.filter((topicId) => !earlierTopicIdSet.has(topicId)),
	}
}

// the Topics the person's active Teams own or hold through a share. anyone but the person reads only the public Topics
// of public Teams that show the person's membership
function loadTeamTopicRows({ profileUserId, isOwnNews }: LoadNewsTopicIdsOptions): Promise<{ id: string }[]> {
	const memberTeamIds = db
		.select({ teamId: teamMembers.teamId })
		.from(teamMembers)
		.innerJoin(teams, eq(teams.id, teamMembers.teamId))
		.where(
			and(
				eq(teamMembers.userId, profileUserId),
				eq(teamMembers.isActive, true),
				isOwnNews ? undefined : and(eq(teams.isPublic, true), eq(teamMembers.isMemberVisible, true)),
			),
		)
	const sharedTopicIds = db
		.select({ topicId: teamTopics.topicId })
		.from(teamTopics)
		.where(inArray(teamTopics.teamId, memberTeamIds))

	// a private Topic another member owns stays out of the person's read until its generated text is converted
	const visibleTopicFilter = isOwnNews
		? or(ne(topics.visibility, "private"), toConvertedPersonalSourcesFilter())
		: eq(topics.visibility, "public")
	return db
		.select({ id: topics.id })
		.from(topics)
		.where(and(or(inArray(topics.teamId, memberTeamIds), inArray(topics.id, sharedTopicIds)), visibleTopicFilter))
}

// the Topics the person actively subscribes to that have not turned private
function loadFollowedTopicRows(profileUserId: string): Promise<{ id: string }[]> {
	return db
		.select({ id: topics.id })
		.from(subscriptions)
		.innerJoin(topics, eq(topics.id, subscriptions.topicId))
		.where(
			and(
				eq(subscriptions.subscriberUserId, profileUserId),
				eq(subscriptions.isActive, true),
				ne(topics.visibility, "private"),
			),
		)
}
