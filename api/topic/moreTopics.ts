// the "More topics" links at the end of a public topic page: the other public shown topics, the nearest first
import type { TopicResponse } from "@shared/contracts"
import { and, desc, eq, exists, inArray, ne, or, type SQL, sql } from "drizzle-orm"
import { db } from "../../db"
import { teams, teamTopics, topics } from "../../db/schema"
import { topicFeedUpdatedAt } from "../seo"
import { isPublicAndShown } from "./permissions"

// how many more topics a topic page links
export const MORE_TOPICS_LIMIT = 5

// the topic's id, tags, and owning team
type MoreTopicsPageTopic = Pick<typeof topics.$inferSelect, "id" | "tags" | "teamId">

/**
 * Loads the other public shown topics a public shown topic's page links, up to five: the topics a public team holding
 * this topic holds first, then topics sharing a tag by how many tags they share, then the most recently updated.
 * A topic that is not public and shown links none.
 */
export async function loadMoreTopics(topic: MoreTopicsPageTopic): Promise<TopicResponse["moreTopics"]> {
	// read whether this topic is public and shown, and the public teams holding it as its owning team or through a share
	const [[shownTopicRow], holdingPublicTeamRows] = await Promise.all([
		db
			.select({ id: topics.id })
			.from(topics)
			.where(and(eq(topics.id, topic.id), isPublicAndShown)),
		db
			.select({ id: teams.id })
			.from(teams)
			.where(
				and(
					eq(teams.isPublic, true),
					or(
						topic.teamId ? eq(teams.id, topic.teamId) : undefined,
						exists(
							db
								.select({ topicId: teamTopics.topicId })
								.from(teamTopics)
								.where(and(eq(teamTopics.teamId, teams.id), eq(teamTopics.topicId, topic.id))),
						),
					),
				),
			),
	])
	if (!shownTopicRow) {
		return []
	}

	// the order: a holding public team's topics first if one holds this topic, then by shared tags if it has tags,
	// then by newest finding
	const holdingPublicTeamIds = holdingPublicTeamRows.map((teamRow) => teamRow.id)
	const nearestFirstOrder = [
		...(holdingPublicTeamIds.length > 0 ? [desc(toIsHeldByTeam(holdingPublicTeamIds))] : []),
		...(topic.tags.length > 0 ? [desc(toSharedTagCount(topic.tags))] : []),
		desc(topicFeedUpdatedAt),
	]

	// read the nearest other public shown topics
	return db
		.select({ id: topics.id, name: topics.name })
		.from(topics)
		.where(and(isPublicAndShown, ne(topics.id, topic.id)))
		.orderBy(...nearestFirstOrder)
		.limit(MORE_TOPICS_LIMIT)
}

// whether one of the teams holds a topic as its owning team or through a share. false, never null
function toIsHeldByTeam(teamIds: string[]): SQL {
	return sql`coalesce(${inArray(topics.teamId, teamIds)} or exists (select 1 from ${teamTopics} where ${teamTopics.topicId} = ${topics.id} and ${inArray(teamTopics.teamId, teamIds)}), false)`
}

// how many of these tags a topic has. each tag is bound into an array
function toSharedTagCount(tags: string[]): SQL {
	const boundTags = sql.join(
		tags.map((tag) => sql`${tag}`),
		sql`, `,
	)
	return sql`(select count(*) from unnest(${topics.tags}) as tag where tag = any(array[${boundTags}]::text[]))`
}
