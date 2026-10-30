// the new-topic chat's topic draft and the files waiting for the topic it creates

import type { ChatPage } from "@carlnotes/client/chatClient"
import { toTopicAttachmentRejectionLine } from "@carlnotes/contracts/attachmentTypes"
import { EMPTY_TOPIC_DRAFT, type TopicDraft } from "@carlnotes/contracts/topicPayloads"
import { type Dispatch, type SetStateAction, useEffect, useRef, useState } from "react"
import { publishTopicChanged } from "../stores/chatConversationStore"

// the new-topic chat's topic draft and the files waiting for the topic, with what creating or clearing the topic does
export type NewTopicDraft<AttachmentFile> = {
	topicDraft: TopicDraft
	setTopicDraft: Dispatch<SetStateAction<TopicDraft>>
	topicDraftAttachmentFiles: AttachmentFile[]
	addTopicDraftAttachmentFiles: (attachmentFiles: AttachmentFile[]) => void
	removeTopicDraftAttachmentFile: (index: number) => void
	// open a created topic's page and upload the topic draft's files to it
	openCreatedTopic: (topicId: string) => Promise<void>
	resetTopicDraft: () => void
}

// how an app opens a topic, uploads one of its own files, reads a file's type and size, shows a line, and lets go of a
// file the draft no longer holds
type NewTopicDraftOptions<AttachmentFile> = {
	page: ChatPage
	openTopic: (topicId: string) => void
	uploadAttachment: (topicId: string, attachmentFile: AttachmentFile) => Promise<void>
	toFileDetails: (attachmentFile: AttachmentFile) => { mimeType: string; byteSize: number }
	notify: (line: string) => void
	deleteAttachmentFile?: (attachmentFile: AttachmentFile) => void
}

/**
 * Keeps the new-topic chat's topic draft and its files, starting from the team that a team page gave this chat. A
 * file leaves the draft when it is removed, when the draft is cleared, after its upload, and when the chat closes.
 */
export function useNewTopicDraft<AttachmentFile extends { name: string }>({
	page,
	openTopic,
	uploadAttachment,
	toFileDetails,
	notify,
	deleteAttachmentFile,
}: NewTopicDraftOptions<AttachmentFile>): NewTopicDraft<AttachmentFile> {
	const [topicDraft, setTopicDraft] = useState<TopicDraft>(EMPTY_TOPIC_DRAFT)
	const [topicDraftAttachmentFiles, setTopicDraftAttachmentFiles] = useState<AttachmentFile[]>([])

	// put the team that a team page gave this chat on the topic draft,
	// and on the empty topic draft that a clear or a create leaves
	const initialTeam = page.newTopic ? page.initialTeam : undefined
	const emptyTopicDraft: TopicDraft = { ...EMPTY_TOPIC_DRAFT, team: initialTeam ?? null }
	useEffect(() => {
		if (initialTeam) {
			setTopicDraft((previousTopicDraft) => ({ ...previousTopicDraft, team: initialTeam }))
		}
	}, [initialTeam])

	// release the draft's remaining files when the chat closes
	const topicDraftAttachmentFilesRef = useRef(topicDraftAttachmentFiles)
	topicDraftAttachmentFilesRef.current = topicDraftAttachmentFiles
	// through the release the app supplies at the time
	const deleteAttachmentFileRef = useRef(deleteAttachmentFile)
	deleteAttachmentFileRef.current = deleteAttachmentFile
	useEffect(
		() => () => {
			for (const attachmentFile of topicDraftAttachmentFilesRef.current) {
				deleteAttachmentFileRef.current?.(attachmentFile)
			}
		},
		[],
	)

	// empty the topic draft and take its files out without letting them go
	const takeTopicDraft = (): AttachmentFile[] => {
		const takenFiles = topicDraftAttachmentFilesRef.current
		topicDraftAttachmentFilesRef.current = []
		setTopicDraft(emptyTopicDraft)
		setTopicDraftAttachmentFiles([])
		return takenFiles
	}

	// open the new topic's page while this chat stays put, upload the topic draft's files to it, then reload its page
	const openCreatedTopic = async (topicId: string): Promise<void> => {
		openTopic(topicId)
		const filesToUpload = takeTopicDraft()
		// upload each file through the topic page's own screening, with a line for a rejection's reason
		for (const attachmentFile of filesToUpload) {
			await uploadAttachment(topicId, attachmentFile).catch((error: Error) =>
				notify(`${attachmentFile.name} didn't attach. ${error.message}`),
			)
			deleteAttachmentFile?.(attachmentFile)
		}
		if (filesToUpload.length > 0) {
			publishTopicChanged(topicId)
		}
	}
	// keep the files a topic takes, and let go of the rest with the line that says why
	const addTopicDraftAttachmentFiles = (attachmentFiles: AttachmentFile[]): void => {
		const topicFiles = attachmentFiles.filter((attachmentFile) => {
			const rejectionLine = toTopicAttachmentRejectionLine({
				name: attachmentFile.name,
				...toFileDetails(attachmentFile),
			})
			if (rejectionLine) {
				notify(rejectionLine)
				deleteAttachmentFile?.(attachmentFile)
			}
			return !rejectionLine
		})
		setTopicDraftAttachmentFiles((previousFiles) => [...previousFiles, ...topicFiles])
	}
	return {
		topicDraft,
		setTopicDraft,
		topicDraftAttachmentFiles,
		addTopicDraftAttachmentFiles,
		removeTopicDraftAttachmentFile: (index) => {
			const removedFile = topicDraftAttachmentFiles[index]
			if (removedFile) {
				deleteAttachmentFile?.(removedFile)
			}
			setTopicDraftAttachmentFiles((previousFiles) => previousFiles.filter((_, position) => position !== index))
		},
		openCreatedTopic,
		resetTopicDraft: () => {
			for (const attachmentFile of takeTopicDraft()) {
				deleteAttachmentFile?.(attachmentFile)
			}
		},
	}
}
