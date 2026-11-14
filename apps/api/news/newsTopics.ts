// the Topics a person's news reads, in its three groups: the Topics they own, the Topics their Teams hold, and the
// Topics they follow, narrowed to what the reader may open

import { db } from "@carlnotes/db"
import { subscriptions, topics } from "@carlnotes/db/schema/topics"
import { and, eq, ne } from "drizzle-orm"
import { type ProfileReader, toOwnTopicFilter } from "../profileReader"
import { toMemberTeamIdsQuery, toTeamTopicFilter } from "../team/memberTeamTopics"

// the groups of a person's news, in the order the news reads them
export const newsGroups = ["own", "team", "followed"] as const

export type NewsGroup = (typeof newsGroups)[number]

// each group's Topic ids. a Topic is in the first group it fits
export type NewsTopicIds = Record<NewsGroup, string[]>

// whose news it is, and who reads it
type LoadNewsTopicIdsOptions = { profileUserId: string; profileReader: ProfileReader }

// whose Teams, and whether the reader sees public Topics of public Teams that show the membership alone
type LoadTeamTopicRowsOptions = { profileUserId: string; isPublicOnly: boolean }

/**
 * Loads the Topic ids of a person's three news groups. The person reads every Topic of theirs they may open, and an
 * admin the same but a private Topic the person owns whose Personal sources text is not converted. A visitor reads the
 * public Topics the person owns and those of public Teams that show the person's membership, and no Topic the person
 * follows.
 */
export async function loadNewsTopicIds({
	profileUserId,
	profileReader,
}: LoadNewsTopicIdsOptions): Promise<NewsTopicIds> {
	// a visitor reads public Topics alone
	const isPublicOnly = profileReader === "visitor"
	const [ownTopicRows, teamTopicRows, followedTopicRows] = await Promise.all([
		db.select({ id: topics.id }).from(topics).where(toOwnTopicFilter(profileUserId, profileReader)),
		loadTeamTopicRows({ profileUserId, isPublicOnly }),
		isPublicOnly ? [] : loadFollowedTopicRows(profileUserId),
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

// the Topics the person's active Teams own or hold through a share, narrowed if asked to public Topics of public
// Teams that show the membership
function loadTeamTopicRows({ profileUserId, isPublicOnly }: LoadTeamTopicRowsOptions): Promise<{ id: string }[]> {
	const memberTeamIds = toMemberTeamIdsQuery({ profileUserId, isLeaderOnly: false, isPublicOnly })
	return db
		.select({ id: topics.id })
		.from(topics)
		.where(toTeamTopicFilter({ teamIds: memberTeamIds, isPublicOnly }))
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
