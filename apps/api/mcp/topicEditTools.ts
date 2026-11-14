// the mcp tools that edit and create a topic: edit_topic, which takes the edit carl proposes in chat and saves it
// through the chat's own save path, the source suggestions, and the create
import { toEditableTopicDraft } from "@carlnotes/contracts/topicEdits"
import { createTopicPayload, proposeTopicEditPayload, topicDraftTeamPayload } from "@carlnotes/contracts/topicPayloads"
import type { CallToolResult } from "@modelcontextprotocol/server"
import { z } from "zod"
import type { AnalyticsProperties } from "../currentUser"
import { loadDefaultTeam, toDraftTeamWithDefault } from "../team/defaultTeam"
import { toRejectionText } from "../tool/chatTools"
import { toCreateTopicText, toSuggestionsText } from "../tool/newTopicChatTools"
import { createTopicFromDraft, suggestTopicDraftSources } from "../tool/topicDraftTools"
import { toPodcastFieldDescription } from "../tool/topicTools"
import { loadTopicPage } from "../topic/topics"
import { toMcpViewMeta } from "./mcpViewData"
import { CONNECT_ACCOUNT_TEXT, toToolTopicId } from "./results"
import { type ToolCaller, toMcpAnalyticsProperties } from "./toolCaller"
import { type RegisterToolsOptions, topicIdArgument, toTextResult } from "./toolShapes"
import {
	isTopicDraftConfirmed,
	toTopicDraftConfirmation,
	toTopicDraftConfirmationRecord,
} from "./topicDraftConfirmations"
import { loadTopicDraftMcpViewOptions } from "./topicDraftMcpViewOptions"
import { type EditTopicResult, editTopic, toEditableTopicFields } from "./topicEdits"
import { toMcpViewToolMeta } from "./uiResources"

// what create_topic takes: a draft whose team, if left out, is the user's default team for a public or invite topic,
// and the confirmation a preview returned. null puts the topic on no team
const createTopicToolPayload = createTopicPayload.extend({
	team: topicDraftTeamPayload.nullable().optional(),
	confirmation: z.string().max(200).optional(),
})

