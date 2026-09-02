// the draft's attachments: what one question may hold, and what the topic keeps for later
import {
	CHAT_ATTACHMENT_KEEP_LIMIT,
	CHAT_IMAGE_DATA_CHARS,
	CHAT_MAX_ATTACHMENTS,
	CHAT_VIDEO_DATA_CHARS,
	type ChatAttachment,
	clipAttachmentText,
	type KeptChatAttachment,
} from "@shared/contracts"
import { type Dispatch, type SetStateAction, useRef, useState } from "react"
import { toast } from "sonner"
import { sendDeleteKeptAttachment } from "@/clients/chatClient"

// the file extensions read as plain text when the browser gives no text/* type of its own
const TEXT_FILE_SUFFIXES = [".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".log"]

// the draft's files and the ones the topic already keeps, with the writes that change either
export type ChatAttachments = {
	attachments: ChatAttachment[]
	addFiles: (files: File[]) => Promise<void>
	addPastedText: (text: string) => void
	removeAttachment: (index: number) => void
	// what this user already keeps for the topic, which the keep limit measures against
	keptAttachments: KeptChatAttachment[]
	setKeptAttachments: Dispatch<SetStateAction<KeptChatAttachment[]>>
	removeKeptAttachment: (keptAttachmentId: string) => Promise<void>
	// the draft emptied by a question posting, which frees both counts
	clearDraft: () => void
}

/**
 * The attachments one question holds and the ones the topic keeps. Two limits apply: how many files a single
 * question may hold, and how many the topic keeps in total.
 */
export function useChatAttachments(): ChatAttachments {
	const [attachments, setAttachments] = useState<ChatAttachment[]>([])
	const [keptAttachments, setKeptAttachments] = useState<KeptChatAttachment[]>([])
	// the live attachment and draft-keep counts, readable mid-await where the state snapshot is out of date
	const attachmentCountRef = useRef(0)
	const draftKeepCountRef = useRef(0)

	// whether a new attachment may default to kept, with a toast when the keep limit forces it off
	function shouldKeepAttachment(): boolean {
		if (keptAttachments.length + draftKeepCountRef.current >= CHAT_ATTACHMENT_KEEP_LIMIT) {
			toast(
				`Carl's already keeping ${CHAT_ATTACHMENT_KEEP_LIMIT} files for this topic. He'll read this one, but it won't get stored.`,
			)
			return false
		}
		draftKeepCountRef.current += 1
		return true
	}

	// whether this question already holds all it may. a toast shows the limit
	function isQuestionFull(): boolean {
		if (attachmentCountRef.current >= CHAT_MAX_ATTACHMENTS) {
			toast(`${CHAT_MAX_ATTACHMENTS} attachments max per question.`)
			return true
		}
		return false
	}

	return {
		attachments,
		keptAttachments,
		setKeptAttachments,
		// take in selected or pasted attachment files
		addFiles: async (files) => {
			for (const file of files) {
				// one chat turn's attachment limit is checked first. a big multi-select stops with a toast
				if (isQuestionFull()) {
					return
				}
				// convert, then append kept by default. a rejected file already explained itself in the conversion
				const attachment = await toAttachment(file)
				if (attachment) {
					attachmentCountRef.current += 1
					const keepAttachment = shouldKeepAttachment()
					setAttachments((previous) => [...previous, { ...attachment, keep: keepAttachment }])
				}
			}
		},
		// turn a long copy-paste into a text chip. the draft box holds the question instead of the material
		addPastedText: (text) => {
			if (isQuestionFull()) {
				return
			}
			attachmentCountRef.current += 1
			const keepAttachment = shouldKeepAttachment()
			setAttachments((previousAttachments) => [
				...previousAttachments,
				{ kind: "text", name: "Pasted text", text: clipAttachmentText(text), keep: keepAttachment },
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
				setKeptAttachments((previous) => previous.filter((keptAttachment) => keptAttachment.id !== keptAttachmentId))
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

// the video types both composers take, the ones the shared player can also stream back
const VIDEO_FILE_TYPES = ["video/mp4", "video/quicktime", "video/webm"]

// a selected or pasted file as a chat attachment
export async function toAttachment(file: File): Promise<ChatAttachment | null> {
	// images and PDFs post as data urls. the PDF's text is extracted server-side. only its words reach the model
	const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
	if (file.type.startsWith("image/") || isPdf) {
		return toDataUrlAttachment(file, isPdf ? "pdf" : "image")
	}

	// a video posts as a data url too. carl can't watch it, so only a line naming it reaches him
	if (VIDEO_FILE_TYPES.includes(file.type)) {
		return toDataUrlAttachment(file, "video")
	}

	// text files post as raw text, clipped to the limit with the cut point marked for the model
	if (file.type.startsWith("text/") || TEXT_FILE_SUFFIXES.some((suffix) => file.name.toLowerCase().endsWith(suffix))) {
		const text = await file.text()
		return { kind: "text", name: file.name || "text", text: clipAttachmentText(text), keep: false }
	}
	// every other kind of attachment is rejected with a toast
	toast("Carl takes images, PDFs, text files, and videos for now.")
	return null
}

// each data url kind's size limit and the toast that names it
const DATA_URL_KIND_LIMITS = {
	image: { maxChars: CHAT_IMAGE_DATA_CHARS, tooLargeToast: "That image is too large. About 4 MB is the limit." },
	pdf: { maxChars: CHAT_IMAGE_DATA_CHARS, tooLargeToast: "That PDF is too large. About 4 MB is the limit." },
	video: { maxChars: CHAT_VIDEO_DATA_CHARS, tooLargeToast: "That video is too large. About 18 MB is the limit." },
} as const

// the fallback names for files the browser hands over unnamed
const UNNAMED_FILE_NAMES = { image: "image", pdf: "document.pdf", video: "video" } as const

// an image, PDF, or video as a data url, rejected by name when it runs past its kind's size limit
async function toDataUrlAttachment(file: File, kind: "image" | "pdf" | "video"): Promise<ChatAttachment | null> {
	const dataUrl = await toDataUrl(file)

	// a file past its kind's limit rejects before any of it uploads
	const { maxChars, tooLargeToast } = DATA_URL_KIND_LIMITS[kind]
	if (dataUrl.length > maxChars) {
		toast(tooLargeToast)
		return null
	}
	return { kind, name: file.name || UNNAMED_FILE_NAMES[kind], dataUrl, keep: false }
}

// a file's bytes as a data url, through the browser's own reader
function toDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const fileReader = new FileReader()
		fileReader.onload = () => resolve(String(fileReader.result))
		fileReader.onerror = () => reject(fileReader.error)
		fileReader.readAsDataURL(file)
	})
}
