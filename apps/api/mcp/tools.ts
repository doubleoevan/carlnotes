// the tools the mcp server registers: their names, schemas, annotations, and what each returns. the tools that edit and
// create a topic are in topicEditTools.ts

import { searchRequestPayload } from "@carlnotes/contracts/search"
import type { CallToolResult } from "@modelcontextprotocol/server"
import { z } from "zod"
import { registerAccountTool } from "./accountTool"
import { registerActivityTool } from "./activityTool"
import { registerDashboardTool } from "./dashboardTool"
import { registerFeedbackTools, registerFindingFeedbackTool } from "./feedbackTools"
import { loadFindingsMcpViewData, loadSearchMcpViewData, toMcpViewMeta } from "./mcpViewData"
import { registerNewsTool } from "./newsTool"
import { registerNoteTools } from "./noteTools"
import { registerPersonalSourcesTools } from "./personalSourcesTools"
import { registerProfileTool } from "./profileTool"
import { registerReportTools } from "./reportTools"
import {
	BOUND_SERVER_TEXT,
	CONNECT_ACCOUNT_TEXT,
	type McpFinding,
	type McpPage,
	markFindingConsumed,
	readTopicFeed,
	searchFindings,
	type TopicFeed,
	toToolTopicId,
} from "./results"
import { registerScanTools } from "./scanTools"
import { searchForTool, toSearchText } from "./searchResults"
import { registerSocialTools } from "./socialTools"
import { registerTeamTools } from "./teamTools"
import { registerTeamWriteTools } from "./teamWriteTools"
import type { ToolCaller } from "./toolCaller"
import { type RegisterToolsOptions, toPageResult, topicIdArgument, toTextResult } from "./toolShapes"
import { registerTopicAttachmentTool } from "./topicAttachmentTool"
import { registerTopicContextTool } from "./topicContextTool"
import { registerTopicEditTools } from "./topicEditTools"
import { registerTopicImageTool } from "./topicImageTool"
import { registerTopicMemoriesTool } from "./topicMemoriesTool"
import { registerTopicPostTools } from "./topicPostTools"
import {
	listSimilarTopics,
	listTopicSectionTopics,
	listTopics,
	type McpTopic,
	TOPIC_SECTION_ARGUMENTS,
	type TopicSectionArgument,
} from "./topicResults"
import { loadTopicsMcpViewData, type TopicsRead } from "./topicsMcpViewData"
import { registerMcpUiResources, toMcpViewToolMeta } from "./uiResources"
import { registerUpdatesTool } from "./updatesTool"

// the cursor argument the paged reads take
const cursorArgument = z.string().optional().describe("The cursor a previous page returned.")

/**
 * Registers every tool. Every tool caller gets the same list, and only the results differ.
 */
export function registerTools(registerToolsOptions: RegisterToolsOptions): void {
	registerMcpUiResources(registerToolsOptions.mcpServer)
	registerReadTools(registerToolsOptions)
	registerFeedbackTools(registerToolsOptions)
	registerTopicEditTools(registerToolsOptions)
	registerTopicImageTool(registerToolsOptions)
	registerTopicAttachmentTool(registerToolsOptions)
	// register the note, team, profile, activity, account, report, and Personal sources tools
	registerNoteTools(registerToolsOptions)
	registerTeamTools(registerToolsOptions)
	registerTeamWriteTools(registerToolsOptions)
	registerProfileTool(registerToolsOptions)
	registerActivityTool(registerToolsOptions)
	registerAccountTool(registerToolsOptions)
	registerReportTools(registerToolsOptions)
	registerPersonalSourcesTools(registerToolsOptions)
	// register the updates, Scan, Topic context, finding feedback, and social tools
	registerUpdatesTool(registerToolsOptions)
	registerScanTools(registerToolsOptions)
	registerTopicContextTool(registerToolsOptions)
	registerTopicMemoriesTool(registerToolsOptions)
	registerFindingFeedbackTool(registerToolsOptions)
	registerSocialTools(registerToolsOptions)
	// register the news, the Topic Post reads, and the Dashboard read
	registerNewsTool(registerToolsOptions)
	registerTopicPostTools(registerToolsOptions)
	registerDashboardTool(registerToolsOptions)
}

