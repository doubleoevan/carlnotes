// the tools the mcp server registers: their names, schemas, annotations, and what each returns. the tools that edit and
// create a topic are in topicEditTools.ts

import { ratings } from "@carlnotes/contracts/enums"
import { searchRequestPayload } from "@carlnotes/contracts/search"
import type { CallToolResult } from "@modelcontextprotocol/server"
import { z } from "zod"
import { setTopicSubscription } from "../topic/subscriptions"
import { loadFindingsCardData, loadSearchCardData, toCardMeta } from "./cardData"
import { registerCardResources, toCardToolMeta } from "./cards"
import {
	bookmarkFinding,
	CONNECT_ACCOUNT_TEXT,
	type McpFinding,
	type McpPage,
	markFindingConsumed,
	rateFinding,
	readTopicFeed,
	searchFindings,
	toToolTopicId,
} from "./results"
import { searchForTool, toSearchText } from "./searchResults"
import { type ToolCaller, toMcpAnalyticsProperties } from "./toolCaller"
import { type RegisterToolsOptions, toPageResult, topicIdArgument, toTextResult } from "./toolShapes"
import { registerTopicEditTools } from "./topicEditTools"
import { listTopics } from "./topicResults"

// the cursor argument the paged reads take
const cursorArgument = z.string().optional().describe("The cursor a previous page returned.")

/**
 * Registers every tool. Every tool caller gets the same list, and only the results differ.
 */
export function registerTools(registerToolsOptions: RegisterToolsOptions): void {
	registerCardResources(registerToolsOptions.mcpServer)
	registerReadTools(registerToolsOptions)
	registerFeedbackTools(registerToolsOptions)
	registerTopicEditTools(registerToolsOptions)
}

// register the read tools, the site search, and the consumed write
function registerReadTools({ mcpServer, toolCaller, routeTopicId, clientAddress }: RegisterToolsOptions): void {
	mcpServer.registerTool(
		"list_topics",
		{
			title: "List topics",
			description:
				"The topics you may read: the public ones for everyone, plus what a connected account owns, follows, and holds through a team.",
			inputSchema: z.object({ cursor: cursorArgument }),
			annotations: { readOnlyHint: true },
		},
		async ({ cursor }) => toPageResult(await listTopics(toolCaller, routeTopicId, cursor ?? null)),
	)
	mcpServer.registerTool(
		"read_topic_feed",
		{
			title: "Read a topic's feed",
			description:
				"A topic's findings in relevance order, each with Carl's relevance explanation. A connected account's read includes which findings it read and bookmarked.",
			inputSchema: z.object({ topic_id: topicIdArgument, cursor: cursorArgument }),
			annotations: { readOnlyHint: true },
			_meta: toCardToolMeta("findings"),
		},
		async ({ topic_id, cursor }) => {
			const toolTopic = toToolTopicId(routeTopicId, topic_id ?? null)
			if ("rejection" in toolTopic) {
				return toTextResult(toolTopic.rejection, true)
			}
			const mcpPage = await readTopicFeed(toolCaller, toolTopic.topicId, cursor ?? null)
			return toFindingsCardResult({ toolCaller, topicId: toolTopic.topicId, mcpPage })
		},
	)
	mcpServer.registerTool(
		"search_topic_findings",
		{
			title: "Search a topic's findings",
			description: "The topic's findings closest to a query, ranked by meaning over the same index the chat uses.",
			inputSchema: z.object({ topic_id: topicIdArgument, query: z.string().min(1).max(2000), cursor: cursorArgument }),
			annotations: { readOnlyHint: true },
			_meta: toCardToolMeta("findings"),
		},
		async ({ topic_id, query, cursor }) => {
			const toolTopic = toToolTopicId(routeTopicId, topic_id ?? null)
			if ("rejection" in toolTopic) {
				return toTextResult(toolTopic.rejection, true)
			}
			// search the findings. a search that could not run returns a message
			const searchResult = await searchFindings(toolCaller, toolTopic.topicId, query, cursor ?? null)
			if (searchResult && "text" in searchResult) {
				return toTextResult(searchResult.text)
			}
			return toFindingsCardResult({ toolCaller, topicId: toolTopic.topicId, mcpPage: searchResult?.page ?? null })
		},
	)
	mcpServer.registerTool(
		"search",
		{
			title: "Search CarlNotes",
			description:
				"Find topics, podcast episodes, findings, teams, and profiles by name, the same search the site's search bar and search page run. Rank by relevance, newest, or trending, and page through the results. Each result has its url on carlnotes.com. To rank one topic's findings by meaning, use search_topic_findings.",
			inputSchema: searchRequestPayload,
			annotations: { readOnlyHint: true },
			_meta: toCardToolMeta("search"),
		},
		async (searchRequest) => {
			// search under the site's search limit. a caller past it reads a message
			const searchResult = await searchForTool({ toolCaller, clientAddress, searchRequest })
			if ("text" in searchResult) {
				return toTextResult(searchResult.text)
			}
			return {
				content: [{ type: "text", text: toSearchText(searchResult) }],
				structuredContent: searchResult,
				_meta: toCardMeta(await loadSearchCardData(toolCaller, searchResult)),
			}
		},
	)
	mcpServer.registerTool(
		"mark_finding_consumed",
		{
			title: "Mark a finding consumed",
			description: "Mark a finding read for the connected account, the way opening it on the page does.",
			inputSchema: z.object({ finding_id: z.string() }),
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		},
		async ({ finding_id }) => {
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			const isMarkedConsumed = await markFindingConsumed(toolCaller, finding_id)
			return toTextResult(isMarkedConsumed ? "Marked consumed." : "No readable finding has that id.", !isMarkedConsumed)
		},
	)
}

