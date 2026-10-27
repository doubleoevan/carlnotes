import { useChatConversationLoad as useSharedChatConversationLoad } from "@carlnotes/core/hooks/useChatConversationLoad"
import { toast } from "sonner"

export type ChatConversationGates = Omit<ReturnType<typeof useSharedChatConversationLoad>, "hasLoadFailed" | "reload">

/**
 * Loads the shared conversation with browser error feedback.
 */
export function useChatConversationLoad(
	options: Parameters<typeof useSharedChatConversationLoad>[0],
): ReturnType<typeof useSharedChatConversationLoad> {
	return useSharedChatConversationLoad({ ...options, onLoadError: toast })
}
