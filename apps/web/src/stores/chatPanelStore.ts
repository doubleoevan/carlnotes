import type { TopicDraftTeam } from "@carlnotes/contracts/topicPayloads"
import type { ChatId, ChatPageContext } from "@carlnotes/core/lib/chatConversations"
import { setChatId, useChatConversation } from "@carlnotes/core/stores/chatConversationStore"
import { toStoreListeners } from "@carlnotes/core/stores/storeListeners"
import { isWideScreen } from "@/lib/utils"

// preserve the browser imports while both clients use the same conversation rules
export {
	type ChatId,
	type ChatPageContext,
	isPageChatRoom,
	isSameChat,
	toDefaultChatId,
} from "@carlnotes/core/lib/chatConversations"
export {
	clearMentionedChatMessage,
	clearProposedTopicEdit,
	publishTopicChanged,
	setChatId,
	setChatIdAtChatMessage,
	startEditingTopic,
	toChatId,
	useChatMessageMentioned,
	useIsEditingTopic,
	useProposedTopicEdit,
	useRegisterChatContext,
	useTopicChangeCount,
} from "@carlnotes/core/stores/chatConversationStore"

// the browser panel's size belongs to the app shell
export type ChatPanelState = "collapsed" | "open" | "enlarged"
let panelState: ChatPanelState = "collapsed"
const { publish, useStoreVersion } = toStoreListeners()

/**
 * Opens, enlarges, or closes the browser chat panel.
 */
export function setChatPanelState(nextPanelState: ChatPanelState): void {
	// publish the requested panel size and conversation visibility
	panelState = nextPanelState
	if (nextPanelState === "collapsed") {
		setChatId(null)
	}
	publish()
}

/**
 * Reads the browser panel size and shared conversation selection.
 */
export function useChatPanel(): {
	panelState: ChatPanelState
	chatId: ChatId | null
	pageContext: ChatPageContext | null
} {
	// read the latest panel and conversation state
	useStoreVersion()
	const { chatId, pageContext } = useChatConversation()
	return { panelState, chatId, pageContext }
}

/**
 * Opens new-topic chat at the browser viewport's appropriate panel size.
 */
export function openNewTopicChat(initialTeam?: TopicDraftTeam): void {
	// open the new-topic conversation at the chosen panel size
	setChatId({ kind: "private", newTopic: true, initialTeam })
	setChatPanelState(isWideScreen() ? "open" : "enlarged")
}
