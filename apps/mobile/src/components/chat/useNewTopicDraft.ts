// the new-topic chat's topic draft and the picked files waiting for the topic it creates

import { showClientError } from "@carlnotes/client/apiClient"
import type { ChatPage } from "@carlnotes/client/chatClient"
import { type NewTopicDraft, useNewTopicDraft as useSharedNewTopicDraft } from "@carlnotes/core/hooks/useNewTopicDraft"
import { router } from "expo-router"
import { deletePickedFile } from "@/components/common/pickedFileCache"
import { uploadTopicAttachment } from "@/components/topic/TopicAttachmentEditor"
import type { PickedFile } from "@/pickedFiles"

/**
 * Keeps the new-topic chat's topic draft and its picked files, opening a created topic's screen. A file's cached copy
 * is deleted when the draft lets it go: removed, cleared, uploaded, or left behind when the chat closes.
 */
export function useNewTopicDraft(page: ChatPage): NewTopicDraft<PickedFile> {
	return useSharedNewTopicDraft<PickedFile>({
		page,
		openTopic: (topicId) => router.push({ pathname: "/topics/[topicId]", params: { topicId } }),
		uploadAttachment: uploadTopicAttachment,
		toFileDetails: (pickedFile) => ({ mimeType: pickedFile.mimeType, byteSize: pickedFile.byteSize }),
		notify: showClientError,
		deleteAttachmentFile: deletePickedFile,
	})
}
