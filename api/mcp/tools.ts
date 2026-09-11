// the eleven tools the mcp mcpServer registers: their names, schemas, annotations, and what each returns
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import {
	addTopicSourcePayload,
	createTopicPayload,
	removeTopicSourcePayload,
	updateTopicPromptPayload,
} from "@shared/contracts"
import { ratings } from "@shared/enums"
import { z } from "zod"
import { toAddTopicSourceText, toCreateTopicText, toRejectionText, toSuggestionsText } from "../tool/chatTools"
import {
	addTopicSource,
	createTopicFromDraft,
	removeTopicSource,
	suggestTopicDraftSources,
	updateTopicPrompt,
} from "../tool/topicTools"
import { type Caller, toMcpAnalyticsProperties } from "./caller"
import {
	bookmarkFinding,
	CONNECT_ACCOUNT_TEXT,
	listTopics,
	type McpPage,
	markFindingConsumed,
	rateFinding,
	readTopicFeed,
	searchFindings,
	toToolTopicId,
} from "./results"

// the two arguments tools share. on the bound route the topic id comes from the url
const topicIdArgument = z
	.string()
	.optional()
	.describe("The topic's id. Optional on a topic-bound server, which already knows its topic.")
const cursorArgument = z.string().optional().describe("The cursor a previous page returned.")

// register the eleven tools. every caller gets the same list, and only the results differ
export function registerTools(mcpServer: McpServer, caller: Caller, routeTopicId: string | null): void {
	registerReadTools(mcpServer, caller, routeTopicId)
	registerMarkTools(mcpServer, caller)
	registerTopicTools(mcpServer, caller, routeTopicId)
}

