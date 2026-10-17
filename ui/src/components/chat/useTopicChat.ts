// the chat panel's conversation state, owned by one hook so the panel components stay pure view
import type { KeptChatAttachment, TopicToolCalls } from "@shared/contracts/chat"
import type { ChatAttachment, VoiceChatPage } from "@shared/payloads"
import { toFinishedSpokenParts, toUnfinishedSpokenParts } from "@shared/spokenText"
import type { TopicDraft } from "@shared/topicPayloads"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { type ChatPage, type ChatSendResult, sendChatTurn, sendClearChat } from "@/clients/chatClient"
import { type SpokenQuestionTimings, sendSpokenQuestionEvent, toVoiceChatPage } from "@/clients/voiceClient"
import { toChatHistoryTurns } from "@/components/chat/chatHistoryTurns"
import {
	type ChatTurn,
	replaceNewestChatTurn,
	toFinishedChatTurns,
	toKeptAttachmentPlaceholders,
	toSentChatTurn,
} from "@/components/chat/chatTurns"
import { applyTopicEditToolCalls, toastTopicToolCalls } from "@/components/chat/topicToolCalls"
import { useChatAttachments } from "@/components/chat/useChatAttachments"
import { type ChatConversationGates, useChatConversationLoad } from "@/components/chat/useChatConversationLoad"
import { type EditableTopicDraft, useEditableTopicDraft } from "@/components/chat/useEditableTopicDraft"
import { useLinkPreviewRefresh } from "@/components/chat/useLinkPreviewRefresh"
import { useNewTopicDraft } from "@/components/chat/useNewTopicDraft"
import { publishTopicChanged, setChatId } from "@/stores/chatPanelStore"
import {
	appendSpokenAnswerPart,
	completeSpokenAnswer,
	stopSpokenAnswerKey,
	toSpokenAnswerState,
} from "@/stores/spokenAnswerStore"

// how a question is sent: typed, or spoken with the timings its spoken question event reports
export type SendChatTurnOptions = {
	isSpoken?: boolean
	spokenQuestionTimings?: SpokenQuestionTimings
}

// everything the panel needs: the conversation, the question with its attachments, the gates, and the actions
export type TopicChat = ChatConversationGates & {
	chatTurns: ChatTurn[]
	question: string
	setQuestion: (value: string) => void
	// the question's attachments: files selected or dropped in, images pasted, and long copy pastes turned into chips
	attachments: ChatAttachment[]
	// the files taken in
	addAttachmentFiles: (attachmentFiles: File[]) => Promise<File[]>
	addPastedText: (text: string) => void
	removeAttachment: (index: number) => void
	// what this user already keeps for the topic, and the delete attachment handler that frees a slot
	keptAttachments: KeptChatAttachment[]
	removeKeptAttachment: (keptAttachmentId: string) => Promise<void>
	// the topic being edited with carl, previewing what he proposed, or null when no edit is under way
	editableTopicDraft: EditableTopicDraft | null
	// carl's topic draft and the files waiting for the topic
	topicDraft: TopicDraft
	topicDraftAttachmentFiles: File[]
	removeTopicDraftAttachmentFile: (index: number) => void
	isStreaming: boolean
	// the page the mic and the play buttons name, null while voice is off
	voiceChatPage: VoiceChatPage | null
	// send streams the question's reply, a retry's or a spoken transcript's in place of the draft, and stop cuts
	// it keeping whatever arrived
	send: (questionText?: string, options?: SendChatTurnOptions) => Promise<void>
	stop: () => void
	clear: () => Promise<boolean>
}

/**
 * One topic's chat conversation: loading it, sending a chat turn, streaming the reply, stopping, and clearing.
 */
