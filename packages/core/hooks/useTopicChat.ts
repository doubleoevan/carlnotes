// the chat panel's conversation state, owned by one hook so the panel components stay pure view

import { showClientError } from "@carlnotes/client/apiClient"
import { type ChatPage, type ChatSendResult, sendChatTurn, sendClearChat } from "@carlnotes/client/chatClient"
import { type SpokenQuestionTimings, toVoiceChatPage } from "@carlnotes/client/voiceClient"
import type { KeptChatAttachment } from "@carlnotes/contracts/chat"
import { toPodcastEpisodeNoteParts, withoutAttachmentNote } from "@carlnotes/contracts/chatQuestionNotes"
import type { TopicToolCalls } from "@carlnotes/contracts/chatTurns"
import type { ChatAttachment, VoiceChatPage } from "@carlnotes/contracts/payloads"
import { EMPTY_TOPIC_DRAFT, type TopicDraft } from "@carlnotes/contracts/topicPayloads"
import { useEffect, useRef, useState } from "react"
import { toChatHistoryTurns } from "../lib/chatHistoryTurns"
import {
	type ChatTurn,
	replaceChatTurn,
	toFinishedChatTurns,
	toKeptAttachmentPlaceholders,
	toSentChatTurn,
	upsertChatTurn,
	withoutChatTurn,
} from "../lib/chatTurns"
import { applyTopicEditToolCalls, showTopicToolCalls } from "../lib/topicToolCalls"
import {
	clearProposedTopicEdit,
	publishTopicChanged,
	startEditingTopic,
	toCurrentChatGuard,
} from "../stores/chatConversationStore"
import { type ChatConversationGates, useChatConversationLoad } from "./useChatConversationLoad"
import { type EditableTopicDraft, useEditableTopicDraft } from "./useEditableTopicDraft"
import { useLinkPreviewRefresh } from "./useLinkPreviewRefresh"

// how a question is sent: typed, or spoken with the timings its spoken question event reports
export type QuestionSendOptions = {
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
	// what this user already keeps for the topic, and the delete attachment handler that frees a slot
	keptAttachments: KeptChatAttachment[]
	// the topic being edited with carl, previewing what he proposed, or null when no edit is under way
	editableTopicDraft: EditableTopicDraft | null
	// carl's topic draft and the files waiting for the topic
	topicDraft: TopicDraft
	isStreaming: boolean
	// the page the mic and the play buttons name, null while voice is off
	voiceChatPage: VoiceChatPage | null
	// send streams the question's reply, a retry's or a spoken transcript's in place of the draft, and stop cuts
	// it keeping whatever arrived
	send: (questionText?: string, options?: QuestionSendOptions) => Promise<void>
	stop: () => void
	clear: () => Promise<boolean>
}

// adapters keep files, speech, and navigation with the app that provides them
export type ChatAttachmentState = {
	attachments: ChatAttachment[]
	keptAttachments: KeptChatAttachment[]
	setKeptAttachments: React.Dispatch<React.SetStateAction<KeptChatAttachment[]>>
	clearDraft: () => void
}
export type ChatTopicDraftState = {
	topicDraft: TopicDraft
	setTopicDraft: React.Dispatch<React.SetStateAction<TopicDraft>>
	openCreatedTopic: (topicId: string) => Promise<void>
	resetTopicDraft: () => void
}
export type ChatEffects = {
	onNotice?: (message: string) => void
	openNewTopicChat?: () => void
	stopSpokenAnswer?: (spokenAnswerKey: string) => void
	createSpokenAnswer?: (
		options: QuestionSendOptions & { spokenAnswerKey: string; voiceChatPage: VoiceChatPage | null },
	) => { appendChunk: (answer: string) => void; finish: (answer: string, result: ChatSendResult) => void } | null
	subscribeToPodcastTurn?: (
		topicId: string,
		listener: (turn: { chatTurn: ChatTurn; isDropped: boolean }) => void,
	) => () => void
}
type UseTopicChatOptions = {
	page: ChatPage
	attachmentState?: ChatAttachmentState
	draftState?: ChatTopicDraftState
	effects?: ChatEffects
}

/**
 * Manages loading, sending, streaming, stopping, and clearing a private conversation.
 */
