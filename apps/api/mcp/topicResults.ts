// what list_topics returns: the topics a tool caller may read, each with a prompt preview and its ready sources

import { db, isPublicAndShown } from "@carlnotes/db"
import { teamMembers, teamTopics } from "@carlnotes/db/schema/teams"
import { sources, subscriptions, topics } from "@carlnotes/db/schema/topics"
import { and, desc, eq, inArray } from "drizzle-orm"
import { toTopicSourceLabel } from "../tool/topicSourceTools"
import { fromCursor, loadVisibleTopic, MCP_PAGE_MAX_CHARS, MCP_PAGE_SIZE, type McpPage, packPage } from "./results"
import type { ToolCaller } from "./toolCaller"

// the most topics a list returns, and how many characters of each prompt it shows
const MCP_TOPIC_LIST_LIMIT = 50
const TOPIC_PROMPT_PREVIEW_CHARS = 300

// a topic as list_topics returns it
export type McpTopic = {
	topicId: string
	name: string
	prompt: string
	visibility: string
	frequency: string
	subscriberCount: number
	// the topic's ready sources
	sources: { sourceId: string; label: string }[]
}

// the topic columns a list reads
const topicColumns = {
	id: topics.id,
	name: topics.name,
	prompt: topics.prompt,
	visibility: topics.visibility,
	frequency: topics.frequency,
	subscriberCount: topics.subscriberCount,
}

/**
 * Lists the topics a tool caller may read: the public ones plus what a user owns, subscribes to, or holds through a team,
 * or a bound server's one topic.
 */
export async function listTopics(
	toolCaller: ToolCaller,
	routeTopicId: string | null,
	cursor: string | null,
): Promise<McpPage<McpTopic>> {
	// return the bound topic alone, when the tool caller may see it
	if (routeTopicId) {
		const boundTopic = await loadVisibleTopic(toolCaller, routeTopicId)
		if (!boundTopic) {
			return { items: [], nextCursor: null }
		}
		const sourcesByTopic = await loadReadyTopicSourcesByTopic([boundTopic.id])
		return { items: [toMcpTopic(boundTopic, sourcesByTopic.get(boundTopic.id) ?? [])], nextCursor: null }
	}

	// load the public topics with enough findings to be shown, most subscribed first
	const publicRows = await db
		.select(topicColumns)
		.from(topics)
		.where(isPublicAndShown)
		.orderBy(desc(topics.subscriberCount), desc(topics.createdAt))
		.limit(MCP_TOPIC_LIST_LIMIT)

	// put a user's own topics first, then the public ones, each topic once
	const ownRows = toolCaller.kind === "user" ? await loadUserTopicRows(toolCaller.userId) : []
	const topicRows = [...new Map([...ownRows, ...publicRows].map((topicRow) => [topicRow.id, topicRow])).values()]

	// add each topic's ready sources and pack the page
	const sourcesByTopic = await loadReadyTopicSourcesByTopic(topicRows.map((topicRow) => topicRow.id))
	const mcpTopics = topicRows.map((topicRow) => toMcpTopic(topicRow, sourcesByTopic.get(topicRow.id) ?? []))
	return packPage(mcpTopics, fromCursor(cursor), MCP_PAGE_MAX_CHARS, MCP_PAGE_SIZE)
}

// load the topics a user owns, subscribes to, or holds through a team, all at once
async function loadUserTopicRows(userId: string): Promise<McpTopicRow[]> {
	const [ownedRows, subscribedRows, owningTeamRows, sharedTeamRows] = await Promise.all([
		db.select(topicColumns).from(topics).where(eq(topics.ownerId, userId)),
		db
			.select(topicColumns)
			.from(topics)
			.innerJoin(
				subscriptions,
				and(
					eq(subscriptions.topicId, topics.id),
					eq(subscriptions.subscriberUserId, userId),
					eq(subscriptions.isActive, true),
				),
			),
		db
			.select(topicColumns)
			.from(topics)
			.innerJoin(
				teamMembers,
				and(eq(teamMembers.teamId, topics.teamId), eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)),
			),
		db
			.select(topicColumns)
			.from(teamTopics)
			.innerJoin(topics, eq(topics.id, teamTopics.topicId))
			.innerJoin(
				teamMembers,
				and(eq(teamMembers.teamId, teamTopics.teamId), eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)),
			),
	])
	return [...ownedRows, ...subscribedRows, ...owningTeamRows, ...sharedTeamRows]
}

// a topic row with the columns a list reads
type McpTopicRow = Pick<
	typeof topics.$inferSelect,
	"id" | "name" | "prompt" | "visibility" | "frequency" | "subscriberCount"
>

// shape a topic for the list, with its prompt clipped to a preview and its ready sources
function toMcpTopic(topicRow: McpTopicRow, topicSources: McpTopic["sources"]): McpTopic {
	return {
		topicId: topicRow.id,
		name: topicRow.name,
		prompt: toPromptPreview(topicRow.prompt),
		visibility: topicRow.visibility,
		frequency: topicRow.frequency,
		subscriberCount: topicRow.subscriberCount,
		sources: topicSources,
	}
}

// the prompt clipped to its preview, ending in an ellipsis when it was clipped
function toPromptPreview(prompt: string): string {
	return prompt.length > TOPIC_PROMPT_PREVIEW_CHARS ? `${prompt.slice(0, TOPIC_PROMPT_PREVIEW_CHARS)}…` : prompt
}

// load each topic's ready sources in one query, labeled the way the tools name them
async function loadReadyTopicSourcesByTopic(topicIds: string[]): Promise<Map<string, McpTopic["sources"]>> {
	if (topicIds.length === 0) {
		return new Map()
	}
	const topicSourceRows = await db
		.select({ id: sources.id, topicId: sources.topicId, kind: sources.kind, config: sources.config })
		.from(sources)
		.where(and(inArray(sources.topicId, topicIds), eq(sources.status, "ready")))

	// group the sources by topic, each with its label
	const sourcesByTopic = new Map<string, McpTopic["sources"]>()
	for (const topicSourceRow of topicSourceRows) {
		const topicSources = sourcesByTopic.get(topicSourceRow.topicId) ?? []
		topicSources.push({
			sourceId: topicSourceRow.id,
			label: toTopicSourceLabel(topicSourceRow.kind, topicSourceRow.config),
		})
		sourcesByTopic.set(topicSourceRow.topicId, topicSources)
	}
	return sourcesByTopic
}
