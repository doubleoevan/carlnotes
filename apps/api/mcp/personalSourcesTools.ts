// deliberate content sends use the same service as send-only API credentials
import { personalSourcesSendPayload, suggestTopicsPayload } from "@carlnotes/contracts/personalSourcesPayloads"
import { toPersonalSourcesSendText } from "@carlnotes/contracts/personalSourcesSendText"
import { toTopicSuggestionsText } from "@carlnotes/contracts/topicSuggestions"
import { sendToPersonalSources } from "@carlnotes/pipeline/personalSources/send"
import { loadSendMcpViewData, loadSuggestionMcpViewData, toMcpViewMeta } from "./mcpViewData"
import { CONNECT_ACCOUNT_TEXT } from "./results"
import { type RegisterToolsOptions, toTextResult } from "./toolShapes"
import { suggestTopics } from "./topicSuggestions"
import { toMcpViewToolMeta } from "./uiResources"

/**
 * Registers the additive send tool on the ordinary and Topic-bound MCP servers.
 */
export function registerPersonalSourcesTools({ mcpServer, toolCaller, routeTopicId }: RegisterToolsOptions): void {
	mcpServer.registerTool(
		"send_to_topic",
		{
			title: "Send to a Topic",
			description:
				"Save the title, summary, and links the user explicitly asks to send. A good send summarizes what the user is working on or asking about, what they concluded, open questions, and the links that mattered. Never paste the raw conversation. Include chat_url only when a real conversation URL is available from the host or user. Codex can use codex://threads/<verified-thread-id> when its real local thread ID is known. Never invent an ID or publish a conversation to obtain a URL. Supply topic_ids with one to twenty distinct Topics the user can edit (topic_id remains accepted for one), including editable public, private, invite, and Team Topics. When the user asks to send but names no Topic, first call suggest_topics and wait for their choice. Never send on your own initiative. A successful call atomically stores a sender-private entry in every selected Topic and counts once toward the daily send cap. If any destination is refused, nothing is stored or charged. Reuse request_id for a retry of exactly the same content and destinations. Its text and links inform each Topic's scoring. Findings have page-only public explanations and sender-only annotations; podcasts narrate only the public explanation. On a Topic-bound connection every supplied ID must match the bound Topic; use /mcp for another Topic. An active connected CarlNotes account is required.",
			inputSchema: personalSourcesSendPayload,
			annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
			_meta: toMcpViewToolMeta("topic"),
		},
		async (payload) => {
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			const result = toolCaller.clientId
				? await sendToPersonalSources({
						sender: { kind: "oauth", userId: toolCaller.userId, clientId: toolCaller.clientId },
						payload,
						routeTopicId,
					})
				: { status: "disconnected" as const }
			return {
				content: [{ type: "text" as const, text: toPersonalSourcesSendText(result) }],
				structuredContent: { ...result },
				_meta:
					result.status === "accepted"
						? toMcpViewMeta(await loadSendMcpViewData(toolCaller.userId, result))
						: undefined,
				isError: result.status !== "accepted",
			}
		},
	)

	// list editable destinations while the MCP view honors the connection’s write binding
	mcpServer.registerTool(
		"suggest_topics",
		{
			title: "Suggest Topics",
			description:
				"When the user asks to send, share, save, add, or forward something to Carl, CarlNotes, or their Topics without naming a Topic, call this before send_to_topic and wait for their choice. A named Topic goes straight to send_to_topic. Never call it on your own initiative. Takes the send's title, summary, and links and stores nothing. Preserve an available conversation URL in optional chat_url for the final send. That private reference is excluded from matching and public links. For Codex, preserve codex://threads/<verified-thread-id> when the actual local thread ID is available. Never invent an ID or create a shared conversation link automatically. Returns every Topic you can edit for sending, strongest matches first and recommended, with weaker editable Topics available unchecked. Lists five Topics per page using list_topics cursors; repeat the same content and optional name query with nextCursor. The MCP Apps view supports name autocomplete, filtering, checkboxes, the standard numbered paginator, live selected-topic tag pills, and one explicit send to all selected Topics. View autocomplete uses autocomplete=true for name-only reads without content matching. It shows Steeping only in the results area without changing view height; the header, search, selection, and standard action buttons stay visible. Text-only hosts receive numbered choices. Every page offers Start a new topic for this chat: only after the user picks it, use the existing suggest_sources and create_topic Topic Draft flow and limits, preview a private draft, and create only after confirmation. Both routes search editable destinations; switch to /mcp to send to another Topic from a Topic-bound connection.",
			inputSchema: suggestTopicsPayload,
			annotations: { readOnlyHint: true, destructiveHint: false },
			_meta: toMcpViewToolMeta("suggest-topics"),
		},
		async (payload) => {
			if (toolCaller.kind !== "user") {
				return toTextResult(CONNECT_ACCOUNT_TEXT)
			}
			const suggestions = await suggestTopics(toolCaller.userId, payload)
			const result = suggestions.status === "suggested" ? { ...suggestions, routeTopicId } : suggestions
			return {
				content: [{ type: "text" as const, text: toTopicSuggestionsText(result) }],
				structuredContent: result,
				_meta:
					result.status === "suggested" && !payload.autocomplete
						? toMcpViewMeta(await loadSuggestionMcpViewData(toolCaller, result))
						: undefined,
				isError: result.status === "unavailable",
			}
		},
	)
}