// register the rating, bookmark, and follow tools. each needs an account
function registerFeedbackTools({ mcpServer, toolCaller, routeTopicId }: RegisterToolsOptions): void {
	mcpServer.registerTool(
		"rate_finding",
		{
			title: "Rate a finding",
			description:
				"Thumb a finding up or down for the connected account, or clear the rating with null. Ratings tell Carl what to keep.",
			inputSchema: z.object({ finding_id: z.string(), rating: z.enum(ratings).nullable() }),
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		},
		async ({ finding_id, rating }) => {
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			const isRated = await rateFinding(toolCaller, finding_id, rating)
			return toTextResult(isRated ? "Rated." : "This account may not rate that finding.", !isRated)
		},
	)
	mcpServer.registerTool(
		"bookmark_finding",
		{
			title: "Bookmark a finding",
			description:
				"Keep a finding for the connected account so no later brew filters it out, or drop the bookmark. Bookmarking takes the topic's owner or a team that holds it.",
			inputSchema: z.object({ finding_id: z.string(), is_bookmarked: z.boolean() }),
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		},
		async ({ finding_id, is_bookmarked }) => {
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			const isBookmarkSaved = await bookmarkFinding(toolCaller, finding_id, is_bookmarked)
			return toTextResult(
				isBookmarkSaved ? "Bookmark saved." : "This account may not bookmark that finding.",
				!isBookmarkSaved,
			)
		},
	)
	mcpServer.registerTool(
		"follow_topic",
		{
			title: "Follow a topic",
			description:
				"Follow a topic for the connected account, or unfollow it. Following puts the topic in the account's feed and its list. An owner always follows their own topic.",
			inputSchema: z.object({ topic_id: topicIdArgument, is_following: z.boolean() }),
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
		},
		async ({ topic_id, is_following }) => {
			const toolTopic = toToolTopicId(routeTopicId, topic_id ?? null)
			if ("rejection" in toolTopic) {
				return toTextResult(toolTopic.rejection, true)
			}
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}

			// follow or unfollow through the topic page's own write and its rules
			const isTopicSubscriptionSet = await setTopicSubscription({
				userId: toolCaller.userId,
				topicId: toolTopic.topicId,
				isSubscribed: is_following,
				analyticsProperties: toMcpAnalyticsProperties(toolCaller),
				subscriptionSource: "mcp",
			})
			if (!isTopicSubscriptionSet) {
				return toTextResult(toSubscriptionRejectionText(is_following), true)
			}
			return {
				content: [{ type: "text", text: is_following ? "Following." : "Unfollowed." }],
				structuredContent: { topicId: toolTopic.topicId, isFollowing: is_following },
			}
		},
	)
}

// what a rejected subscribe or unsubscribe says
function toSubscriptionRejectionText(isSubscribing: boolean): string {
	return isSubscribing
		? "No topic this account may follow has that id. A private topic is followed by its owner alone."
		: "This account can't unfollow that topic. An owner always follows their own topic."
}

// who read the findings, their topic, and the page of them
type ToFindingsCardResultOptions = { toolCaller: ToolCaller; topicId: string; mcpPage: McpPage<McpFinding> | null }

// a page of findings as a tool result, with the findings card's data in its _meta
async function toFindingsCardResult({
	toolCaller,
	topicId,
	mcpPage,
}: ToFindingsCardResultOptions): Promise<CallToolResult> {
	const pageResult = toPageResult(mcpPage)
	if (!mcpPage) {
		return pageResult
	}

	// the topic and the page's findings in the site's shape, for the card alone
	const findingIds = mcpPage.items.map((mcpFinding) => mcpFinding.findingId)
	const findingsCardData = await loadFindingsCardData(toolCaller, { topicId, findingIds })
	return findingsCardData ? { ...pageResult, _meta: toCardMeta(findingsCardData) } : pageResult
}
