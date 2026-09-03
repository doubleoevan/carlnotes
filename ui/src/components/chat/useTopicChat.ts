// the chat panel's conversation state, owned by one hook so the panel components stay pure view
import { type ChatAttachment, type KeptChatAttachment, withAttachmentNote } from "@shared/contracts"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { type ChatPage, fetchChatConversation, sendChatTurn, sendClearChat } from "@/clients/chatClient"
import type { ChatTurn } from "@/components/chat/ChatMessages"
import { useChatAttachments } from "@/components/chat/useChatAttachments"
import { hasPreviewableLink } from "@/components/common/LinkPreviewCard"

// how long a finished chat turn waits before it looks for its link preview cards again
const LINK_PREVIEW_REFRESH_MS = 2500

// a stand-in id for a kept attachment that the server has not returned yet
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
	// the draft's attachments: files selected or dropped in, images pasted, and long copy pastes turned into chips
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
	// true once the conversation load finishes, so the panel can select its opening state from what came back
	isLoaded: boolean
	isStreaming: boolean
	// send streams the draft's reply, stop cuts it keeping whatever arrived
	send: (retryQuestion?: string) => Promise<void>
	stop: () => void
	clear: () => Promise<boolean>
}

/**
 * One topic's chat conversation: loading it, sending a chat turn, streaming the reply, stopping, and clearing.
 */
