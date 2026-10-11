// the new-topic chat's topic draft and the files waiting for the topic it creates
import { EMPTY_TOPIC_DRAFT, type TopicDraft } from "@shared/topicPayloads"
import { useNavigate } from "@tanstack/react-router"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import type { ChatPage } from "@/clients/chatClient"
import { uploadTopicAttachment } from "@/clients/topicClient"
import { publishTopicChanged } from "@/stores/chatPanelStore"

// the new-topic chat's topic draft and the files waiting for the topic, with what creating or clearing the topic does
export type NewTopicDraft = {
	topicDraft: TopicDraft
	setTopicDraft: React.Dispatch<React.SetStateAction<TopicDraft>>
	topicDraftAttachmentFiles: File[]
	addTopicDraftAttachmentFiles: (attachmentFiles: File[]) => void
	removeTopicDraftAttachmentFile: (index: number) => void
	// open a created topic's page and upload the topic draft's files to it
	openCreatedTopic: (topicId: string) => Promise<void>
	resetTopicDraft: () => void
}

/** Keeps the new-topic chat's topic draft and its files, starting from the team that a team page handed this chat. */
export function useNewTopicDraft(page: ChatPage): NewTopicDraft {
	const [topicDraft, setTopicDraft] = useState<TopicDraft>(EMPTY_TOPIC_DRAFT)
	const [topicDraftAttachmentFiles, setTopicDraftAttachmentFiles] = useState<File[]>([])
	const navigate = useNavigate()

	// put the team that a team page handed this chat on the topic draft,
	// and on the empty topic draft that a clear or a create leaves
	const initialTeam = page.newTopic ? page.initialTeam : undefined
	const emptyTopicDraft: TopicDraft = { ...EMPTY_TOPIC_DRAFT, team: initialTeam ?? null }
	useEffect(() => {
		if (initialTeam) {
			setTopicDraft((previousTopicDraft) => ({ ...previousTopicDraft, team: initialTeam }))
		}
	}, [initialTeam])

	// empty the topic draft and its files
	const resetTopicDraft = (): void => {
		setTopicDraft(emptyTopicDraft)
		setTopicDraftAttachmentFiles([])
	}

	// open the new topic's page while this chat stays put, upload the topic draft's files to it, then reload its page
	const openCreatedTopic = async (topicId: string): Promise<void> => {
		void navigate({ to: "/topics/$topicId", params: { topicId } })
		const filesToUpload = topicDraftAttachmentFiles
		resetTopicDraft()
		// upload each file through the topic page's own screening, toasting a rejection's reason
		for (const attachmentFile of filesToUpload) {
			await uploadTopicAttachment(topicId, attachmentFile).catch((error: Error) =>
				toast(`${attachmentFile.name} didn't attach. ${error.message}`),
			)
		}
		if (filesToUpload.length > 0) {
			publishTopicChanged(topicId)
		}
	}
	return {
		topicDraft,
		setTopicDraft,
		topicDraftAttachmentFiles,
		addTopicDraftAttachmentFiles: (attachmentFiles) =>
			setTopicDraftAttachmentFiles((previousFiles) => [...previousFiles, ...attachmentFiles]),
		removeTopicDraftAttachmentFile: (index) =>
			setTopicDraftAttachmentFiles((previousFiles) => previousFiles.filter((_, position) => position !== index)),
		openCreatedTopic,
		resetTopicDraft,
	}
}
