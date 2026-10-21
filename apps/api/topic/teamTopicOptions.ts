// the topics a user may add to a team, for the add to team dropdown

import { db } from "@carlnotes/db"
import { invites } from "@carlnotes/db/schema/invites"
import { teamTopics } from "@carlnotes/db/schema/teams"
import { subscriptions, topics } from "@carlnotes/db/schema/topics"
import { and, desc, eq, exists, inArray, isNull, notInArray, or, sql } from "drizzle-orm"
import { verifiedEmailQuery } from "./permissions"

// how many topic options to show in the add to team dropdown
const TEAM_TOPIC_OPTIONS_LIMIT = 500

/**
 * The topics this user may add to a team: their own at any visibility first, then every public topic,
 * and the invite topics they can read, each group alphabetical.
 */
export async function loadTeamTopicOptions(userId: string, teamId?: string): Promise<{ id: string; name: string }[]> {
	// an invite topic counts when the user has an active subscription or a pending invite to it
	const hasSubscription = exists(
		db
			.select({ id: subscriptions.topicId })
			.from(subscriptions)
			.where(
				and(
					eq(subscriptions.topicId, topics.id),
					eq(subscriptions.subscriberUserId, userId),
					eq(subscriptions.isActive, true),
				),
			),
	)
	const hasInvite = exists(
		db
			.select({ id: invites.id })
			.from(invites)
			.where(
				and(
					eq(invites.topicId, topics.id),
					// an address matches only once the account verified it
					or(eq(invites.invitedUserId, userId), inArray(invites.email, verifiedEmailQuery(userId))),
					isNull(invites.declinedAt),
					or(isNull(invites.expiresAt), sql`${invites.expiresAt} > now()`),
					sql`${invites.usedCount} < ${invites.maxUses}`,
				),
			),
	)

	// one query builds the list of topics to add, the user's own topics leading. what team already has is left out.
	const addableTopics = teamId
		? [
				sql`${topics.teamId} is distinct from ${teamId}`,
				notInArray(
					topics.id,
					db.select({ topicId: teamTopics.topicId }).from(teamTopics).where(eq(teamTopics.teamId, teamId)),
				),
			]
		: []
	return db
		.select({ id: topics.id, name: topics.name })
		.from(topics)
		.where(
			and(
				...addableTopics,
				or(
					eq(topics.ownerId, userId),
					eq(topics.visibility, "public"),
					and(eq(topics.visibility, "invite"), or(hasSubscription, hasInvite)),
				),
			),
		)
		.orderBy(desc(eq(topics.ownerId, userId)), sql`lower(${topics.name})`)
		.limit(TEAM_TOPIC_OPTIONS_LIMIT)
}
