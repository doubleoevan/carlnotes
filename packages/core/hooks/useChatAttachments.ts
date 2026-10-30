// the draft's attachments: what one question may hold, and what the topic keeps for later

import { sendDeleteKeptAttachment } from "@carlnotes/client/chatClient"
import {
	CHAT_ATTACHMENT_KEEP_LIMIT,
	CHAT_MAX_ATTACHMENTS,
	clipAttachmentText,
	type KeptChatAttachment,
} from "@carlnotes/contracts/chat"
import type { ChatAttachment } from "@carlnotes/contracts/payloads"
import { type Dispatch, type SetStateAction, useRef, useState } from "react"
import {
	type ChatAttachmentFileReader,
	KEEP_LIMIT_LINE,
	MESSAGE_FULL_LINE,
	QUESTION_FULL_LINE,
	toChatAttachment,
} from "../lib/chatAttachmentRules"

// the draft's files and the ones the topic already keeps, with the writes that change either
export type ChatAttachments<AttachmentFile> = {
	attachments: ChatAttachment[]
	// the files taken in
	addAttachmentFiles: (files: AttachmentFile[]) => Promise<AttachmentFile[]>
	addPastedText: (text: string) => void
	removeAttachment: (index: number) => void
	// what this user already keeps for the topic, which the keep limit measures against
	keptAttachments: KeptChatAttachment[]
	setKeptAttachments: Dispatch<SetStateAction<KeptChatAttachment[]>>
	removeKeptAttachment: (keptAttachmentId: string) => Promise<void>
	// the draft emptied by a question posting, which frees both counts
	clearDraft: () => void
}

// how an app reads its own files and shows a line, and whether the draft posts to a chat room, which keeps nothing
type ChatAttachmentOptions<AttachmentFile> = {
	toFileReader: (file: AttachmentFile) => ChatAttachmentFileReader
	notify: (line: string) => void
	isRoom?: boolean
}

/**
 * The attachments one question holds and the ones the topic keeps. Two limits apply: how many files a single
 * question may hold, and how many the topic keeps in total. A chat room's message keeps nothing.
 */
export function useChatAttachments<AttachmentFile>({
	toFileReader,
	notify,
	isRoom = false,
}: ChatAttachmentOptions<AttachmentFile>): ChatAttachments<AttachmentFile> {
	const [attachments, setAttachments] = useState<ChatAttachment[]>([])
	const [keptAttachments, setKeptAttachments] = useState<KeptChatAttachment[]>([])
	// the live attachment and draft-keep counts, readable mid-await where the state snapshot is out of date
	const attachmentCountRef = useRef(0)
	const draftKeepCountRef = useRef(0)

	// whether a new attachment may default to kept, with a line when the keep limit forces it off
	function shouldKeepAttachment(): boolean {
		if (isRoom) {
			return false
		}
		// past the keep limit, the file is read but not kept
		if (keptAttachments.length + draftKeepCountRef.current >= CHAT_ATTACHMENT_KEEP_LIMIT) {
			notify(KEEP_LIMIT_LINE)
			return false
		}
		draftKeepCountRef.current += 1
		return true
	}

	// whether this question already holds all it may. a line shows the limit
	function isQuestionFull(): boolean {
		if (attachmentCountRef.current >= CHAT_MAX_ATTACHMENTS) {
			notify(isRoom ? MESSAGE_FULL_LINE : QUESTION_FULL_LINE)
			return true
		}
		return false
	}

	return {
		attachments,
		keptAttachments,
		setKeptAttachments,
		// take in selected or pasted attachment files, returning the ones that were taken
		addAttachmentFiles: async (attachmentFiles) => {
			const validAttachmentFiles: AttachmentFile[] = []
			for (const attachmentFile of attachmentFiles) {
				// one chat turn's attachment limit is checked first. a big multi-select stops with a line
				if (isQuestionFull()) {
					break
				}
				// convert, then append kept by default. a rejected file already explained itself in the conversion
				const attachment = await toChatAttachment(toFileReader(attachmentFile), notify)
				if (attachment) {
					attachmentCountRef.current += 1
					const isAttachmentKept = shouldKeepAttachment()
					setAttachments((previousAttachments) => [...previousAttachments, { ...attachment, keep: isAttachmentKept }])
					validAttachmentFiles.push(attachmentFile)
				}
			}
			// return the files that made it in
			return validAttachmentFiles
		},
		// turn a long copy-paste into a text chip. the draft box holds the question instead of the material
		addPastedText: (text) => {
			if (isQuestionFull()) {
				return
			}
			attachmentCountRef.current += 1
			const isAttachmentKept = shouldKeepAttachment()
			setAttachments((previousAttachments) => [
				...previousAttachments,
				{ kind: "text", name: "Pasted text", text: clipAttachmentText(text), keep: isAttachmentKept },
			])
		},
		// drop one chip from the draft, giving its slot back when it was one of the kept ones
		removeAttachment: (index) => {
			attachmentCountRef.current -= 1
			if (attachments[index]?.keep) {
				draftKeepCountRef.current -= 1
			}
			setAttachments((previousAttachments) => previousAttachments.filter((_, position) => position !== index))
		},
		// delete one kept attachment, dropping it from the list once the server confirms so its slot frees
		removeKeptAttachment: async (keptAttachmentId) => {
			if (await sendDeleteKeptAttachment(keptAttachmentId)) {
				setKeptAttachments((previousKeptAttachments) =>
					previousKeptAttachments.filter((keptAttachment) => keptAttachment.id !== keptAttachmentId),
				)
			}
		},
		// the question posted. the draft empties and its slots come back for the next one
		clearDraft: () => {
			setAttachments([])
			attachmentCountRef.current = 0
			draftKeepCountRef.current = 0
		},
	}
}
