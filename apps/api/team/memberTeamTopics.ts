// a person's Teams and the Topics those Teams hold

import { db } from "@carlnotes/db"
import { toConvertedPersonalSourcesFilter } from "@carlnotes/db/personalSourcesAuthority"
import { teamMembers, teams } from "@carlnotes/db/schema/teams"
import { teamTopics } from "@carlnotes/db/schema/teamTopics"
import { topics } from "@carlnotes/db/schema/topics"
import { and, eq, inArray, ne, or, type SQL } from "drizzle-orm"

// whose Teams, the led ones alone or every one, and whether the reader sees only public Teams that show the membership
type ToMemberTeamIdsQueryOptions = { profileUserId: string; isLeaderOnly: boolean; isPublicOnly: boolean }

// the query of a person's Team ids, which a Topic filter reads as a subquery
export type MemberTeamIdsQuery = ReturnType<typeof toMemberTeamIdsQuery>

/**
 * Returns the query of the ids of the Teams a person is an active member of, narrowed if asked to the led ones, to
 * public Teams that show the person's membership, or to both.
 */
// biome-ignore lint/nursery/useExplicitReturnType: drizzle infers the select builder's type, which MemberTeamIdsQuery names
export function toMemberTeamIdsQuery({ profileUserId, isLeaderOnly, isPublicOnly }: ToMemberTeamIdsQueryOptions) {
	return db
		.select({ teamId: teamMembers.teamId })
		.from(teamMembers)
		.innerJoin(teams, eq(teams.id, teamMembers.teamId))
		.where(
			and(
				eq(teamMembers.userId, profileUserId),
				eq(teamMembers.isActive, true),
				isLeaderOnly ? eq(teamMembers.role, "leader") : undefined,
				isPublicOnly ? and(eq(teams.isPublic, true), eq(teamMembers.isMemberVisible, true)) : undefined,
			),
		)
}

/**
 * Returns the filter of the Topics some Teams hold, owned or shared in. A reader who sees only public Topics gets the
 * public ones, and anyone else every Topic but a private one whose Personal sources text is not converted.
 */
export function toTeamTopicFilter({
	teamIds,
	isPublicOnly,
}: {
	teamIds: MemberTeamIdsQuery
	isPublicOnly: boolean
}): SQL | undefined {
	// a Topic a Team owns, or one shared into it
	const sharedTopicIds = db
		.select({ topicId: teamTopics.topicId })
		.from(teamTopics)
		.where(inArray(teamTopics.teamId, teamIds))
	const heldTopicFilter = or(inArray(topics.teamId, teamIds), inArray(topics.id, sharedTopicIds))

	// at the visibility the reader sees
	const visibleTopicFilter = isPublicOnly
		? eq(topics.visibility, "public")
		: or(ne(topics.visibility, "private"), toConvertedPersonalSourcesFilter())
	return and(heldTopicFilter, visibleTopicFilter)
}