export function useTopicChat(page: ChatPage): TopicChat {
	const [chatTurns, setChatTurns] = useState<ChatTurn[]>([])
	const [question, setQuestion] = useState("")

	// whether a chat turn is streaming, and the controller that stops it
	const [isStreaming, setIsStreaming] = useState(false)
	const abortRef = useRef<AbortController | null>(null)
	// the spoken answer key of the reply being spoken as it streams, which the panel's unmount stops
	const streamingSpokenAnswerKeyRef = useRef<string | null>(null)
	// whether to open the new-topic chat once the reply ends
	const shouldOpenNewTopicChatRef = useRef(false)
	// whether a topic was created, which ends this conversation once the reply and its save are done
	const isTopicCreatedRef = useRef(false)
	// whether the conversation on screen was cleared on the server, so the next question starts a new one here too
	const [isConversationEnded, setIsConversationEnded] = useState(false)
	// the topic this chat may edit
	const editableTopicDraft = useEditableTopicDraft(page.topicId ?? null)
	// the question's files and the topic's kept ones, with the two limits that bound them
	const {
		attachments,
		addAttachmentFiles: addChatAttachmentFiles,
		addPastedText,
		removeAttachment,
		keptAttachments,
		setKeptAttachments,
		removeKeptAttachment,
		clearDraft,
	} = useChatAttachments()
	// the topic draft the new-topic chat is building, and the files waiting for the topic
	const {
		topicDraft,
		setTopicDraft,
		topicDraftAttachmentFiles,
		addTopicDraftAttachmentFiles,
		removeTopicDraftAttachmentFile,
		openCreatedTopic,
		resetTopicDraft,
	} = useNewTopicDraft(page)
	// the stored conversation, and the gates that its load resolves
	const chatConversationGates = useChatConversationLoad({ page, setChatTurns, setTopicDraft, setKeptAttachments })
	// the newest chat turn's link preview cards poll in the background until they complete
	const startLinkPreviewRefresh = useLinkPreviewRefresh(page, setChatTurns)
	// the page the voice routes name, once the load says voice is on
	const voiceChatPage = chatConversationGates.isVoiceChatConfigured ? toVoiceChatPage(page) : null

	// a panel that unmounts stops the reply it was speaking. the text stream goes on
	useEffect(
		() => () => {
			if (streamingSpokenAnswerKeyRef.current) {
				stopSpokenAnswerKey(streamingSpokenAnswerKeyRef.current)
			}
		},
		[],
	)

	// a file attached in the new-topic chat waits in the topic draft as well as reaching carl for the turn
	const addAttachmentFiles = async (attachmentFiles: File[]): Promise<File[]> => {
		const validAttachmentFiles = await addChatAttachmentFiles(attachmentFiles)
		if (page.newTopic) {
			addTopicDraftAttachmentFiles(validAttachmentFiles)
		}
		return validAttachmentFiles
	}

	// toast the saves and rejections, show the topic draft, and open a created topic, else reload the page behind the
	// panel
	const handleToolCalls = (toolCalls: TopicToolCalls): void => {
		// keep the chat tool calls on the chat turn, so the model reads a save as a call
		const streamedChatToolCalls = toolCalls.chatToolCalls
		if (streamedChatToolCalls) {
			setChatTurns((previousChatTurns) =>
				replaceNewestChatTurn(previousChatTurns, (chatTurn) => ({
					...chatTurn,
					toolCalls: [...(chatTurn.toolCalls ?? []), ...streamedChatToolCalls],
				})),
			)
		}
		toastTopicToolCalls(toolCalls)
		if (page.topicId) {
			applyTopicEditToolCalls(page.topicId, toolCalls)
		}
		// fill the card with the topic draft carl wrote
		if (toolCalls.topicDraft) {
			setTopicDraft(toolCalls.topicDraft)
		}
		// remember to open the new-topic chat once the reply ends. the reply's last words stay in this conversation
		if (toolCalls.isNewTopicChatOpened) {
			shouldOpenNewTopicChatRef.current = true
		}
		// open a created topic, and remember to end the conversation that made it
		if (toolCalls.createdTopicId) {
			isTopicCreatedRef.current = true
			void openCreatedTopic(toolCalls.createdTopicId)
			return
		}
		// reload the topic page behind the panel, so a save shows there too
		if (page.topicId) {
			publishTopicChanged(page.topicId)
		}
	}

	// whether a send may go: something to send and no reply streaming. a retry with only attachments to resend says why
	function canSend(askedQuestion: string, sendableAttachmentCount: number, isRetry: boolean): boolean {
		if (isStreaming) {
			return false
		}
		// send when there is something to send
		if (askedQuestion || sendableAttachmentCount > 0) {
			return true
		}
		// say why a retry with nothing left to resend stops
		if (isRetry) {
			toast("That turn sent attachments alone. Attach the files again to re-ask.")
		}
		return false
	}

	// send the user question, appending the reply to the newest chat turn as each chunk arrives
	async function send(questionText?: string, sendOptions: SendChatTurnOptions = {}): Promise<void> {
		const isSpoken = sendOptions.isSpoken ?? false

		// a retry re-asks a finished chat turn's question, stripped of its attachment note. a spoken transcript is a
		// new question, sent instead of the draft
		const isRetry = questionText !== undefined && !isSpoken
		const askedQuestion = (questionText ?? question).replace(/(?:^|\n\n)\[attached: [^\]]*\]$/, "").trim()

		// a chat turn may be attachments alone, but a retry does not resend attachments and needs its question. a spoken
		// question sends its transcript alone and leaves the draft and its attachments in the composer
		const isDraftSent = questionText === undefined
		const sendableAttachmentCount = isDraftSent ? attachments.length : 0
		if (!canSend(askedQuestion, sendableAttachmentCount, isRetry)) {
			return
		}
		// a created topic already cleared this conversation on the server, so the next question sends none of it
		const chatHistoryTurns = isConversationEnded ? [] : toChatHistoryTurns(chatTurns)

		// a send of the draft posts its attachments and clears the composer
		const sentAttachments = isDraftSent ? takeDraftAttachments() : []
		// show the question, on its own if the conversation before it ended with the topic it made
		const sentChatTurn = toSentChatTurn({ question: askedQuestion, attachments: sentAttachments })
		setChatTurns((previousChatTurns) => [...(isConversationEnded ? [] : previousChatTurns), sentChatTurn])
		// this question is the new conversation, so the next one keeps it
		setIsConversationEnded(false)
		setIsStreaming(true)

		// a spoken question's reply is spoken as it streams, and keeps the whole answer to split it
		const streamedSpokenAnswer = toStreamedSpokenAnswer({
			spokenAnswerKey: sentChatTurn.spokenAnswerKey,
			page: voiceChatPage,
			...sendOptions,
		})
		let streamedAnswer = ""
		streamingSpokenAnswerKeyRef.current = streamedSpokenAnswer ? sentChatTurn.spokenAnswerKey : null

		// stream under a fresh abort controller, so the stop button can cut this chat turn and only this chat turn
		const controller = new AbortController()
		abortRef.current = controller
		const chatSendResult = await sendChatTurn(
			page,
			askedQuestion,
			chatHistoryTurns,
			sentAttachments,
			(chunk) => {
				streamedAnswer += chunk
				streamedSpokenAnswer?.appendChunk(streamedAnswer)
				setChatTurns((previousChatTurns) =>
					replaceNewestChatTurn(previousChatTurns, (chatTurn) => ({ ...chatTurn, answer: chatTurn.answer + chunk })),
				)
			},
			handleToolCalls,
			controller.signal,
			page.newTopic ? topicDraft : undefined,
			isSpoken,
		)
		abortRef.current = null
		streamingSpokenAnswerKeyRef.current = null
		streamedSpokenAnswer?.finish(streamedAnswer, chatSendResult)
		finishSend(chatSendResult)
	}

	// clear the draft from the composer and return its attachments, which post with this chat turn. the kept
	// attachments join the manage list right away
	function takeDraftAttachments(): ChatAttachment[] {
		setQuestion("")
		clearDraft()
		setKeptAttachments((previousAttachments) => [...previousAttachments, ...toKeptAttachmentPlaceholders(attachments)])
		return attachments
	}

	// complete the chat turn the reply filled, then follow wherever that reply pointed
	function finishSend(chatSendResult: ChatSendResult): void {
		// a stop before any text drops the whole chat turn, so the empty bubble never lingers
		setChatTurns((previousChatTurns) => toFinishedChatTurns(previousChatTurns, chatSendResult))
		setIsStreaming(false)
		startLinkPreviewRefresh()
		// open the new-topic chat the reply asked for
		if (shouldOpenNewTopicChatRef.current) {
			shouldOpenNewTopicChatRef.current = false
			setChatId({ kind: "private", newTopic: true })
		}
		if (!isTopicCreatedRef.current) {
			return
		}
		isTopicCreatedRef.current = false

		// a stopped send returns before the server has written the created turn, so the clear would race that write
		// and leave the conversation half gone
		if (chatSendResult !== "stopped") {
			void endCreatedTopicConversation()
		}
	}

	// a created topic ends the conversation that made it, so the next topic starts from nothing. the reply stays on
	// screen until the next question, and a clear the server turned down leaves the conversation whole on both sides
	async function endCreatedTopicConversation(): Promise<void> {
		if (await sendClearChat(page)) {
			setIsConversationEnded(true)
		}
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
			// reset the topic draft and its files with the conversation
			resetTopicDraft()
			return true
		}
		return false
	}

	return {
		chatTurns,
		question,
		setQuestion,
		attachments,
		addAttachmentFiles,
		addPastedText,
		removeAttachment,
		keptAttachments,
		removeKeptAttachment,
		...chatConversationGates,
		editableTopicDraft,
		topicDraft,
		topicDraftAttachmentFiles,
		removeTopicDraftAttachmentFile,
		isStreaming,
		voiceChatPage,
		send,
		stop,
		clear,
	}
}

