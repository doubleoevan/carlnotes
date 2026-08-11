// the chat panel's conversation state, owned by one hook so the panel components stay pure view
import {
	CHAT_ATTACHMENT_KEEP_LIMIT,
	CHAT_IMAGE_DATA_CHARS,
	CHAT_MAX_ATTACHMENTS,
	type ChatAttachment,
	clipAttachmentText,
	type KeptChatAttachment,
	withAttachmentNote,
} from "@shared/contracts"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import type { ChatTurn } from "@/components/chat/ChatMessages"
import { fetchChatConversation, sendChatTurn, sendClearChat, sendDeleteKeptAttachment } from "@/lib/chatClient"

// the file suffixes read as text attachments when the browser reports no text/* media type
const TEXT_FILE_SUFFIXES = [".txt", ".md", ".markdown", ".csv", ".tsv", ".json", ".log"]

// a stand-in id for a kept attachment that the server has not returned yet, replaced by the row's real id on the
// next conversation load. a counter, since browsers withhold crypto.randomUUID outside a secure context
let placeholderCount = 0
function toPlaceholderId(): string {
	placeholderCount += 1
	return `pending-${placeholderCount}`
}

// everything the panel needs: the conversation, the draft with its attachments, the gates, and the actions
export type TopicChat = {
	chatTurns: ChatTurn[]
	question: string
	setQuestion: (value: string) => void
	// the draft's attachments: files picked or dropped in, images pasted, and long copy pastes folded into chips
	attachments: ChatAttachment[]
	addFiles: (files: File[]) => Promise<void>
	addPastedText: (text: string) => void
	removeAttachment: (index: number) => void
	// what this user already keeps for the topic, and the delete attachment handler that frees a slot
	keptAttachments: KeptChatAttachment[]
	removeKeptAttachment: (keptAttachmentId: string) => Promise<void>
	canChat: boolean
	// a signed-out visitor may type but their send click routes to signup, so the panel shows for them too
	isSignupRequired: boolean
	// an exhausted monthly budget keeps the panel open showing the upgrade link instead of the composer
	isBudgetExhausted: boolean
	// true once the conversation load settles, so the panel can pick its opening state from what came back
	isLoaded: boolean
	isStreaming: boolean
	// send streams the draft's reply, stop cuts it keeping whatever arrived, and clear deletes the conversation and its attachments
	send: () => Promise<void>
	stop: () => void
	clear: () => Promise<void>
}

/**
 * One topic's conversation: loading it, sending a chat turn, streaming the reply, stopping, and clearing.
 */
