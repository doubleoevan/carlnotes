// supply the browser's files and notices to the shared conversation
import type { ChatPage } from "@carlnotes/client/chatClient"
import {
	type TopicChat as SharedTopicChat,
	useTopicChat as useSharedTopicChat,
} from "@carlnotes/core/hooks/useTopicChat"
import { toast } from "sonner"
import { useChatAttachments } from "./useChatAttachments"
import { useNewTopicDraft } from "./useNewTopicDraft"

export { toAskedQuestion } from "@carlnotes/core/hooks/useTopicChat"
export type TopicChat = Omit<SharedTopicChat, "hasLoadFailed" | "reload"> &
	Pick<
		ReturnType<typeof useChatAttachments>,
		"addAttachmentFiles" | "addPastedText" | "removeAttachment" | "removeKeptAttachment"
	> &
	Pick<ReturnType<typeof useNewTopicDraft>, "topicDraftAttachmentFiles" | "removeTopicDraftAttachmentFile">

/**
 * Adds web attachments and the browser's notices to the shared private conversation.
 */
export function useTopicChat(page: ChatPage): TopicChat {
	// attach browser files, topic drafts, and the browser's notices
	const chatAttachmentState = useChatAttachments()
	const topicDraftState = useNewTopicDraft(page)
	const topicChat = useSharedTopicChat({
		page,
		attachmentState: chatAttachmentState,
		draftState: topicDraftState,
		onNotice: toast,
	})
	// add new-topic attachments to both the chat turn and topic draft
	const addAttachmentFiles = async (files: File[]): Promise<File[]> => {
		const validFiles = await chatAttachmentState.addAttachmentFiles(files)
		if (page.newTopic) {
			topicDraftState.addTopicDraftAttachmentFiles(validFiles)
		}
		return validFiles
	}
	return {
		...topicChat,
		addAttachmentFiles,
		addPastedText: chatAttachmentState.addPastedText,
		removeAttachment: chatAttachmentState.removeAttachment,
		removeKeptAttachment: chatAttachmentState.removeKeptAttachment,
		topicDraftAttachmentFiles: topicDraftState.topicDraftAttachmentFiles,
		removeTopicDraftAttachmentFile: topicDraftState.removeTopicDraftAttachmentFile,
	}
}
