import type { TopicToolCalls, TopicToolToasts } from "@carlnotes/contracts/chat"
import { toStandingTopicEditCall } from "@carlnotes/contracts/chat"
import type { ChatToolCall } from "@carlnotes/contracts/payloads"
import { type ProposeTopicEditPayload, proposeTopicEditPayload } from "@carlnotes/contracts/topicPayloads"

/**
 * Reports accepted and rejected Topic saves.
 */
export function showTopicToolCalls({
	topicToolToasts,
	onSaved,
	onRejected,
}: {
	topicToolToasts: TopicToolToasts
	onSaved: (message: string) => void
	onRejected: (message: string) => void
}): void {
	for (const topicSave of topicToolToasts.topicSaves) {
		onSaved(topicSave)
	}
	for (const topicSaveRejection of topicToolToasts.topicSaveRejections) {
		onRejected(topicSaveRejection)
	}
}

/**
 * Applies proposed, cancelled, and saved Topic edits to the current draft.
 */
export function applyTopicEditToolCalls({
	topicId,
	toolCalls,
	onStartEditingTopic,
	onClearProposedTopicEdit,
}: {
	topicId: string
	toolCalls: Pick<TopicToolCalls, "proposedTopicEdit" | "isTopicEditCancelled" | "topicSaves">
	onStartEditingTopic: (topicId: string, proposal?: ProposeTopicEditPayload) => void
	onClearProposedTopicEdit: () => void
}): void {
	if (toolCalls.proposedTopicEdit) {
		onStartEditingTopic(topicId, toolCalls.proposedTopicEdit)
		return
	}
	// clear the preview when the user turns the change down, leaving the edit under way
	if (toolCalls.isTopicEditCancelled) {
		onClearProposedTopicEdit()
		return
	}
	// a save applies whatever was proposed, so the card drops it and reads the topic as it now stands.
	// leaving it would list every added source twice, once from the re-read topic and once from the proposal over it
	if (toolCalls.topicSaves.length > 0) {
		onClearProposedTopicEdit()
		onStartEditingTopic(topicId)
	}
}

/**
 * Returns the most recent pending Topic edit proposal.
 */
export function toProposedTopicEdit(chatTurns: { toolCalls?: ChatToolCall[] }[]): ProposeTopicEditPayload | null {
	const standingTopicEditCall = toStandingTopicEditCall(chatTurns.flatMap((chatTurn) => chatTurn.toolCalls ?? []))
	if (!standingTopicEditCall) {
		return null
	}
	// parse the stored proposal, reading an older shape as none
	const proposedTopicEditResult = proposeTopicEditPayload.safeParse(standingTopicEditCall.input)
	return proposedTopicEditResult.success ? proposedTopicEditResult.data : null
}