// register the three reads and the consumed write
function registerReadTools(mcpServer: McpServer, caller: Caller, routeTopicId: string | null): void {
	mcpServer.registerTool(
		"list_topics",
		{
			title: "List topics",
			description:
				"The topics this caller may read: the public ones for everyone, plus what a connected account owns, follows, and holds through a team.",
			inputSchema: z.object({ cursor: cursorArgument }),
			annotations: { readOnlyHint: true },
		},
		async ({ cursor }) => toPageResult(await listTopics(caller, routeTopicId, cursor ?? null)),
	)
	mcpServer.registerTool(
		"read_topic_feed",
		{
			title: "Read a topic's feed",
			description:
				"A topic's findings in relevance order, each with Carl's relevance explanation. A connected account's read includes which findings it read and bookmarked.",
			inputSchema: z.object({ topic_id: topicIdArgument, cursor: cursorArgument }),
			annotations: { readOnlyHint: true },
		},
		async ({ topic_id, cursor }) => {
			const toolTopic = toToolTopicId(routeTopicId, topic_id ?? null)
			if ("rejection" in toolTopic) {
				return toTextResult(toolTopic.rejection, true)
			}
			return toPageResult(await readTopicFeed(caller, toolTopic.topicId, cursor ?? null))
		},
	)
	mcpServer.registerTool(
		"search_topic_findings",
		{
			title: "Search a topic's findings",
			description: "The topic's findings closest to a query, ranked by meaning over the same index the chat uses.",
			inputSchema: z.object({ topic_id: topicIdArgument, query: z.string().min(1).max(2000), cursor: cursorArgument }),
			annotations: { readOnlyHint: true },
		},
		async ({ topic_id, query, cursor }) => {
			const toolTopic = toToolTopicId(routeTopicId, topic_id ?? null)
			if ("rejection" in toolTopic) {
				return toTextResult(toolTopic.rejection, true)
			}
			// search the findings. a search that could not run returns a message
			const searchResult = await searchFindings(caller, toolTopic.topicId, query, cursor ?? null)
			if (searchResult && "text" in searchResult) {
				return toTextResult(searchResult.text)
			}
			return toPageResult(searchResult?.page ?? null)
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
			if (caller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			const isMarkedConsumed = await markFindingConsumed(caller, finding_id)
			return toTextResult(isMarkedConsumed ? "Marked consumed." : "No readable finding has that id.", !isMarkedConsumed)
		},
	)
}

// register the rating and bookmark tools. both need an account
function registerMarkTools(mcpServer: McpServer, caller: Caller): void {
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
			if (caller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			const isRated = await rateFinding(caller, finding_id, rating)
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
			if (caller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			const isBookmarkSaved = await bookmarkFinding(caller, finding_id, is_bookmarked)
			return toTextResult(
				isBookmarkSaved ? "Bookmark saved." : "This account may not bookmark that finding.",
				!isBookmarkSaved,
			)
		},
	)
}

// register the five topic tools. confirmation is left to the client
function registerTopicTools(mcpServer: McpServer, caller: Caller, routeTopicId: string | null): void {
	mcpServer.registerTool(
		"update_topic_prompt",
		{
			title: "Update a topic's prompt",
			description:
				"Rewrite what the topic is looking for, the prompt every brew scores against. Every save keeps a version. No brew starts.",
			inputSchema: z.object({ topic_id: topicIdArgument, ...updateTopicPromptPayload.shape }),
			annotations: { readOnlyHint: false, destructiveHint: true },
		},
		async ({ topic_id, prompt }) => {
			const toolTopic = toToolTopicId(routeTopicId, topic_id ?? null)
			if ("rejection" in toolTopic || caller.kind !== "user") {
				return "rejection" in toolTopic ? toTextResult(toolTopic.rejection, true) : toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			// save the prompt. the tool checks edit rights itself
			const updateTopicPromptResult = await updateTopicPrompt({
				userId: caller.userId,
				topicId: toolTopic.topicId,
				prompt,
				origin: "mcp",
			})
			return updateTopicPromptResult.status === "saved"
				? toTextResult(`Saved the new prompt for ${updateTopicPromptResult.topicName}. The next brew reads it.`)
				: toTextResult(toRejectionText(updateTopicPromptResult.status), true)
		},
	)
	mcpServer.registerTool(
		"add_source",
		{
			title: "Add a source",
			description:
				"Add somewhere for the topic to read: a default source key, or a custom source option with its value. Returns what one more source is projected to cost. No brew starts.",
			inputSchema: z.object({ topic_id: topicIdArgument, ...addTopicSourcePayload.shape }),
			annotations: { readOnlyHint: false, destructiveHint: true },
		},
		async ({ topic_id, sourceOption, value }) => {
			const toolTopic = toToolTopicId(routeTopicId, topic_id ?? null)
			if ("rejection" in toolTopic || caller.kind !== "user") {
				return "rejection" in toolTopic ? toTextResult(toolTopic.rejection, true) : toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			// add the source. the tool checks edit rights itself
			const addTopicSourceResult = await addTopicSource({
				userId: caller.userId,
				topicId: toolTopic.topicId,
				sourceOption,
				value,
				origin: "mcp",
			})
			return toTextResult(
				toAddTopicSourceText(addTopicSourceResult),
				addTopicSourceResult.status === "missing" || addTopicSourceResult.status === "forbidden",
			)
		},
	)
	mcpServer.registerTool(
		"remove_source",
		{
			title: "Remove a source",
			description:
				"Drop one of the topic's sources by its id, which list_topics shows beside each source. No brew starts.",
			inputSchema: z.object({ topic_id: topicIdArgument, ...removeTopicSourcePayload.shape }),
			annotations: { readOnlyHint: false, destructiveHint: true },
		},
		async ({ topic_id, sourceId }) => {
			const toolTopic = toToolTopicId(routeTopicId, topic_id ?? null)
			if ("rejection" in toolTopic || caller.kind !== "user") {
				return "rejection" in toolTopic ? toTextResult(toolTopic.rejection, true) : toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			// remove the source. the tool checks edit rights itself
			const removeTopicSourceResult = await removeTopicSource({
				userId: caller.userId,
				topicId: toolTopic.topicId,
				sourceId,
				origin: "mcp",
			})
			if (removeTopicSourceResult.status !== "saved") {
				return toTextResult(toRejectionText(removeTopicSourceResult.status), true)
			}
			// name the removed source, or say it was already gone
			return toTextResult(
				removeTopicSourceResult.topicSourceLabel
					? `Removed ${removeTopicSourceResult.topicSourceLabel}.`
					: "That source was already gone.",
			)
		},
	)
	mcpServer.registerTool(
		"suggest_sources",
		{
			title: "Suggest sources",
			description:
				"Verified sources for a topic name and prompt, each as the option and value create_topic takes. Draws on the account's daily suggestion limit.",
			inputSchema: z.object({ name: z.string().min(1), prompt: z.string().min(1) }),
			annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
		},
		async ({ name, prompt }) => {
			if (caller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			const suggestTopicDraftSourcesResult = await suggestTopicDraftSources({ userId: caller.userId, name, prompt })
			return toTextResult(
				toSuggestionsText(suggestTopicDraftSourcesResult),
				suggestTopicDraftSourcesResult.status !== "ok",
			)
		},
	)
	mcpServer.registerTool(
		"create_topic",
		{
			title: "Create a topic",
			description:
				"Create a topic for the connected account from a name, a prompt, sources as option and value pairs, invite emails, and a visibility of public, invite, or private, shared by invite when unsaid. The schedule takes the editor's defaults: weekly on Wednesday, ten results. Its first brew starts.",
			inputSchema: createTopicPayload,
			annotations: { readOnlyHint: false, destructiveHint: true },
		},
		async (topicDraft) => {
			if (caller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			// create the topic through the create path's own gate. the result names the topic's id
			const createTopicFromDraftResult = await createTopicFromDraft({
				userId: caller.userId,
				topicDraft,
				origin: "mcp",
				analyticsProperties: toMcpAnalyticsProperties(caller),
			})
			if (createTopicFromDraftResult.status !== "created") {
				return toTextResult(toCreateTopicText(createTopicFromDraftResult), true)
			}
			return {
				content: [
					{
						type: "text",
						text: `${toCreateTopicText(createTopicFromDraftResult)} Its id is ${createTopicFromDraftResult.topicId}.`,
					},
				],
				structuredContent: { topicId: createTopicFromDraftResult.topicId, name: createTopicFromDraftResult.name },
			}
		},
	)
}

// shape a page as a tool result, as json text and as structured content. some clients read only the text
function toPageResult(mcpPage: McpPage<unknown> | null): CallToolResult {
	if (!mcpPage) {
		return toTextResult("No readable topic has that id.", true)
	}
	return { content: [{ type: "text", text: JSON.stringify(mcpPage) }], structuredContent: mcpPage }
}

// shape text as a tool result
function toTextResult(text: string, isError = false): CallToolResult {
	return { content: [{ type: "text", text }], isError }
}
