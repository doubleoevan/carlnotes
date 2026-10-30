// the new-topic chat's topic draft and the browser files waiting for the topic it creates

import type { ChatPage } from "@carlnotes/client/chatClient"
import { uploadTopicAttachment } from "@carlnotes/client/topicClient"
import { type NewTopicDraft, useNewTopicDraft as useSharedNewTopicDraft } from "@carlnotes/core/hooks/useNewTopicDraft"
import { useNavigate } from "@tanstack/react-router"
import { toast } from "sonner"

/**
 * Keeps the new-topic chat's topic draft and its browser files, opening a created topic in the router.
 */
export function useNewTopicDraft(page: ChatPage): NewTopicDraft<File> {
	const navigate = useNavigate()
	return useSharedNewTopicDraft({
		page,
		openTopic: (topicId) => void navigate({ to: "/topics/$topicId", params: { topicId } }),
		uploadAttachment: uploadTopicAttachment,
		toFileDetails: (file) => ({ mimeType: file.type, byteSize: file.size }),
		notify: toast,
	})
}
