// supply the browser's files, speech, and navigation to the shared conversation
import type { ChatPage } from "@carlnotes/client/chatClient"
import {
	type TopicChat as SharedTopicChat,
	useTopicChat as useSharedTopicChat,
} from "@carlnotes/core/hooks/useTopicChat"
import { toast } from "sonner"
import { setChatId } from "@/stores/chatPanelStore"
import { subscribeToPodcastEpisodeQuestionChatTurn } from "@/stores/podcastEpisodeQuestionStore"
import { stopSpokenAnswerKey } from "@/stores/spokenAnswerStore"
import { toStreamedSpokenAnswer } from "@/stores/streamedSpokenAnswer"
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
 * Adds web attachments and spoken answers to the shared private conversation.
 */
export function useTopicChat(page: ChatPage): TopicChat {
	// attach browser files, topic drafts, and speech effects
	const chatAttachmentState = useChatAttachments()
	const topicDraftState = useNewTopicDraft(page)
	const topicChat = useSharedTopicChat({
		page,
		attachmentState: chatAttachmentState,
		draftState: topicDraftState,
		effects: {
			onNotice: toast,
			openNewTopicChat: () => setChatId({ kind: "private", newTopic: true }),
			subscribeToPodcastTurn: subscribeToPodcastEpisodeQuestionChatTurn,
			stopSpokenAnswer: stopSpokenAnswerKey,
			createSpokenAnswer: ({ spokenAnswerKey, voiceChatPage, isSpoken, spokenQuestionTimings }) =>
				isSpoken && voiceChatPage && spokenQuestionTimings
					? toStreamedSpokenAnswer({ spokenAnswerKey, page: voiceChatPage, spokenQuestionTimings })
					: null,
		},
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
