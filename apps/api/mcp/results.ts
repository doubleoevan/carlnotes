// what the mcp finding tools return for a visitor or a user, and the pages every tool result is packed into
import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { ReactionSummary } from "@carlnotes/contracts/social"
import type { topics } from "@carlnotes/db/schema/topics"
import { loadUserOrPublicLiteLLMKey } from "@carlnotes/models/litellm"
import { isBudgetRejection, SPENT_BUDGET_REJECTION } from "@carlnotes/models/models"
import { searchTopicFindings as rankTopicFindings } from "@carlnotes/pipeline/chat/retrieve"
import { attachReactionSummaries } from "../social/findingReactions"
import { loadTopicAccessAndFindings, loadViewableTopic } from "../topic/accessibleFindings"
import { saveFindingFeedback, setBookmarked, setConsumed, setRating } from "../topic/findingFeedback"
import { loadTopicFindings } from "../topic/findings"
import { type ToolCaller, toMcpAnalyticsProperties, toToolCallerUserId } from "./toolCaller"

// the most characters that one page returns, under a client's limit on one result
export const MCP_PAGE_MAX_CHARS = 40_000

// the most findings that one page returns, and the most a search ranks
export const MCP_PAGE_SIZE = 20
const MCP_SEARCH_LIMIT = 40

// what a visitor reads when a tool needs an account
export const CONNECT_ACCOUNT_TEXT =
	"This needs a connected CarlNotes account. Reading and searching public topics work without one."

// what a visitor reads when search has no public key to embed with, and when that key's month is spent
const SEARCH_NEEDS_ACCOUNT_TEXT =
	"Search needs a connected CarlNotes account on this server. The feed read works without one."
const PUBLIC_KEY_SPENT_TEXT =
	"Carl's public search budget is spent for this month. Connect a CarlNotes account to keep searching, or read the feed as is."

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
	// the finding's reactions at a glance, on a finding that has any
	reactions?: McpFindingReactions
}

// a finding's reactions as a tool returns them: how many chose each type
type McpFindingReactions = { counts: { reactionType: string; count: number }[] }

// one page of a result, with the cursor that continues it
export type McpPage<Item> = { items: Item[]; nextCursor: string | null }

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

	// read one row more than fits on a page, from the cursor's offset, so the page knows whether any finding remains.
	// only a user's read joins their consumed and bookmark rows
	const offset = fromCursor(cursor)
	const pageWindow = { offset, rowCount: MCP_PAGE_SIZE + 1 }
	const topicFindings =
		toolCaller.kind === "user"
			? (await loadTopicAccessAndFindings({ topic, userId: toolCaller.userId, pageWindow, isRatedDownExcluded: true }))
					.topicFindings
			: await loadVisitorTopicFindings(topic.id, pageWindow)

	// shape each finding for the tool caller and pack the page from the window
	const mcpFindings = topicFindings.map((finding) => toMcpFinding(toolCaller, finding))
	return packPageFromWindow(mcpFindings, { offset })
}

// a visitor's window of a topic's findings, each with its reactions
async function loadVisitorTopicFindings(
	topicId: string,
	pageWindow: { offset: number; rowCount: number },
): Promise<TopicFinding[]> {
	const topicFindings = await loadTopicFindings({ topicId, userId: null, pageWindow, isRatedDownExcluded: true })
	await attachReactionSummaries({ topicFindings, userId: null })
	return topicFindings
}

/**
 * Packs one page from a window of entries read at an offset, with the cursor that continues past the page.
 * The window has one entry more than fits on a page, so a cursor is returned only if an entry remains after the page.
 */
export function packPageFromWindow<Item>(
	windowItems: Item[],
	{ offset, pageSize = MCP_PAGE_SIZE }: { offset: number; pageSize?: number },
): McpPage<Item> {
	const windowPage = packPage(windowItems, 0, MCP_PAGE_MAX_CHARS, pageSize)
	return {
		items: windowPage.items,
		nextCursor: windowPage.nextCursor ? toCursor(offset + windowPage.items.length) : null,
	}
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

	// bill the embedding to the user's own LiteLLM key or to the public key. a visitor cannot search if the public key
	// is unset
	const litellmApiKey = await loadUserOrPublicLiteLLMKey(toToolCallerUserId(toolCaller))
	if (toolCaller.kind === "visitor" && !litellmApiKey) {
		return { text: SEARCH_NEEDS_ACCOUNT_TEXT }
	}

	// rank the findings, and return a message for a spent budget
	try {
		const userId = toToolCallerUserId(toolCaller)
		const rankedFindings = await rankTopicFindings(topic.id, userId, query, MCP_SEARCH_LIMIT, litellmApiKey)
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
 * Saves the user's own words about a finding, returning false if they may not rate it.
 */
export async function sendFindingFeedback(
	toolCaller: ToolCaller & { kind: "user" },
	findingId: string,
	feedback: string,
): Promise<boolean> {
	return saveFindingFeedback({
		userId: toolCaller.userId,
		findingId,
		feedback,
		analyticsProperties: toMcpAnalyticsProperties(toolCaller),
	})
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
 * cursor that continues past them. The extra characters count against each entry, for a result that adds to it.
 */
export function packPage<Item>(
	items: Item[],
	offset: number,
	maxChars: number,
	maxItems: number,
	extraItemChars = 0,
): McpPage<Item> {
	const pageItems: Item[] = []
	let usedChars = 0

	// add entries in order until the next would overflow the budget or the count
	for (const item of items.slice(offset)) {
		const itemChars = JSON.stringify(item).length + extraItemChars
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
	// decode the offset, and fall back to zero if it is not a whole number the query can read
	const offset = Number(Buffer.from(cursor, "base64url").toString())
	return Number.isSafeInteger(offset) && offset >= 0 ? offset : 0
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
		...toMcpFindingReactions(finding),
	}
	if (toolCaller.kind === "visitor") {
		return mcpFinding
	}
	return { ...mcpFinding, isConsumed: finding.isConsumed, isBookmarked: finding.isBookmarked }
}

// a finding's reactions for a tool result, or nothing for a finding with none
function toMcpFindingReactions({ reactions }: TopicFinding): { reactions?: McpFindingReactions } {
	return reactions && reactions.counts.length > 0 ? { reactions: { counts: toToolReactionCounts(reactions) } } : {}
}

/**
 * Returns how many chose each reaction type, for a tool result that a model reads.
 */
export function toToolReactionCounts({ counts }: ReactionSummary): McpFindingReactions["counts"] {
	return counts.map(({ reactionType, count }) => ({ reactionType, count }))
}

/** Loads the topic, or null if it is missing or the tool caller may not see it. */
export async function loadVisibleTopic(
	toolCaller: ToolCaller,
	topicId: string,
): Promise<typeof topics.$inferSelect | null> {
	return loadViewableTopic(toToolCallerUserId(toolCaller), topicId)
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