export function useTopicChat({ page, attachmentState, draftState, effects = {} }: UseTopicChatOptions): TopicChat {
	const onNotice = effects.onNotice ?? showClientError
	// provide text-only defaults for attachments and Topic drafts
	const [localKeptAttachments, setLocalKeptAttachments] = useState<KeptChatAttachment[]>([])
	const [localTopicDraft, setLocalTopicDraft] = useState<TopicDraft>(EMPTY_TOPIC_DRAFT)
	const {
		attachments = [],
		keptAttachments = localKeptAttachments,
		setKeptAttachments = setLocalKeptAttachments,
		clearDraft = () => {},
	} = attachmentState ?? {}
	const {
		topicDraft = localTopicDraft,
		setTopicDraft = setLocalTopicDraft,
		openCreatedTopic = async () => {},
		resetTopicDraft = () => setLocalTopicDraft(EMPTY_TOPIC_DRAFT),
	} = draftState ?? {}

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
	// the stored conversation, and the gates that its load resolves
	const chatConversationGates = useChatConversationLoad({
		page,
		setChatTurns,
		setTopicDraft,
		setKeptAttachments,
		onLoadError: onNotice,
	})
	// each finished chat turn's link preview cards poll in the background until they complete
	const startLinkPreviewRefresh = useLinkPreviewRefresh(page, setChatTurns)
	// the page the voice routes name, once the load says voice is on
	const voiceChatPage = chatConversationGates.isVoiceChatConfigured ? toVoiceChatPage(page) : null

	// a question asked from the podcast player about this topic shows here as it streams, without speaking it again, and
	// leaves if a stop before any text drops it
	useEffect(() => {
		if (page.topicId === undefined) {
			return
		}
		return effects.subscribeToPodcastTurn?.(page.topicId, ({ chatTurn, isDropped }) =>
			setChatTurns((previousChatTurns) =>
				isDropped
					? withoutChatTurn(previousChatTurns, chatTurn.spokenAnswerKey)
					: upsertChatTurn(previousChatTurns, chatTurn),
			),
		)
	}, [page.topicId, effects.subscribeToPodcastTurn])

	// stop the streamed spoken answer on unmount
	useEffect(
		() => () => {
			if (streamingSpokenAnswerKeyRef.current) {
				effects.stopSpokenAnswer?.(streamingSpokenAnswerKeyRef.current)
			}
		},
		[effects.stopSpokenAnswer],
	)

	// toast the saves and rejections, show the topic draft, and open a created topic, else reload the page behind the
	// panel
	type HandleToolCallsOptions = { spokenAnswerKey: string; toolCalls: TopicToolCalls; isCurrentChat: () => boolean }
	const handleToolCalls = ({ spokenAnswerKey, toolCalls, isCurrentChat }: HandleToolCallsOptions): void => {
		if (!isCurrentChat()) {
			return
		}
		// keep the chat tool calls on the chat turn, so the model reads a save as a call
		const streamedChatToolCalls = toolCalls.chatToolCalls
		if (streamedChatToolCalls) {
			setChatTurns((previousChatTurns) =>
				replaceChatTurn(previousChatTurns, spokenAnswerKey, (chatTurn) => ({
					...chatTurn,
					toolCalls: [...(chatTurn.toolCalls ?? []), ...streamedChatToolCalls],
				})),
			)
		}
		showTopicToolCalls({ topicToolToasts: toolCalls, onSaved: onNotice, onRejected: onNotice })
		if (page.topicId) {
			applyTopicEditToolCalls({
				topicId: page.topicId,
				toolCalls,
				onStartEditingTopic: startEditingTopic,
				onClearProposedTopicEdit: clearProposedTopicEdit,
			})
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
	type CanSendOptions = { askedQuestion: string; sendableAttachmentCount: number; isRetry: boolean }
	function canSend({ askedQuestion, sendableAttachmentCount, isRetry }: CanSendOptions): boolean {
		if (
			isStreaming ||
			abortRef.current ||
			!chatConversationGates.isLoaded ||
			!chatConversationGates.canChat ||
			chatConversationGates.hasLoadFailed
		) {
			return false
		}
		// send when there is something to send
		if (askedQuestion || sendableAttachmentCount > 0) {
			return true
		}
		// say why a retry with nothing left to resend stops
		if (isRetry) {
			onNotice("That turn sent attachments alone. Attach the files again to re-ask.")
		}
		return false
	}

	// send the user question, appending the reply to its own chat turn as each chunk arrives
	async function send(questionText?: string, sendOptions: QuestionSendOptions = {}): Promise<void> {
		const { isSpoken = false } = sendOptions

		// a retry re-asks a finished chat turn's question, stripped of its notes. a spoken transcript is a new question,
		// sent instead of the draft
		const isRetry = questionText !== undefined && !isSpoken
		const askedQuestion = toAskedQuestion(questionText ?? question)

		// a chat turn may be attachments alone, but a retry does not resend attachments and needs its question. a spoken
		// question sends its transcript alone and leaves the draft and its attachments in the composer
		const isDraftSent = questionText === undefined
		const sendableAttachmentCount = isDraftSent ? attachments.length : 0
		if (!canSend({ askedQuestion, sendableAttachmentCount, isRetry })) {
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
		const streamedSpokenAnswer = effects.createSpokenAnswer?.({
			spokenAnswerKey: sentChatTurn.spokenAnswerKey,
			voiceChatPage,
			...sendOptions,
		})
		let streamedAnswer = ""
		streamingSpokenAnswerKeyRef.current = streamedSpokenAnswer ? sentChatTurn.spokenAnswerKey : null

		// stream under a fresh abort controller, so the stop button can cut this chat turn and only this chat turn
		const isCurrentChat = toCurrentChatGuard()
		const controller = new AbortController()
		abortRef.current = controller
		const chatSendResult = await sendChatTurn({
			page,
			question: askedQuestion,
			history: chatHistoryTurns,
			attachments: sentAttachments,
			onChunk: (chunk) => {
				if (!isCurrentChat()) {
					return
				}
				streamedAnswer += chunk
				streamedSpokenAnswer?.appendChunk(streamedAnswer)
				setChatTurns((previousChatTurns) =>
					replaceChatTurn(previousChatTurns, sentChatTurn.spokenAnswerKey, (chatTurn) => ({
						...chatTurn,
						answer: chatTurn.answer + chunk,
					})),
				)
			},
			onToolCalls: (toolCalls) =>
				handleToolCalls({ spokenAnswerKey: sentChatTurn.spokenAnswerKey, toolCalls, isCurrentChat }),
			signal: controller.signal,
			topicDraft: page.newTopic ? topicDraft : undefined,
			isSpoken,
		})
		abortRef.current = null
		streamingSpokenAnswerKeyRef.current = null
		streamedSpokenAnswer?.finish(streamedAnswer, chatSendResult)
		finishSend({ spokenAnswerKey: sentChatTurn.spokenAnswerKey, chatSendResult, isCurrentChat })
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
	type FinishSendOptions = { spokenAnswerKey: string; chatSendResult: ChatSendResult; isCurrentChat: () => boolean }
	function finishSend({ spokenAnswerKey, chatSendResult, isCurrentChat }: FinishSendOptions): void {
		if (!isCurrentChat()) {
			return
		}
		// a stop before any text drops the whole chat turn, so the empty bubble never lingers
		setChatTurns((previousChatTurns) => toFinishedChatTurns(previousChatTurns, { spokenAnswerKey, chatSendResult }))
		setIsStreaming(false)
		startLinkPreviewRefresh(spokenAnswerKey)
		// open the new-topic chat the reply asked for
		if (shouldOpenNewTopicChatRef.current) {
			shouldOpenNewTopicChatRef.current = false
			effects.openNewTopicChat?.()
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
		const isCurrentChat = toCurrentChatGuard()
		if ((await sendClearChat(page)) && isCurrentChat()) {
			setIsConversationEnded(true)
		}
	}

	// cut the chat turn in progress. the text already on screen stays there
	function stop(): void {
		abortRef.current?.abort()
	}

	// wipe the conversation and chat attachments server-side, then locally once the server confirms
	async function clear(): Promise<boolean> {
		const isCurrentChat = toCurrentChatGuard()
		if ((await sendClearChat(page)) && isCurrentChat()) {
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
		keptAttachments,
		...chatConversationGates,
		editableTopicDraft,
		topicDraft,
		isStreaming,
		voiceChatPage,
		send,
		stop,
		clear,
	}
}

/**
 * Removes podcast and attachment notes from a retried question.
 */
export function toAskedQuestion(question: string): string {
	const { question: questionWithoutPodcastEpisodeNote } = toPodcastEpisodeNoteParts(question)
	return withoutAttachmentNote(questionWithoutPodcastEpisodeNote).trim()
}