// register the read tools, the site search, and the consumed write
function registerReadTools({ mcpServer, toolCaller, routeTopicId, clientAddress }: RegisterToolsOptions): void {
	mcpServer.registerTool(
		"list_topics",
		{
			title: "List topics",
			description:
				"The topics you may read on CarlNotes, Carl's app: the public ones for everyone, plus what a connected account owns, follows, and holds through a team. A section lists one section of the topics page: yours, followed, featured, or popular. similar_to_topic_id lists the similar topics a topic's page shows. Use it when the user asks Carl or CarlNotes for topics, with phrases like list my topics, what topics do I follow, what is popular, topics like this one, or what does Carl cover.",
			inputSchema: z.object({
				section: z
					.enum(Object.keys(TOPIC_SECTION_ARGUMENTS) as [TopicSectionArgument, ...TopicSectionArgument[]])
					.optional()
					.describe("One section of the topics page. A visitor reads featured and popular."),
				similar_to_topic_id: z.string().min(1).optional().describe("A topic whose similar topics to list."),
				cursor: cursorArgument,
			}),
			annotations: { title: "List topics", readOnlyHint: true },
			_meta: toMcpViewToolMeta("topics"),
		},
		async ({ section, similar_to_topic_id, cursor }) => {
			// a topic's similar topics, never on a bound server
			if (similar_to_topic_id) {
				return routeTopicId
					? toTextResult(BOUND_SERVER_TEXT, true)
					: toSimilarTopicsMcpViewResult(toolCaller, similar_to_topic_id, cursor ?? null)
			}

			// the whole list, the bound topic alone on a bound server
			if (!section) {
				const mcpPage = await listTopics(toolCaller, routeTopicId, cursor ?? null)
				return toTopicsMcpViewResult(toolCaller, mcpPage, { kind: "section", sectionKey: null })
			}
			if (routeTopicId) {
				return toTextResult(BOUND_SERVER_TEXT, true)
			}

			// one section of the topics page
			return toTopicSectionMcpViewResult(toolCaller, section, cursor ?? null)
		},
	)
	mcpServer.registerTool(
		"read_topic_feed",
		{
			title: "Read a topic's feed",
			description:
				"A CarlNotes topic's findings in relevance order, each with Carl's relevance explanation. A connected account's read includes which findings it read and bookmarked. Use it when the user asks Carl or CarlNotes for a topic's findings, with phrases like show this topic, what did Carl find, or read my feed.",
			inputSchema: z.object({ topic_id: topicIdArgument, cursor: cursorArgument }),
			annotations: { title: "Read a topic's feed", readOnlyHint: true },
			_meta: toMcpViewToolMeta("findings"),
		},
		async ({ topic_id, cursor }) => {
			const toolTopic = toToolTopicId(routeTopicId, topic_id ?? null)
			if ("rejection" in toolTopic) {
				return toTextResult(toolTopic.rejection, true)
			}
			const topicFeed = await readTopicFeed(toolCaller, toolTopic.topicId, cursor ?? null)
			return toFindingsMcpViewResult({
				toolCaller,
				topicId: toolTopic.topicId,
				mcpPage: topicFeed?.mcpPage ?? null,
				topicFeed: topicFeed ?? undefined,
			})
		},
	)
	mcpServer.registerTool(
		"search_topic_findings",
		{
			title: "Search a topic's findings",
			description:
				"A CarlNotes topic's findings closest to a query, ranked by meaning over the same index Carl's chat uses. Use it when the user asks Carl or CarlNotes about something on one topic, with phrases like search this topic, or what does Carl have on.",
			inputSchema: z.object({ topic_id: topicIdArgument, query: z.string().min(1).max(2000), cursor: cursorArgument }),
			annotations: { title: "Search a topic's findings", readOnlyHint: true },
			_meta: toMcpViewToolMeta("findings"),
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
			return toFindingsMcpViewResult({ toolCaller, topicId: toolTopic.topicId, mcpPage: searchResult?.page ?? null })
		},
	)
	mcpServer.registerTool(
		"search",
		{
			title: "Search CarlNotes",
			description:
				"Find CarlNotes topics, podcast episodes, posts, findings, teams, and profiles by name, the same search the site's search bar and search page run. Rank by relevance, newest, or trending, and page through the results. Each result has its url on carlnotes.com. To rank one topic's findings by meaning, use search_topic_findings. Use it when the user asks Carl or CarlNotes to find something across the site, with phrases like search CarlNotes, find a topic, or look up a podcast episode.",
			inputSchema: searchRequestPayload,
			annotations: { title: "Search CarlNotes", readOnlyHint: true },
			_meta: toMcpViewToolMeta("search"),
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
				_meta: toMcpViewMeta(await loadSearchMcpViewData(toolCaller, searchResult)),
			}
		},
	)
	mcpServer.registerTool(
		"mark_finding_consumed",
		{
			title: "Mark a finding consumed",
			description:
				"Mark a CarlNotes finding read for the connected account, the way opening it on the page does. Use it when the user tells Carl or CarlNotes they read a finding, with phrases like mark this read or I read this.",
			inputSchema: z.object({ finding_id: z.string() }),
			annotations: {
				title: "Mark a finding consumed",
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: true,
			},
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

// a page of topics as a tool result, with the topics MCP view's data in its _meta
async function toTopicsMcpViewResult(
	toolCaller: ToolCaller,
	mcpPage: McpPage<McpTopic>,
	topicsRead: TopicsRead,
): Promise<CallToolResult> {
	const topicsMcpViewData = await loadTopicsMcpViewData(toolCaller, mcpPage, topicsRead)
	return { ...toPageResult(mcpPage), _meta: toMcpViewMeta(topicsMcpViewData) }
}

// a topic's similar topics as a tool result with the topics MCP view's data, or none for a topic the caller may not
// open
async function toSimilarTopicsMcpViewResult(
	toolCaller: ToolCaller,
	topicId: string,
	cursor: string | null,
): Promise<CallToolResult> {
	const similarTopics = await listSimilarTopics(toolCaller, topicId, cursor)
	if (!similarTopics) {
		return toPageResult(null)
	}
	const { topicName, relatedTopics, mcpPage } = similarTopics
	return toTopicsMcpViewResult(toolCaller, mcpPage, { kind: "similarTopics", topicName, relatedTopics })
}

// one section of the topics page as a tool result with the topics MCP view's data. a visitor connects an account
// to read their own topics
async function toTopicSectionMcpViewResult(
	toolCaller: ToolCaller,
	section: TopicSectionArgument,
	cursor: string | null,
): Promise<CallToolResult> {
	if (toolCaller.kind !== "user" && (section === "yours" || section === "followed")) {
		return toTextResult(CONNECT_ACCOUNT_TEXT)
	}

	// the section's page of topics
	const mcpPage = await listTopicSectionTopics(toolCaller, section, cursor)
	return toTopicsMcpViewResult(toolCaller, mcpPage, {
		kind: "section",
		sectionKey: TOPIC_SECTION_ARGUMENTS[section],
	})
}

// who read the findings, their topic, the page of them, and the feed that read them if a feed did
type ToFindingsMcpViewResultOptions = {
	toolCaller: ToolCaller
	topicId: string
	mcpPage: McpPage<McpFinding> | null
	topicFeed?: TopicFeed
}

// a page of findings as a tool result, with the findings MCP view's data in its _meta
async function toFindingsMcpViewResult({
	toolCaller,
	topicId,
	mcpPage,
	topicFeed,
}: ToFindingsMcpViewResultOptions): Promise<CallToolResult> {
	if (!mcpPage) {
		return toPageResult(mcpPage)
	}
	const pageResult = toPageResult(mcpPage)

	// the topic and the page's findings in the site's shape, for the MCP view alone
	const findingIds = mcpPage.items.map((mcpFinding) => mcpFinding.findingId)
	const findingsMcpViewData = await loadFindingsMcpViewData(toolCaller, { topicId, findingIds, topicFeed })
	return findingsMcpViewData ? { ...pageResult, _meta: toMcpViewMeta(findingsMcpViewData) } : pageResult
}
