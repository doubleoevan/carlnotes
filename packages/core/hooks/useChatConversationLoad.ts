// the stored conversation's load into the private chat, and the gates that the load resolves

import { showClientError } from "@carlnotes/client/apiClient"
import { type ChatPage, fetchChatConversation } from "@carlnotes/client/chatClient"
import type { ChatConversation, KeptChatAttachment } from "@carlnotes/contracts/chat"
import type { TopicDraft } from "@carlnotes/contracts/topicPayloads"
import { EMPTY_TOPIC_DRAFT } from "@carlnotes/contracts/topicPayloads"
import { useEffect, useState } from "react"
import { type ChatTurn, toLoadedChatTurn } from "../lib/chatTurns"
import { toProposedTopicEdit } from "../lib/topicToolCalls"
import {
	clearProposedTopicEdit,
	startEditingTopic,
	toCurrentChatGuard,
	useChatConversation,
} from "../stores/chatConversationStore"

// the state that the conversation load fills, which the rest of the chat shares
type UseChatConversationLoadOptions = {
	page: ChatPage
	setChatTurns: React.Dispatch<React.SetStateAction<ChatTurn[]>>
	setTopicDraft: React.Dispatch<React.SetStateAction<TopicDraft>>
	setKeptAttachments: React.Dispatch<React.SetStateAction<KeptChatAttachment[]>>
	onLoadError?: (message: string) => void
}

// the gates that the conversation load resolves, and whether the load has finished
export type ChatConversationGates = {
	// what the user may do in the chat
	canChat: boolean
	// whether this conversation requires sign-up
	isSignupRequired: boolean
	// whether the monthly chat budget is exhausted
	isBudgetExhausted: boolean
	// whether this user may edit the topic in the chat
	canEditTopic: boolean
	// whether this is the user's first topic
	isFirstTopic: boolean
	// how many more topics the plan holds and its limit, on the new-topic chat alone
	topicsRemaining: number | null
	topicLimit: number | null
	// whether the mic and the play buttons render, which needs a transcription model and a speech model
	isVoiceChatConfigured: boolean
	// true once the conversation load finishes, so the panel can select its opening state from what came back
	isLoaded: boolean
	hasLoadFailed: boolean
	reload: () => void
}

/**
 * Loads a stored conversation and its access gates.
 */
export function useChatConversationLoad({
	page,
	setChatTurns,
	setTopicDraft,
	setKeptAttachments,
	onLoadError = showClientError,
}: UseChatConversationLoadOptions): ChatConversationGates {
	// the gates that the conversation load resolves
	const [canChat, setCanChat] = useState(false)
	const [isSignupRequired, setIsSignupRequired] = useState(false)
	const [isBudgetExhausted, setIsBudgetExhausted] = useState(false)
	const [canEditTopic, setCanEditTopic] = useState(false)
	const [isFirstTopic, setIsFirstTopic] = useState(false)
	const [topicsRemaining, setTopicsRemaining] = useState<number | null>(null)
	const [topicLimit, setTopicLimit] = useState<number | null>(null)
	const [isVoiceChatConfigured, setIsVoiceChatConfigured] = useState(false)
	// whether the load has finished
	const [isLoaded, setIsLoaded] = useState(false)
	const [hasLoadFailed, setHasLoadFailed] = useState(false)
	const [loadCount, setLoadCount] = useState(0)
	const { accountId } = useChatConversation()

	// the page object is rebuilt each render, so the effect depends on the fields that name the conversation
	// biome-ignore lint/correctness/useExhaustiveDependencies: the page's ids identify the conversation
	useEffect(() => {
		// moving to another topic must not let the previous topic's conversation load into this one
		let isCurrentTopic = true
		const isCurrentChat = toCurrentChatGuard()
		setIsLoaded(false)
		setHasLoadFailed(false)
		setCanChat(false)
		fetchChatConversation(page)
			.then((chatConversation) => {
				if (!isCurrentTopic || !isCurrentChat()) {
					return
				}
				setChatTurns(chatConversation.chatTurns.map(toLoadedChatTurn))
				// the gates and the kept attachments update together, so the panel opens in one finished state
				setCanChat(chatConversation.canChat)
				setIsSignupRequired(chatConversation.isSignupRequired)
				setIsBudgetExhausted(chatConversation.isBudgetExhausted)
				setCanEditTopic(chatConversation.canEditTopic)
				setIsFirstTopic(chatConversation.isFirstTopic ?? false)
				setTopicsRemaining(chatConversation.topicsRemaining ?? null)
				setTopicLimit(chatConversation.topicLimit ?? null)
				setIsVoiceChatConfigured(chatConversation.isVoiceChatConfigured)
				// show the topic draft that carl wrote earlier
				setTopicDraft(chatConversation.topicDraft ?? EMPTY_TOPIC_DRAFT)
				// bring back the change that carl proposed earlier in this conversation
				restoreProposedTopicEdit(page, chatConversation)
				// the kept files and the loaded flag are set last, so the panel opens in one finished state
				setKeptAttachments(chatConversation.keptAttachments ?? [])
				setIsLoaded(true)
			})
			.catch(() => {
				// a failed load still finishes, so the panel never waits on a load that already failed
				if (!isCurrentTopic || !isCurrentChat()) {
					return
				}
				setHasLoadFailed(true)
				onLoadError("Carl could not open this conversation. Refresh to try again.")
				setIsLoaded(true)
			})

		// leaving this topic discards any request in progress for it
		return () => {
			isCurrentTopic = false
		}
	}, [page.topicId, page.teamId, page.newTopic, setKeptAttachments, accountId, loadCount])
	return {
		canChat,
		isSignupRequired,
		isBudgetExhausted,
		canEditTopic,
		isFirstTopic,
		topicsRemaining,
		topicLimit,
		isVoiceChatConfigured,
		isLoaded,
		hasLoadFailed,
		reload: () => setLoadCount((count) => count + 1),
	}
}

// restored history supersedes a cached proposal, including one cancelled on another device
function restoreProposedTopicEdit(page: ChatPage, chatConversation: ChatConversation): void {
	const proposedTopicEdit = toProposedTopicEdit(chatConversation.chatTurns)
	clearProposedTopicEdit()
	if (page.topicId && proposedTopicEdit && chatConversation.canEditTopic) {
		startEditingTopic(page.topicId, proposedTopicEdit)
	}
}
