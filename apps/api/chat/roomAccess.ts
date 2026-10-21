// one chat room and the member's access to it, read before a message is posted, streamed, or deleted

import { db } from "@carlnotes/db"
import { teamMembers, teams, teamTopics } from "@carlnotes/db/schema/teams"
import { topics } from "@carlnotes/db/schema/topics"
import { and, eq, isNull, type SQL } from "drizzle-orm"
import type { PgColumn } from "drizzle-orm/pg-core"

/**
 * Returns the chat room a user may use, or null if it must answer like a missing one.
 */
export async function loadChatRoom(
	userId: string | null,
	topicId: string | null,
	teamId: string,
): Promise<{ topic: typeof topics.$inferSelect | null; teamId: string } | null> {
	if (!userId) {
		return null
	}

	// the team's own chat room needs only the team to exist
	let topic: typeof topics.$inferSelect | null = null
	if (topicId === null) {
		const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId))
		if (!team) {
			return null
		}
	} else {
		// a topic chat room resolves its topic first
		const [topicRow] = await db.select().from(topics).where(eq(topics.id, topicId))
		if (!topicRow) {
			return null
		}
		topic = topicRow
		// the team must have the topic, as its owning team or as one it was shared into
		if (topicRow.teamId !== teamId) {
			const [teamRow] = await db
				.select({ teamId: teamTopics.teamId })
				.from(teamTopics)
				.where(and(eq(teamTopics.topicId, topicId), eq(teamTopics.teamId, teamId)))
				.limit(1)

			// no share row means this team has no chat room here
			if (!teamRow) {
				return null
			}
		}
	}

	// team membership alone opens the chat room. ownership without membership does not
	const [membershipRow] = await db
		.select({ userId: teamMembers.userId })
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)))
		.limit(1)
	return membershipRow ? { topic, teamId } : null
}

// the chat room's topic side of a filter: one topic's chat room, or the team's own chat room stored with no topic
export function toTopicFilter(column: PgColumn, topicId: string | null): SQL {
	return topicId === null ? isNull(column) : eq(column, topicId)
}
