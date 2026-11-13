// what list_topics returns: the topics a tool caller may read, each with a prompt preview and its ready sources

import { type TopicImageUrls, toAbsoluteTopicImageUrls, toTopicImageUrlsOrNull } from "@carlnotes/contracts/topicImages"
import type { TopicResponse, TopicSectionKey } from "@carlnotes/contracts/topics"
import { db, isPublicAndShown } from "@carlnotes/db"
import { isReadySharedSource } from "@carlnotes/db/contentFilters"
import { teamMembers } from "@carlnotes/db/schema/teams"
import { teamTopics } from "@carlnotes/db/schema/teamTopics"
import { sources, subscriptions, topics } from "@carlnotes/db/schema/topics"
import { appUrl } from "@carlnotes/server/appUrl"
import { and, desc, eq, inArray, or } from "drizzle-orm"
import { toTopicSourceLabel } from "../tool/topicSourceTools"
import { loadTopicSectionIds } from "../topic/feeds"
import { toTopicAccessFilter } from "../topic/permissions"
import { loadRelatedTopics } from "../topic/relatedTopics"
import { fromCursor, loadVisibleTopic, MCP_PAGE_SIZE, type McpPage, packPageFromWindow } from "./results"
import { type ToolCaller, toToolCallerUserId } from "./toolCaller"

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
	// the topic's image at every size, null until its first render lands
	image: TopicImageUrls | null
	// the topic's ready sources
	sources: { sourceId: string; label: string }[]
}

// the sections of the topics page that list_topics takes, by the names the page shows, and the section each one reads
export const TOPIC_SECTION_ARGUMENTS = {
	yours: "yours",
	followed: "subscribed",
	featured: "home",
	popular: "popular",
} as const satisfies Record<string, TopicSectionKey>
export type TopicSectionArgument = keyof typeof TOPIC_SECTION_ARGUMENTS

// the topic columns a list reads
const topicColumns = {
	id: topics.id,
	name: topics.name,
	prompt: topics.prompt,
	visibility: topics.visibility,
	frequency: topics.frequency,
	subscriberCount: topics.subscriberCount,
	imageHash: topics.imageHash,
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

	return toMcpTopicPage(topicRows, cursor)
}

/**
 * Lists one section of the topics page as the caller reads it: yours, followed, featured, or popular. A visitor reads
 * the public featured and popular sections.
 */
export async function listTopicSectionTopics(
	toolCaller: ToolCaller,
	topicSectionArgument: TopicSectionArgument,
	cursor: string | null,
): Promise<McpPage<McpTopic>> {
	const topicIds = await loadTopicSectionIds(
		toToolCallerUserId(toolCaller),
		TOPIC_SECTION_ARGUMENTS[topicSectionArgument],
	)
	// the rows of the window past the cursor alone, one topic more than a page holds
	const offset = fromCursor(cursor)
	const windowRows = await loadTopicRowsInOrder(topicIds.slice(offset, offset + MCP_PAGE_SIZE + 1))
	return toMcpTopicWindowPage(windowRows, offset)
}

// a topic's similar topics: the topic's name, the related topics its page shows, and the page of them list_topics returns
type SimilarTopics = {
	topicName: string
	relatedTopics: TopicResponse["relatedTopics"]
	mcpPage: McpPage<McpTopic>
}

/**
 * Lists the similar topics a topic's page shows the caller, or returns null if the caller may not open the topic.
 */
export async function listSimilarTopics(
	toolCaller: ToolCaller,
	topicId: string,
	cursor: string | null,
): Promise<SimilarTopics | null> {
	const topic = await loadVisibleTopic(toolCaller, topicId)
	if (!topic) {
		return null
	}

	// the related topics the topic's page shows, then the same topics as list_topics returns them
	const relatedTopics = await loadRelatedTopics(topic, toToolCallerUserId(toolCaller))
	const topicRows = await loadTopicRowsInOrder(relatedTopics.map((relatedTopic) => relatedTopic.id))
	return { topicName: topic.name, relatedTopics, mcpPage: await toMcpTopicPage(topicRows, cursor) }
}

// the topics with these ids, in the order of the ids
async function loadTopicRowsInOrder(topicIds: string[]): Promise<McpTopicRow[]> {
	if (topicIds.length === 0) {
		return []
	}
	const topicRows = await db.select(topicColumns).from(topics).where(inArray(topics.id, topicIds))
	const topicRowsById = new Map(topicRows.map((topicRow) => [topicRow.id, topicRow]))
	return topicIds.flatMap((topicId) => topicRowsById.get(topicId) ?? [])
}

// the topics, each with its ready sources, packed into one page
async function toMcpTopicPage(topicRows: McpTopicRow[], cursor: string | null): Promise<McpPage<McpTopic>> {
	// the window past the cursor alone, one topic more than a page holds
	const offset = fromCursor(cursor)
	return toMcpTopicWindowPage(topicRows.slice(offset, offset + MCP_PAGE_SIZE + 1), offset)
}

// a window of topics, each with its ready sources, packed into one page
async function toMcpTopicWindowPage(windowRows: McpTopicRow[], offset: number): Promise<McpPage<McpTopic>> {
	const sourcesByTopic = await loadReadyTopicSourcesByTopic(windowRows.map((topicRow) => topicRow.id))
	const mcpTopics = windowRows.map((topicRow) => toMcpTopic(topicRow, sourcesByTopic.get(topicRow.id) ?? []))
	return packPageFromWindow(mcpTopics, { offset })
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
			)
			.where(or(eq(topics.visibility, "public"), toTopicAccessFilter(userId))),
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
	"id" | "name" | "prompt" | "visibility" | "frequency" | "subscriberCount" | "imageHash"
>

// shape a topic for the list, with its prompt clipped to a preview, its image at absolute urls, and its ready sources
function toMcpTopic(topicRow: McpTopicRow, topicSources: McpTopic["sources"]): McpTopic {
	const image = toTopicImageUrlsOrNull(topicRow.id, topicRow.imageHash)
	return {
		topicId: topicRow.id,
		name: topicRow.name,
		prompt: toPromptPreview(topicRow.prompt),
		visibility: topicRow.visibility,
		frequency: topicRow.frequency,
		subscriberCount: topicRow.subscriberCount,
		image: image && toAbsoluteTopicImageUrls(image, appUrl()),
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
		.where(and(inArray(sources.topicId, topicIds), isReadySharedSource))

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
