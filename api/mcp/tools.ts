// the eleven tools the mcp mcpServer registers: their names, schemas, annotations, and what each returns
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"
import {
	addTopicSourcePayload,
	createTopicPayload,
	removeTopicSourcePayload,
	updateTopicFieldsPayload,
	updateTopicPromptPayload,
} from "@shared/contracts"
import { ratings } from "@shared/enums"
import { z } from "zod"
import {
	toAddTopicSourceText,
	toCreateTopicText,
	toRejectionText,
	toSuggestionsText,
	toUpdateTopicFieldsText,
} from "../tool/chatTools"
import {
	addTopicSource,
	createTopicFromDraft,
	removeTopicSource,
	suggestTopicDraftSources,
	updateTopicFields,
	updateTopicPrompt,
} from "../tool/topicTools"
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
import { type ToolCaller, toMcpAnalyticsProperties } from "./toolCaller"

// the two arguments tools share. on the bound route the topic id comes from the url
const topicIdArgument = z
	.string()
	.optional()
	.describe("The topic's id. Optional on a topic-bound server, which already knows its topic.")
const cursorArgument = z.string().optional().describe("The cursor a previous page returned.")

// register the eleven tools. every tool caller gets the same list, and only the results differ
export function registerTools(mcpServer: McpServer, toolCaller: ToolCaller, routeTopicId: string | null): void {
	registerReadTools(mcpServer, toolCaller, routeTopicId)
	registerMarkTools(mcpServer, toolCaller)
	registerTopicTools(mcpServer, toolCaller, routeTopicId)
}

// register the three reads and the consumed write
function registerReadTools(mcpServer: McpServer, toolCaller: ToolCaller, routeTopicId: string | null): void {
	mcpServer.registerTool(
		"list_topics",
		{
			title: "List topics",
			description:
				"The topics this toolCaller may read: the public ones for everyone, plus what a connected account owns, follows, and holds through a team.",
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
		},
		async ({ topic_id, cursor }) => {
			const toolTopic = toToolTopicId(routeTopicId, topic_id ?? null)
			if ("rejection" in toolTopic) {
				return toTextResult(toolTopic.rejection, true)
			}
			return toPageResult(await readTopicFeed(toolCaller, toolTopic.topicId, cursor ?? null))
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
			const searchResult = await searchFindings(toolCaller, toolTopic.topicId, query, cursor ?? null)
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
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			const isMarkedConsumed = await markFindingConsumed(toolCaller, finding_id)
			return toTextResult(isMarkedConsumed ? "Marked consumed." : "No readable finding has that id.", !isMarkedConsumed)
		},
	)
}

// register the rating and bookmark tools. both need an account
function registerMarkTools(mcpServer: McpServer, toolCaller: ToolCaller): void {
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
}

// register the five topic tools. confirmation is left to the client
function registerTopicTools(mcpServer: McpServer, toolCaller: ToolCaller, routeTopicId: string | null): void {
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
			if ("rejection" in toolTopic || toolCaller.kind !== "user") {
				return "rejection" in toolTopic ? toTextResult(toolTopic.rejection, true) : toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			// save the prompt. the tool checks edit rights itself
			const updateTopicPromptResult = await updateTopicPrompt({
				userId: toolCaller.userId,
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
		"update_topic_fields",
		{
			title: "Change a topic's settings",
			description:
				"Change the topic's tags, how often it brews (daily, weekdays, or weekly), or how many findings a brew keeps (5, 10, 15, or 20). Name only the fields to change. No brew starts.",
			inputSchema: z.object({ topic_id: topicIdArgument, ...updateTopicFieldsPayload.shape }),
			annotations: { readOnlyHint: false, destructiveHint: true },
		},
		async ({ topic_id, ...topicFields }) => {
			const toolTopic = toToolTopicId(routeTopicId, topic_id ?? null)
			if ("rejection" in toolTopic || toolCaller.kind !== "user") {
				return "rejection" in toolTopic ? toTextResult(toolTopic.rejection, true) : toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			// save the named settings. the tool checks edit rights itself
			const updateTopicFieldsResult = await updateTopicFields({
				userId: toolCaller.userId,
				topicId: toolTopic.topicId,
				topicFields,
				promptVersionOrigin: "mcp",
			})
			return updateTopicFieldsResult.status === "saved"
				? toTextResult(`Saved the settings for ${updateTopicFieldsResult.topicName}. The next brew follows them.`)
				: toTextResult(toUpdateTopicFieldsText(updateTopicFieldsResult), true)
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
			if ("rejection" in toolTopic || toolCaller.kind !== "user") {
				return "rejection" in toolTopic ? toTextResult(toolTopic.rejection, true) : toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			// add the source. the tool checks edit rights itself
			const addTopicSourceResult = await addTopicSource({
				userId: toolCaller.userId,
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
			if ("rejection" in toolTopic || toolCaller.kind !== "user") {
				return "rejection" in toolTopic ? toTextResult(toolTopic.rejection, true) : toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			// remove the source. the tool checks edit rights itself
			const removeTopicSourceResult = await removeTopicSource({
				userId: toolCaller.userId,
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
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			const suggestTopicDraftSourcesResult = await suggestTopicDraftSources({ userId: toolCaller.userId, name, prompt })
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
				"Create a topic for the connected account from a name, a prompt, sources as option and value pairs, invite emails, a visibility of public, invite, or private, the team it joins as the id and name of a team the account leads, tags, how often it brews (daily, weekdays, or weekly), and how many findings a brew keeps (5, 10, 15, or 20). Unsaid fields take the editor's defaults: shared by invite, weekly on Wednesday, ten findings. Its first brew starts.",
			inputSchema: createTopicPayload,
			annotations: { readOnlyHint: false, destructiveHint: true },
		},
		async (topicDraft) => {
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			// create the topic through the create path's own gate. the result names the topic's id
			const createTopicFromDraftResult = await createTopicFromDraft({
				userId: toolCaller.userId,
				topicDraft,
				origin: "mcp",
				analyticsProperties: toMcpAnalyticsProperties(toolCaller),
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