export function useTopicChat(topicId: string): TopicChat {
	const [chatTurns, setChatTurns] = useState<ChatTurn[]>([])
	const [question, setQuestion] = useState("")
	const [attachments, setAttachments] = useState<ChatAttachment[]>([])
	// what this user already keeps for the topic. it is both the manage list and what the keep limit measures
	const [keptAttachments, setKeptAttachments] = useState<KeptChatAttachment[]>([])

	// the gates the conversation load resolves, and the streaming flag an in-flight chat turn holds
	const [canChat, setCanChat] = useState(false)
	const [isSignupRequired, setIsSignupRequired] = useState(false)
	const [isBudgetExhausted, setIsBudgetExhausted] = useState(false)
	const [isLoaded, setIsLoaded] = useState(false)
	const [isStreaming, setIsStreaming] = useState(false)
	const abortRef = useRef<AbortController | null>(null)
	// the live attachment and draft-keep counts, readable mid-await where the state snapshot goes stale.
	// a multi-file add awaits between files, so reading keeps off state would let a whole batch pass the cap
	const attachmentCountRef = useRef(0)
	const draftKeepCountRef = useRef(0)

	// load the stored conversation. every signed-in user's chat turns persist server-side
	useEffect(() => {
		// moving to another topic must not let the previous topic's conversation land in this one
		let isCurrentTopic = true
		fetchChatConversation(topicId)
			.then((conversation) => {
				if (!isCurrentTopic) {
					return
				}
				setChatTurns(
					conversation.chatTurns.map((chatTurn) => ({
						question: chatTurn.question,
						answer: chatTurn.answer,
						rejection: null,
						at: chatTurn.at ? Date.parse(chatTurn.at) : undefined,
					})),
				)
				// the gates and the kept attachments settle together, so the panel opens in one finished state
				setCanChat(conversation.canChat)
				setIsSignupRequired(conversation.isSignupRequired)
				setIsBudgetExhausted(conversation.isBudgetExhausted)
				setKeptAttachments(conversation.keptAttachments ?? [])
				setIsLoaded(true)
			})
			.catch((error) => {
				// a failed load still settles, or the panel waits forever on a load that already failed.
				// the failure reason goes to the browser console
				if (!isCurrentTopic) {
					return
				}
				console.error("chat conversation load failed", error)
				toast("Carl could not open this conversation. Refresh to try again.")
				setIsLoaded(true)
			})

		// leaving this topic retires any request in flight for it
		return () => {
			isCurrentTopic = false
		}
	}, [topicId])

	// whether a new attachment may default to kept, with a toast when the full memory forces it off.
	// a kept attachment that is granted is counted here, so the next file in the same batch sees it
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

	// take in picked or pasted attachment files. images and PDFs become data urls, text files save as clipped text,
	// and each rejection explains itself so a rejected file never just vanishes
	async function addAttachmentFiles(files: File[]): Promise<void> {
		for (const file of files) {
			// one chat turn's attachment cap is checked first, so a big multi-select fails loudly at the boundary
			if (attachmentCountRef.current >= CHAT_MAX_ATTACHMENTS) {
				toast(`${CHAT_MAX_ATTACHMENTS} attachments max per question.`)
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
	}

	// fold a long copy-paste into a text chip, so the draft box holds the question instead of the material
	function addPastedText(text: string): void {
		if (attachmentCountRef.current >= CHAT_MAX_ATTACHMENTS) {
			toast(`${CHAT_MAX_ATTACHMENTS} attachments max per question.`)
			return
		}
		attachmentCountRef.current += 1
		const keepAttachment = shouldKeepAttachment()
		setAttachments((previousAttachments) => [
			...previousAttachments,
			{ kind: "text", name: "Pasted text", text: clipAttachmentText(text), keep: keepAttachment },
		])
	}

	// drop one chip from the draft, giving its slot back when it was one of the kept ones
	function removeAttachment(index: number): void {
		attachmentCountRef.current -= 1
		if (attachments[index]?.keep) {
			draftKeepCountRef.current -= 1
		}
		setAttachments((previousAttachments) => previousAttachments.filter((_, position) => position !== index))
	}

	// send the user question, appending the reply to the newest chat turn as each chunk lands
	async function send(): Promise<void> {
		const askedQuestion = question.trim()
		if (!askedQuestion || isStreaming) {
			return
		}

		// the conversation so far that gets posted, minus rejected chat turns
		const historyChatTurns = chatTurns
			.filter((chatTurn) => chatTurn.rejection === null && chatTurn.answer !== "")
			.map((chatTurn) => ({ question: chatTurn.question, answer: chatTurn.answer }))

		// the attachments get posted with this chat turn, and the kept attachments join the manage list right away.
		// the server persists the attachments as the reply lands. their ids are placeholders until the next load includes the real attachment rows
		const sentAttachments = attachments
		setQuestion("")
		setAttachments([])
		attachmentCountRef.current = 0
		draftKeepCountRef.current = 0
		setKeptAttachments((previousAttachments) => [
			...previousAttachments,
			...sentAttachments
				.filter((attachment) => attachment.keep)
				.map((attachment) => ({ id: toPlaceholderId(), name: attachment.name, kind: attachment.kind })),
		])
		setChatTurns((previousChatTurns) => [
			...previousChatTurns,
			{ question: withAttachmentNote(askedQuestion, sentAttachments), answer: "", rejection: null },
		])
		setIsStreaming(true)

		// stream under a fresh abort controller, so the stop button can cut this chat turn and only this chat turn
		const controller = new AbortController()
		abortRef.current = controller
		const chatSendResult = await sendChatTurn(
			topicId,
			askedQuestion,
			historyChatTurns,
			sentAttachments,
			(chunk) => {
				setChatTurns((previous) =>
					replaceNewestChatTurn(previous, (chatTurn) => ({ ...chatTurn, answer: chatTurn.answer + chunk })),
				)
			},
			controller.signal,
		)
		abortRef.current = null

		// a stop before any text drops the whole entire chat turn, so the empty bubble never lingers.
		// everything else settles the chat turn with its outcome and its time
		setChatTurns((previousChatTurns) => {
			if (chatSendResult === "stopped" && previousChatTurns.at(-1)?.answer === "") {
				return previousChatTurns.slice(0, -1)
			}
			return replaceNewestChatTurn(previousChatTurns, (chatTurn) => ({
				...chatTurn,
				rejection: chatSendResult === "stopped" ? null : chatSendResult,
				at: Date.now(),
			}))
		})
		setIsStreaming(false)
	}

	// cut the in-flight chat turn. the text already on screen stays there
	function stop(): void {
		abortRef.current?.abort()
	}

	// wipe the conversation and chat attachments server-side, then locally once the server confirms
	async function clear(): Promise<void> {
		if (await sendClearChat(topicId)) {
			setChatTurns([])
			setKeptAttachments([])
		}
	}

	// delete one kept attachment, dropping it from the list once the server confirms so its slot frees
	async function removeKeptAttachment(keptAttachmentId: string): Promise<void> {
		if (await sendDeleteKeptAttachment(keptAttachmentId)) {
			setKeptAttachments((previous) => previous.filter((keptAttachment) => keptAttachment.id !== keptAttachmentId))
		}
	}

	return {
		chatTurns,
		question,
		setQuestion,
		attachments,
		addFiles: addAttachmentFiles,
		addPastedText,
		removeAttachment,
		keptAttachments,
		removeKeptAttachment,
		canChat,
		isSignupRequired,
		isBudgetExhausted,
		isLoaded,
		isStreaming,
		send,
		stop,
		clear,
	}
}

// a picked or pasted file as a chat attachment: an image or a PDF reads to a data url and a text file to clipped text.
// anything else is rejected with an explanation, and null means the file became nothing
async function toAttachment(file: File): Promise<ChatAttachment | null> {
	// images and PDFs post as data urls. the PDF's text is extracted server-side, so only its words ever reach the model
	const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
	if (file.type.startsWith("image/") || isPdf) {
		return toDataUrlAttachment(file, isPdf)
	}
	// text files post as raw text, clipped to the cap with the cut point marked for the model
	if (file.type.startsWith("text/") || TEXT_FILE_SUFFIXES.some((suffix) => file.name.toLowerCase().endsWith(suffix))) {
		const text = await file.text()
		return { kind: "text", name: file.name || "text", text: clipAttachmentText(text), keep: false }
	}
	// every other kind of attachment is rejected with a toast
	toast("Carl reads images, PDFs, and text files for now.")
	return null
}

// an image or PDF as a data url, rejected by name when it runs past the shared size limit —
// both kinds share the image cap, since both post base64 inside the chat turn's JSON
async function toDataUrlAttachment(file: File, isPdf: boolean): Promise<ChatAttachment | null> {
	const dataUrl = await toDataUrl(file)
	if (dataUrl.length > CHAT_IMAGE_DATA_CHARS) {
		toast(`That ${isPdf ? "PDF" : "image"} is too large. About 4 MB is the limit.`)
		return null
	}
	return {
		kind: isPdf ? "pdf" : "image",
		name: file.name || (isPdf ? "document.pdf" : "image"),
		dataUrl,
		keep: false,
	}
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

// replace the newest chat turn, which is the one a streaming reply is filling in
function replaceNewestChatTurn(chatTurns: ChatTurn[], replace: (chatTurn: ChatTurn) => ChatTurn): ChatTurn[] {
	return chatTurns.map((chatTurn, index) => (index === chatTurns.length - 1 ? replace(chatTurn) : chatTurn))
}