// what edit_topic takes: the topic, the edit carl proposes in chat, and the confirmation a preview returned
const editTopicPayload = proposeTopicEditPayload.extend({
	topic_id: topicIdArgument,
	team_id: z
		.string()
		.min(1)
		.optional()
		.describe("A team to add the topic to or take it off, by the id list_teams shows."),
	is_on_team: z
		.boolean()
		.optional()
		.describe("True adds the topic to team_id, which is the default, and false takes it off."),
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
			description: `Change a CarlNotes topic you may edit: its name, tags, visibility (public, invite, or private), how often it brews (daily, weekdays, or weekly), the time of day as HH:MM and the day a weekly brew runs, how many findings a brew keeps (5, 10, 15, or 20), the prompt every brew scores against, sources to add as option and value pairs, source ids to remove, which list_topics shows, and a team to add the topic to or take it off, which follows the team page's rules.${toPodcastFieldDescription()} Name only what changes. Making a topic public, removing a source, or adding a topic that is not public to a team saves nothing at first: the result shows the topic as it would read and a confirmation. Ask the person, and once they agree, call again with the same edit and that confirmation. Every prompt save keeps a version, and no brew starts. Use it when the user asks Carl or CarlNotes to change a topic, with phrases like edit this topic, change the prompt, add a source, change the schedule, or add this topic to my team.`,
			inputSchema: editTopicPayload,
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
			_meta: toMcpViewToolMeta("topic"),
		},
		async ({ topic_id, team_id, is_on_team, confirmation, ...topicEdit }) => {
			const topicWriteCall = toTopicWriteCall({ toolCaller, routeTopicId, topicId: topic_id })
			if ("rejectionResult" in topicWriteCall) {
				return topicWriteCall.rejectionResult
			}

			// save the edit, or preview one that needs the user's agreement. the saves check edit rights themselves
			const editTopicResult = await editTopic({
				...topicWriteCall,
				topicEdit,
				topicTeamChange: team_id ? { teamId: team_id, isOnTeam: is_on_team ?? true } : null,
				confirmation: confirmation ?? null,
			})
			return toEditTopicToolResult(editTopicResult)
		},
	)
	mcpServer.registerTool(
		"suggest_sources",
		{
			title: "Suggest sources",
			description:
				"Verified sources for a CarlNotes topic name and prompt, each as the option and value create_topic takes. Draws on the account's daily suggestion limit. Use it when the user asks Carl or CarlNotes for sources, with phrases like suggest sources or find sources for this topic.",
			inputSchema: z.object({ name: z.string().min(1), prompt: z.string().min(1) }),
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
		},
		async ({ name, prompt }) => {
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			const suggestTopicDraftSourcesResult = await suggestTopicDraftSources({ userId: toolCaller.userId, name, prompt })
			return {
				...toTextResult(
					toSuggestionsText(suggestTopicDraftSourcesResult),
					suggestTopicDraftSourcesResult.status !== "ok",
				),
				structuredContent: { ...suggestTopicDraftSourcesResult },
			}
		},
	)
	mcpServer.registerTool(
		"create_topic",
		{
			title: "Create a topic",
			description: `Preview a CarlNotes Topic Draft for the connected account from a name, prompt, sources as option and value pairs, invite emails, visibility, team, tags, brew frequency, and finding limit.${toPodcastFieldDescription()} Call only when the user chooses to start a Topic. The first call creates nothing and returns the draft and a confirmation. Show the draft and wait for the user to confirm, then repeat the same fields with that confirmation. Creation uses the existing Topic Draft limits and starts its first brew. A public or invite topic goes on the user's default team, the led team they joined first, unless team names another or is null for no team. For a new send destination, set visibility private, team null, inviteEmails empty, and default Coffee Break on when the view's account budget permits it. Other unsaid fields use the editor's defaults: shared by invite, weekly on Wednesday, ten findings. Use it when the user asks Carl or CarlNotes for a new topic, with phrases like create a topic, start a topic, or have Carl track this.`,
			inputSchema: createTopicToolPayload,
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
			_meta: toMcpViewToolMeta("topic"),
		},
		async ({ confirmation, ...topicDraftFields }) => {
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}

			// a public or invite draft that leaves out its team goes on the user's default team
			const isDefaultTeamNeeded = topicDraftFields.visibility !== "private" && topicDraftFields.team === undefined
			const defaultTeam = isDefaultTeamNeeded ? await loadDefaultTeam(toolCaller.userId) : null
			const topicDraft = {
				...topicDraftFields,
				team: toDraftTeamWithDefault({
					visibility: topicDraftFields.visibility,
					team: topicDraftFields.team,
					defaultTeam,
				}),
			}

			// preview the shared Topic Draft before any creation, source resolution, quota use, or Scan
			const subject = { userId: toolCaller.userId, clientId: toolCaller.clientId, topicDraft }
			if (!isTopicDraftConfirmed(subject, confirmation)) {
				const topicDraftOptions = await loadTopicDraftMcpViewOptions(toolCaller)
				const draftConfirmation = toTopicDraftConfirmation(subject)
				return {
					_meta: toMcpViewMeta({ session: null, podcastEpisodes: [], topicDraftOptions }),
					content: [
						{
							type: "text" as const,
							text: `Nothing was created. Show this Topic Draft and wait for the user to confirm. Then call create_topic with the identical draft and confirmation.\n${JSON.stringify({ topicDraft, confirmation: draftConfirmation })}`,
						},
					],
					structuredContent: {
						status: "createConfirmRequired",
						topicId: null,
						afterTopicDraft: topicDraft,
						confirmation: draftConfirmation,
					},
				}
			}

			// create the topic through the create path's own gate. the result names the topic's id
			const createTopicFromDraftResult = await createTopicFromDraft({
				userId: toolCaller.userId,
				confirmationRecord: toTopicDraftConfirmationRecord(confirmation),
				topicDraft,
				origin: "mcp",
				analyticsProperties: toMcpAnalyticsProperties(toolCaller),
			})
			if (createTopicFromDraftResult.status !== "created") {
				return toTextResult(toCreateTopicText(createTopicFromDraftResult), true)
			}

			// the new topic as its page reads it, for the topic MCP view
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
type ToTopicWriteCallOptions = { toolCaller: ToolCaller; routeTopicId: string | null; topicId: string | undefined }

/**
 * Returns the account that a tool writes as and the topic it writes to, or the result that rejects the call. A missing or
 * mismatched topic is rejected before a caller with no connected account is.
 */
export function toTopicWriteCall({
	toolCaller,
	routeTopicId,
	topicId,
}: ToTopicWriteCallOptions):
	| { userId: string; topicId: string; analyticsProperties: AnalyticsProperties }
	| { rejectionResult: CallToolResult } {
	const toolTopic = toToolTopicId(routeTopicId, topicId ?? null)
	if ("rejection" in toolTopic) {
		return { rejectionResult: toTextResult(toolTopic.rejection, true) }
	}

	// a write saves as a connected account, with the call's analytics properties
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
	return `Nothing is saved yet. This edit ${editTopicResult.topicEditChanges.join(" and ")}. Ask the person, and once they agree, call edit_topic again with the same edit and the confirmation ${editTopicResult.confirmation}.`
}
