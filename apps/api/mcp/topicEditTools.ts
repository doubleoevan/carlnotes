// the mcp tools that edit and create a topic: edit_topic, which takes the edit carl proposes in chat and saves it
// through the chat's own save path, the source suggestions, and the create
import { toEditableTopicDraft } from "@carlnotes/contracts/topicEdits"
import { createTopicPayload, proposeTopicEditPayload } from "@carlnotes/contracts/topicPayloads"
import type { CallToolResult } from "@modelcontextprotocol/server"
import { z } from "zod"
import type { AnalyticsProperties } from "../currentUser"
import { toRejectionText } from "../tool/chatTools"
import { toCreateTopicText, toSuggestionsText } from "../tool/newTopicChatTools"
import { createTopicFromDraft, suggestTopicDraftSources } from "../tool/topicDraftTools"
import { toPodcastFieldDescription } from "../tool/topicTools"
import { loadTopicPage } from "../topic/topics"
import { toCardToolMeta } from "./cards"
import { CONNECT_ACCOUNT_TEXT, toToolTopicId } from "./results"
import { type ToolCaller, toMcpAnalyticsProperties } from "./toolCaller"
import { type RegisterToolsOptions, topicIdArgument, toTextResult } from "./toolShapes"
import { type EditTopicResult, editTopic, toEditableTopicFields } from "./topicEdits"

// what edit_topic takes: the topic, the edit carl proposes in chat, and the confirmation a preview returned
const editTopicPayload = proposeTopicEditPayload.extend({
	topic_id: topicIdArgument,
	confirmation: z
		.string()
		.optional()
		.describe("The confirmation a previous call returned for this same edit, once the person agreed to it."),
})

/**
 * Registers the tools that edit and create a topic.
 */
export function registerTopicEditTools({ mcpServer, toolCaller, routeTopicId }: RegisterToolsOptions): void {
	mcpServer.registerTool(
		"edit_topic",
		{
			title: "Edit a topic",
			description: `Change a topic you may edit: its name, tags, visibility (public, invite, or private), how often it brews (daily, weekdays, or weekly), the time of day as HH:MM and the day a weekly brew runs, how many findings a brew keeps (5, 10, 15, or 20), the prompt every brew scores against, sources to add as option and value pairs, and source ids to remove, which list_topics shows.${toPodcastFieldDescription()} Name only what changes. Making a topic public or removing a source saves nothing at first: the result shows the topic as it would read and a confirmation. Ask the person, and once they agree, call again with the same edit and that confirmation. Every prompt save keeps a version, and no brew starts.`,
			inputSchema: editTopicPayload,
			annotations: { readOnlyHint: false, destructiveHint: true },
			_meta: toCardToolMeta("topic"),
		},
		async ({ topic_id, confirmation, ...topicEdit }) => {
			const topicEditCall = toTopicEditCall({ toolCaller, routeTopicId, topicId: topic_id })
			if ("rejectionResult" in topicEditCall) {
				return topicEditCall.rejectionResult
			}

			// save the edit, or preview one that needs the user's agreement. the saves check edit rights themselves
			const editTopicResult = await editTopic({ ...topicEditCall, topicEdit, confirmation: confirmation ?? null })
			return toEditTopicToolResult(editTopicResult)
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
			description: `Create a topic for the connected account from a name, a prompt, sources as option and value pairs, invite emails, a visibility of public, invite, or private, the team it joins as the id and name of a team the account leads, tags, how often it brews (daily, weekdays, or weekly), and how many findings a brew keeps (5, 10, 15, or 20).${toPodcastFieldDescription()} Unsaid fields take the editor's defaults: shared by invite, weekly on Wednesday, ten findings. Its first brew starts.`,
			inputSchema: createTopicPayload,
			annotations: { readOnlyHint: false, destructiveHint: true },
			_meta: toCardToolMeta("topic"),
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

			// the new topic as its page reads it, for the topic card
			const { topicId, name } = createTopicFromDraftResult
			const topicPage = await loadTopicPage(toolCaller.userId, topicId)
			const afterTopicDraft = topicPage ? toEditableTopicDraft(toEditableTopicFields(topicPage)) : null
			return {
				content: [{ type: "text", text: `${toCreateTopicText(createTopicFromDraftResult)} Its id is ${topicId}.` }],
				structuredContent: { status: "created", topicId, name, afterTopicDraft },
			}
		},
	)
}

// who is calling, the topic the route binds, and the topic id argument
type ToTopicEditCallOptions = { toolCaller: ToolCaller; routeTopicId: string | null; topicId: string | undefined }

// the account that an edit saves as and the topic it edits, or the result that rejects the call. a missing or
// mismatched topic is rejected before a caller with no connected account is
function toTopicEditCall({
	toolCaller,
	routeTopicId,
	topicId,
}: ToTopicEditCallOptions):
	| { userId: string; topicId: string; analyticsProperties: AnalyticsProperties }
	| { rejectionResult: CallToolResult } {
	const toolTopic = toToolTopicId(routeTopicId, topicId ?? null)
	if ("rejection" in toolTopic) {
		return { rejectionResult: toTextResult(toolTopic.rejection, true) }
	}

	// an edit saves as a connected account, with the call's analytics properties
	if (toolCaller.kind !== "user") {
		return { rejectionResult: toTextResult(CONNECT_ACCOUNT_TEXT) }
	}
	return {
		userId: toolCaller.userId,
		topicId: toolTopic.topicId,
		analyticsProperties: toMcpAnalyticsProperties(toolCaller),
	}
}

// shape an edit's result: a rejection's text, a preview's question and confirmation, or each save's line
function toEditTopicToolResult(editTopicResult: EditTopicResult): CallToolResult {
	if (editTopicResult.status === "missing" || editTopicResult.status === "forbidden") {
		return toTextResult(toRejectionText(editTopicResult.status), true)
	}

	// a preview saves nothing, and says what the user must agree to and how to confirm it
	if (editTopicResult.status === "confirmRequired") {
		return {
			content: [{ type: "text", text: toConfirmRequiredText(editTopicResult) }],
			structuredContent: editTopicResult,
		}
	}

	// each save's line, and an error only if nothing saved
	const isNothingSaved = editTopicResult.savedLines.length === 0 && editTopicResult.rejectedLines.length > 0
	const saveText = editTopicResult.serverToolCallOutputs.join(" ") || "Nothing in that edit changes the topic."
	return { content: [{ type: "text", text: saveText }], structuredContent: editTopicResult, isError: isNothingSaved }
}

// the text of a preview that needs the user's agreement: what it would do, and how to confirm it
function toConfirmRequiredText(editTopicResult: Extract<EditTopicResult, { status: "confirmRequired" }>): string {
	// name each change that needs agreement, a removed source by its kind and summary
	const removedSourceLabels = editTopicResult.topicSources
		.filter((topicSource) => editTopicResult.removeSourceIds.includes(topicSource.id))
		.map((topicSource) => `${topicSource.sourceKind} ${topicSource.summary}`.trim())
	const changeLines = [
		...(editTopicResult.topicEditConfirmationReasons.includes("goesPublic")
			? ["makes the topic public, so anyone can read it"]
			: []),
		...(editTopicResult.topicEditConfirmationReasons.includes("removesSources")
			? [`removes ${removedSourceLabels.join(", ")}`]
			: []),
	]
	return `Nothing is saved yet. This edit ${changeLines.join(" and ")}. Ask the person, and once they agree, call edit_topic again with the same edit and the confirmation ${editTopicResult.confirmation}.`
}
