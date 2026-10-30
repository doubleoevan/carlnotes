import type { TopicToolCalls, TopicToolToasts } from "@carlnotes/contracts/chatTurns"
import {
	applyTopicEditToolCalls as applySharedTopicEditToolCalls,
	showTopicToolCalls,
} from "@carlnotes/core/lib/topicToolCalls"
import { toast } from "sonner"
import { clearProposedTopicEdit, startEditingTopic } from "@/stores/chatPanelStore"

// share stored proposal parsing with native chat
export { toProposedTopicEdit } from "@carlnotes/core/lib/topicToolCalls"

/**
 * Presents topic tool outcomes through the browser's toast host.
 */
export function toastTopicToolCalls(topicToolToasts: TopicToolToasts): void {
	showTopicToolCalls({ topicToolToasts, onSaved: toast, onRejected: toast.error })
}

/**
 * Applies shared topic edit transitions to the browser's selected conversation.
 */
export function applyTopicEditToolCalls(
	topicId: string,
	toolCalls: Pick<TopicToolCalls, "proposedTopicEdit" | "isTopicEditCancelled" | "topicSaves">,
): void {
	applySharedTopicEditToolCalls({
		topicId,
		toolCalls,
		onStartEditingTopic: startEditingTopic,
		onClearProposedTopicEdit: clearProposedTopicEdit,
	})
}
