import type { TopicToolCalls, TopicToolToasts } from "@shared/contracts"
import {
	type ChatToolCall,
	type ProposeTopicEditPayload,
	proposeTopicEditPayload,
	toStandingTopicEditCall,
} from "@shared/contracts"
import { toast } from "sonner"
import { clearProposedTopicEdit, startEditingTopic } from "@/stores/chatPanelStore"

/**
 * Toasts what carl's topic tools saved and what they would not. Shared by the private chat and a topic's team room.
 */
export function toastTopicToolCalls(topicToolToasts: TopicToolToasts): void {
	for (const topicSave of topicToolToasts.topicSaves) {
		toast(topicSave)
	}
	for (const topicSaveRejection of topicToolToasts.topicSaveRejections) {
		toast.error(topicSaveRejection)
	}
}

/**
 * Keeps the topic's card up to date with what carl did, previewing the change he proposed,
 * taking it back off when the user turns it down, and settling it back to the topic itself once a tool saves.
 */
export function applyTopicEditToolCalls(
	topicId: string,
	toolCalls: Pick<TopicToolCalls, "proposedTopicEdit" | "isTopicEditCancelled" | "topicSaves">,
): void {
	if (toolCalls.proposedTopicEdit) {
		startEditingTopic(topicId, toolCalls.proposedTopicEdit)
		return
	}
	// clear the preview when the user turns the change down, leaving the edit under way
	if (toolCalls.isTopicEditCancelled) {
		clearProposedTopicEdit()
		return
	}
	// a save applies whatever was proposed, so the card drops it and reads the topic as it now stands.
	// leaving it would list every added source twice, once from the re-read topic and once from the proposal over it
	if (toolCalls.topicSaves.length > 0) {
		clearProposedTopicEdit()
		startEditingTopic(topicId)
	}
}

/**
 * The proposal a conversation is still sitting on, read back from the tools its chat turns called.
 * Null when carl cancelled it, when a tool saved after it, and when none was ever proposed.
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