// what a spoken question's reply does as it streams: speak each finished paragraph, then the rest, and post the
// spoken question event once
type StreamedSpokenAnswer = {
	appendChunk: (answer: string) => void
	finish: (answer: string, chatSendResult: ChatSendResult) => void
}

// the chat turn the reply fills, the page it speaks on, null while voice is off, and how the question was sent
type ToStreamedSpokenAnswerOptions = { spokenAnswerKey: string; page: VoiceChatPage | null } & SendChatTurnOptions

// the speaker of one spoken question's reply, keyed by the chat turn the reply fills. a typed question and a question
// asked while voice is off have no speaker
function toStreamedSpokenAnswer({
	spokenAnswerKey,
	page,
	isSpoken,
	spokenQuestionTimings,
}: ToStreamedSpokenAnswerOptions): StreamedSpokenAnswer | null {
	if (!isSpoken || !page || !spokenQuestionTimings) {
		return null
	}

	// where the next unfinished spoken part starts, and whether the spoken question event posted
	let spokenPartStart = 0
	let isQuestionEventPosted = false

	// post the spoken question event once, with the first spoken word's delay if a spoken part played
	const postQuestionEvent = (playingAt: number | null): void => {
		if (isQuestionEventPosted) {
			return
		}
		isQuestionEventPosted = true
		sendSpokenQuestionEvent({ page, spokenQuestionTimings, playingAt })
	}

	// append one spoken part, with the first playing reporting the event
	const speak = (text: string): void => {
		appendSpokenAnswerPart({ spokenAnswerKey, page, text, onFirstPlaying: postQuestionEvent })
	}
	return {
		// speak the short first spoken part at its sentence end, then each paragraph as its blank line arrives
		appendChunk: (answer) => {
			const finishedSpokenParts = toFinishedSpokenParts(answer, spokenPartStart)
			spokenPartStart = finishedSpokenParts.spokenPartStart
			for (const spokenPart of finishedSpokenParts.spokenParts) {
				speak(spokenPart)
			}
		},
		// go quiet with a stopped or rejected stream, or speak the rest
		finish: (answer, chatSendResult) => {
			if (chatSendResult !== null) {
				stopSpokenAnswerKey(spokenAnswerKey)
				postQuestionEvent(null)
				return
			}

			// the unfinished tail is the last spoken part
			for (const spokenPart of toUnfinishedSpokenParts(answer, spokenPartStart)) {
				speak(spokenPart)
			}

			// a reply that queued nothing posts the event now, and a queue posts it from its first playing or its end
			completeSpokenAnswer(spokenAnswerKey)
			if (toSpokenAnswerState(spokenAnswerKey) === "idle") {
				postQuestionEvent(null)
			}
		},
	}
}
