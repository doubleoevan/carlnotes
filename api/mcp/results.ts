// what each mcp tool returns for a visitor or a user, paged under a client's result limit
import type { TopicFinding } from "@shared/contracts"
import { and, desc, eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import { sources, subscriptions, teamMembers, teamTopics, topics } from "../../db/schema"
import { isBudgetRejection, searchTopicFindings as rankTopicFindings, SPENT_BUDGET_REJECTION } from "../../worker"
import { isAllowed } from "../authorization"
import { toTopicSourceLabel } from "../tool/topicTools"
import { loadTopicFindings, setBookmarked, setConsumed, setRating } from "../topic/findings"
import { loadTopicAccessAndFindings } from "../topic/helpers"
import { isShown } from "../topic/permissions"
import { type ToolCaller, toMcpAnalyticsProperties } from "./toolCaller"

// the most charactersthat one page returns, under a client's limit on one result
export const MCP_PAGE_MAX_CHARS = 40_000

// the most findingsthat one page returns, and the most a search ranks
export const MCP_PAGE_SIZE = 20
const MCP_SEARCH_LIMIT = 40

// the most topics a list returns, and how many characters of each prompt it shows
const MCP_TOPIC_LIST_LIMIT = 50
const TOPIC_PROMPT_PREVIEW_CHARS = 300

// what a visitor reads when a tool needs an account
export const CONNECT_ACCOUNT_TEXT =
	"This needs a connected CarlNotes account. Reading and searching public topics work without one."

// what a visitor reads when search has no public key to embed with, and when that key's month is spent
const SEARCH_NEEDS_ACCOUNT_TEXT =
	"Search needs a connected CarlNotes account on this server. The feed read works without one."
const PUBLIC_KEY_SPENT_TEXT =
	"Carl's public search budget is spent for this month. Connect a CarlNotes account to keep searching, or read the feed as is."

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

// a finding as the feed and search return it
export type McpFinding = {
	findingId: string
	title: string | null
	url: string
	source: string | null
	resourceKind: string
	// carl's review
	relevanceScore: number
	relevanceExplanation: string
	publishedAt: string | null
	// the user's own fields, consumed and bookmarked, on a user's result alone
	isConsumed?: boolean
	isBookmarked?: boolean
}

// one page of a result, with the cursor that continues it
export type McpPage<Item> = { items: Item[]; nextCursor: string | null }

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
		.where(and(eq(topics.visibility, "public"), isShown))
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

/**
 * Reads a topic's feed in stored relevance order, with a user's consumed and bookmark rows and the invite gate joined
 * for a user alone, or null for a topic the tool caller may not see.
 */
export async function readTopicFeed(
	toolCaller: ToolCaller,
	topicId: string,
	cursor: string | null,
): Promise<McpPage<McpFinding> | null> {
	const topic = await loadVisibleTopic(toolCaller, topicId)
	if (!topic) {
		return null
	}

	// load the findings and pack the page. only a user's read joins their consumed and bookmark rows
	const topicFindings =
		toolCaller.kind === "user"
			? (await loadTopicAccessAndFindings(topic, toolCaller.userId)).topicFindings
			: await loadTopicFindings(topic.id, null)
	const mcpFindings = topicFindings.map((finding) => toMcpFinding(toolCaller, finding))
	return packPage(mcpFindings, fromCursor(cursor), MCP_PAGE_MAX_CHARS, MCP_PAGE_SIZE)
}

// what a search returns, a page of findings or a message saying why it could not run
export type SearchResult = { page: McpPage<McpFinding> } | { text: string }

/**
 * Ranks a topic's findings against a query over the existing embedding index, on the public key for a visitor and on
 * their own key for a user.
 */
export async function searchFindings(
	toolCaller: ToolCaller,
	topicId: string,
	query: string,
	cursor: string | null,
): Promise<SearchResult | null> {
	const topic = await loadVisibleTopic(toolCaller, topicId)
	if (!topic) {
		return null
	}

	// pick the key the embedding bills to. a visitor with no public key cannot search
	const litellmApiKey = toolCaller.kind === "user" ? toolCaller.litellmApiKey : Bun.env.LITELLM_PUBLIC_KEY
	if (toolCaller.kind === "visitor" && !litellmApiKey) {
		return { text: SEARCH_NEEDS_ACCOUNT_TEXT }
	}

	// rank the findings, and return a message for a spent budget
	try {
		const rankedFindings = await rankTopicFindings(topic.id, query, MCP_SEARCH_LIMIT, litellmApiKey)
		// shape the ranked rows as findings, with no per-user fields
		const mcpFindings = rankedFindings.map((finding) => ({
			findingId: finding.findingId,
			title: finding.title,
			url: finding.url,
			source: finding.source,
			resourceKind: finding.resourceKind,
			relevanceScore: finding.relevanceScore,
			relevanceExplanation: finding.relevanceExplanation,
			publishedAt: finding.publishedAt.toISOString(),
		}))
		return { page: packPage(mcpFindings, fromCursor(cursor), MCP_PAGE_MAX_CHARS, MCP_PAGE_SIZE) }
	} catch (error) {
		// return a message for a spent budget, the public key's or the user's own. rethrow anything else
		if (isBudgetRejection(error)) {
			return { text: toolCaller.kind === "visitor" ? PUBLIC_KEY_SPENT_TEXT : SPENT_BUDGET_REJECTION }
		}
		throw error
	}
}

/**
 * Marks a finding consumed for the user, or returns false when they may not see it.
 */
export async function markFindingConsumed(
	toolCaller: ToolCaller & { kind: "user" },
	findingId: string,
): Promise<boolean> {
	return setConsumed(toolCaller.userId, findingId, true, toMcpAnalyticsProperties(toolCaller))
}

/**
 * Rates a finding up or down for the user or clears the rating, returning false when they may not rate.
 */
export async function rateFinding(
	toolCaller: ToolCaller & { kind: "user" },
	findingId: string,
	rating: "up" | "down" | null,
): Promise<boolean> {
	return setRating(toolCaller.userId, findingId, rating, toMcpAnalyticsProperties(toolCaller))
}

/**
 * Bookmarks or unbookmarks a finding for the user, returning false when they may not bookmark.
 */
export async function bookmarkFinding(
	toolCaller: ToolCaller & { kind: "user" },
	findingId: string,
	isBookmarked: boolean,
): Promise<boolean> {
	return setBookmarked(toolCaller.userId, findingId, isBookmarked, toMcpAnalyticsProperties(toolCaller))
}

/**
 * Packs one page from an offset, taking as many whole entries as fit the character budget, at least one, with the
 * cursor that continues past them.
 */
export function packPage<Item>(items: Item[], offset: number, maxChars: number, maxItems: number): McpPage<Item> {
	const pageItems: Item[] = []
	let usedChars = 0

	// add entries in order until the next would overflow the budget or the count
	for (const item of items.slice(offset)) {
		const itemChars = JSON.stringify(item).length
		if (pageItems.length > 0 && (usedChars + itemChars > maxChars || pageItems.length >= maxItems)) {
			break
		}
		pageItems.push(item)
		usedChars += itemChars
	}

	// return the page and the cursor for the next one. the last page has no cursor
	const nextOffset = offset + pageItems.length
	return { items: pageItems, nextCursor: nextOffset < items.length ? toCursor(nextOffset) : null }
}

/**
 * Encodes an offset as an opaque cursor.
 */
export function toCursor(offset: number): string {
	return Buffer.from(String(offset)).toString("base64url")
}

/**
 * Decodes a cursor to its offset, or to zero for a missing or unreadable one.
 */
export function fromCursor(cursor: string | null): number {
	if (!cursor) {
		return 0
	}
	// decode the offset, and fall back to zero when it is not a whole number
	const offset = Number(Buffer.from(cursor, "base64url").toString())
	return Number.isInteger(offset) && offset >= 0 ? offset : 0
}

/**
 * Shapes a finding for the tool caller, with the consumed and bookmark fields on a user's alone.
 */
export function toMcpFinding(toolCaller: ToolCaller, finding: TopicFinding): McpFinding {
	const mcpFinding: McpFinding = {
		findingId: finding.findingId,
		title: finding.title,
		url: finding.url,
		source: finding.source,
		resourceKind: finding.resourceKind,
		relevanceScore: finding.relevanceScore,
		relevanceExplanation: finding.relevanceExplanation,
		publishedAt: finding.publishedAt,
	}
	if (toolCaller.kind === "visitor") {
		return mcpFinding
	}
	return { ...mcpFinding, isConsumed: finding.isConsumed, isBookmarked: finding.isBookmarked }
}

// load the topic, or null when it is missing or the tool caller may not see it
async function loadVisibleTopic(toolCaller: ToolCaller, topicId: string): Promise<typeof topics.$inferSelect | null> {
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic || !(await isAllowed(toolCaller.kind === "user" ? toolCaller.userId : null, "topic:view", topic))) {
		return null
	}
	return topic
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

/**
 * Resolves the topic a tool call is about, the bound topic or the argument, rejecting an argument that names another
 * topic on a bound server and a call that names none on an unbound one.
 */
export function toToolTopicId(
	routeTopicId: string | null,
	topicIdArgument: string | null,
): { topicId: string } | { rejection: string } {
	// return the bound topic, and reject an argument naming another
	if (routeTopicId) {
		return topicIdArgument && topicIdArgument !== routeTopicId
			? { rejection: "This server is bound to one topic. Connect to /mcp to reach others." }
			: { topicId: routeTopicId }
	}
	// require the argument on an unbound server
	return topicIdArgument ? { topicId: topicIdArgument } : { rejection: "Name a topic_id. list_topics returns them." }
}