export function useTopicChat(page: ChatPage): TopicChat {
	const [chatTurns, setChatTurns] = useState<ChatTurn[]>([])
	const [question, setQuestion] = useState("")

	// the gates the conversation load resolves, and the streaming flag an in-flight chat turn holds
	const [canChat, setCanChat] = useState(false)
	const [isSignupRequired, setIsSignupRequired] = useState(false)
	const [isBudgetExhausted, setIsBudgetExhausted] = useState(false)
	const [isLoaded, setIsLoaded] = useState(false)
	const [isStreaming, setIsStreaming] = useState(false)
	const abortRef = useRef<AbortController | null>(null)
	// the draft's files and the topic's kept ones, held together with the two limits that bound them
	const {
		attachments,
		addFiles,
		addPastedText,
		removeAttachment,
		keptAttachments,
		setKeptAttachments,
		removeKeptAttachment,
		clearDraft,
	} = useChatAttachments()

	// load the stored conversation. every signed-in user's chat turns persist server-side.
	// the page object is rebuilt each render, so its two ids stand in for it
	// biome-ignore lint/correctness/useExhaustiveDependencies: the page's ids identify the conversation
	useEffect(() => {
		// moving to another topic must not let the previous topic's conversation load into this one
		let isCurrentTopic = true
		fetchChatConversation(page)
			.then((chatConversation) => {
				if (!isCurrentTopic) {
					return
				}
				setChatTurns(
					chatConversation.chatTurns.map((chatTurn) => ({
						question: chatTurn.question,
						answer: chatTurn.answer,
						rejection: null,
						at: chatTurn.at ? Date.parse(chatTurn.at) : undefined,
						attachments: chatTurn.attachments,
						linkPreviews: chatTurn.linkPreviews,
						answerLinkPreviews: chatTurn.answerLinkPreviews,
					})),
				)
				// the gates and the kept attachments update together, so the panel opens in one finished state
				setCanChat(chatConversation.canChat)
				setIsSignupRequired(chatConversation.isSignupRequired)
				setIsBudgetExhausted(chatConversation.isBudgetExhausted)
				setKeptAttachments(chatConversation.keptAttachments ?? [])
				setIsLoaded(true)
			})
			.catch((error) => {
				// a failed load still finishes, so the panel never waits on a load that already failed
				if (!isCurrentTopic) {
					return
				}
				console.error("chat conversation load failed", error)
				toast("Carl could not open this conversation. Refresh to try again.")
				setIsLoaded(true)
			})

		// leaving this topic discards any request in flight for it
		return () => {
			isCurrentTopic = false
		}
	}, [page.topicId, page.teamId, setKeptAttachments])

	// the newest chat turn's link preview cards poll in the background until they complete
	const startLinkPreviewRefresh = useLinkPreviewRefresh(page, setChatTurns)

	// send the user question, appending the reply to the newest chat turn as each chunk arrives
	async function send(retryQuestion?: string): Promise<void> {
		// a retry re-asks a finished chat turn's question, stripped of its attachment note
		const askedQuestion = (retryQuestion ?? question).replace(/(?:^|\n\n)\[attached: [^\]]*\]$/, "").trim()

		// a chat turn may be attachments alone, but a retry does not resend attachments and needs its question
		const sendableAttachmentCount = retryQuestion === undefined ? attachments.length : 0
		if ((!askedQuestion && sendableAttachmentCount === 0) || isStreaming) {
			// a retried chat turn that sent attachments alone has nothing to resend, and a toast shows why
			if (retryQuestion !== undefined && !isStreaming) {
				toast("That turn sent attachments alone. Attach the files again to re-ask.")
			}
			return
		}

		// the conversation so far that gets posted, minus rejected chat turns
		const historyChatTurns = chatTurns
			.filter((chatTurn) => chatTurn.rejection === null && chatTurn.answer !== "")
			.map((chatTurn) => ({ question: chatTurn.question, answer: chatTurn.answer }))

		// the attachments get posted with this chat turn, and the kept attachments join the manage list right away
		const sentAttachments = retryQuestion === undefined ? attachments : []
		if (retryQuestion === undefined) {
			setQuestion("")
			clearDraft()
			setKeptAttachments((previousAttachments) => [
				...previousAttachments,
				...sentAttachments
					.filter((attachment) => attachment.keep)
					.map((attachment) => ({ id: toPlaceholderId(), name: attachment.name, kind: attachment.kind })),
			])
		}
		// a fresh chat turn shows what it sent: an image or a clip on its own bytes until the reload hands it a stored id
		const savedAttachments = sentAttachments.map((attachment) => ({
			id: toPlaceholderId(),
			kind: attachment.kind,
			name: attachment.name,
			...(attachment.kind === "image" || attachment.kind === "video" ? { dataUrl: attachment.dataUrl } : {}),
		}))
		setChatTurns((previousChatTurns) => [
			...previousChatTurns,
			{
				question: withAttachmentNote(askedQuestion, sentAttachments),
				answer: "",
				rejection: null,
				attachments: savedAttachments,
				linkPreviews: [],
				answerLinkPreviews: [],
			},
		])
		setIsStreaming(true)

		// stream under a fresh abort controller, so the stop button can cut this chat turn and only this chat turn
		const controller = new AbortController()
		abortRef.current = controller
		const chatSendResult = await sendChatTurn(
			page,
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

		// a stop before any text drops the whole chat turn, so the empty bubble never lingers
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
		startLinkPreviewRefresh()
	}

	// cut the in-flight chat turn. the text already on screen stays there
	function stop(): void {
		abortRef.current?.abort()
	}

	// wipe the conversation and chat attachments server-side, then locally once the server confirms
	async function clear(): Promise<boolean> {
		if (await sendClearChat(page)) {
			setChatTurns([])
			setKeptAttachments([])
			return true
		}
		return false
	}

	return {
		chatTurns,
		question,
		setQuestion,
		attachments,
		addFiles,
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

// the background polling for the newest chat turn's link preview cards, giving up after a few attempts.
// returns a function that starts the poll, called after a finished chat turn whose text held a link
function useLinkPreviewRefresh(
	chatPage: ChatPage,
	setChatTurns: React.Dispatch<React.SetStateAction<ChatTurn[]>>,
): () => void {
	// how many background refreshes remain, and the timer that schedules them
	const linkPreviewAttemptsRef = useRef(0)
	const linkPreviewTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

	// one refresh: read the conversation again and land the newest chat turn's cards when they are ready
	const refreshLinkPreview = async (): Promise<void> => {
		linkPreviewTimerRef.current = null

		// read the newest chat turn back from the server, spending one of the attempts
		const chatConversation = await fetchChatConversation(chatPage).catch(() => null)
		const serverChatTurn = chatConversation?.chatTurns.at(-1)
		linkPreviewAttemptsRef.current -= 1
		const linkPreviewAttemptsLeft = linkPreviewAttemptsRef.current

		// only a chat turn still marked pending takes the answer
		setChatTurns((chatTurns) => {
			const newestChatTurn = chatTurns.at(-1)
			if (!newestChatTurn?.linkPreviewsPending) {
				return chatTurns
			}

			// a chat turn still pending after this attempt goes back on the timer
			const refreshedChatTurn = toRefreshedChatTurn(newestChatTurn, serverChatTurn, linkPreviewAttemptsLeft)
			if (refreshedChatTurn.linkPreviewsPending) {
				scheduleLinkPreviewRefresh()
			}
			return replaceNewestChatTurn(chatTurns, () => refreshedChatTurn)
		})
	}

	// the one timer, started only when nothing is already waiting
	const scheduleLinkPreviewRefresh = (): void => {
		linkPreviewTimerRef.current ??= setTimeout(() => void refreshLinkPreview(), LINK_PREVIEW_REFRESH_MS)
	}

	// leaving the conversation clears the pending refresh timer
	useEffect(() => {
		return () => {
			if (linkPreviewTimerRef.current) {
				clearTimeout(linkPreviewTimerRef.current)
			}
		}
	}, [])

	// a completed chat turn that mentioned a link loads until its cards land
	return (): void => {
		setChatTurns((chatTurns) => {
			// only the newest chat turn can still be waiting on a link preview. a rejected turn doesn't
			const newestChatTurn = chatTurns.at(-1)
			if (!newestChatTurn || newestChatTurn.rejection !== null) {
				return chatTurns
			}
			if (!hasPreviewableLink(newestChatTurn.question) && !hasPreviewableLink(newestChatTurn.answer)) {
				return chatTurns
			}

			// a link is worth polling for, so the chat turn shows its card as pending until one arrives
			linkPreviewAttemptsRef.current = 6
			scheduleLinkPreviewRefresh()
			return replaceNewestChatTurn(chatTurns, (chatTurn) => ({ ...chatTurn, linkPreviewsPending: true }))
		})
	}
}

// the newest chat turn with whatever cards the server holds for it. loading ends when every chat turn with a link
// has a card or the attempts run out
function toRefreshedChatTurn(
	newestChatTurn: ChatTurn,
	serverChatTurn:
		| { question: string; linkPreviews: ChatTurn["linkPreviews"]; answerLinkPreviews: ChatTurn["answerLinkPreviews"] }
		| undefined,
	attemptsLeft: number,
): ChatTurn {
	// the newest server chat turn is this one when its stored question matches
	const isSameChatTurn = serverChatTurn !== undefined && serverChatTurn.question === newestChatTurn.question
	const linkPreviews = isSameChatTurn ? serverChatTurn.linkPreviews : newestChatTurn.linkPreviews
	const answerLinkPreviews = isSameChatTurn ? serverChatTurn.answerLinkPreviews : newestChatTurn.answerLinkPreviews

	// a chat turn without a link needs no card of its own
	const isQuestionDone = !hasPreviewableLink(newestChatTurn.question) || linkPreviews.length > 0
	const isAnswerDone = !hasPreviewableLink(newestChatTurn.answer) || answerLinkPreviews.length > 0
	const isChatTurnDone = (isQuestionDone && isAnswerDone) || attemptsLeft <= 0
	return { ...newestChatTurn, linkPreviews, answerLinkPreviews, linkPreviewsPending: !isChatTurnDone }
}

// replace the newest chat turn, which is the one a streaming reply is filling in
function replaceNewestChatTurn(chatTurns: ChatTurn[], replace: (chatTurn: ChatTurn) => ChatTurn): ChatTurn[] {
	return chatTurns.map((chatTurn, index) => (index === chatTurns.length - 1 ? replace(chatTurn) : chatTurn))
}
