// the stored conversation's load into the private chat, and the gates that the load resolves

import { type ChatPage, fetchChatConversation } from "@carlnotes/client/chatClient"
import { EMPTY_TOPIC_DRAFT } from "@carlnotes/contracts/topicPayloads"
import { useEffect, useState } from "react"
import { toast } from "sonner"
import { startEditingTopic } from "@/stores/chatPanelStore"
import { type ChatTurn, toLoadedChatTurn } from "./chatTurns"
import { toProposedTopicEdit } from "./topicToolCalls"
import type { ChatAttachments } from "./useChatAttachments"
import type { NewTopicDraft } from "./useNewTopicDraft"

// the state that the conversation load fills, which the rest of the chat shares
type UseChatConversationLoadOptions = {
	page: ChatPage
	setChatTurns: React.Dispatch<React.SetStateAction<ChatTurn[]>>
	setTopicDraft: NewTopicDraft["setTopicDraft"]
	setKeptAttachments: ChatAttachments["setKeptAttachments"]
}

// the gates that the conversation load resolves, and whether the load has finished
export type ChatConversationGates = {
	// what the user may do in the chat
	canChat: boolean
	// a signed-out visitor may type but their send click routes to signup, so the panel shows for them too
	isSignupRequired: boolean
	// an exhausted monthly budget keeps the panel open showing the upgrade link instead of the composer
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
}

/** Loads the stored conversation into the chat. Every signed-in user's chat turns persist server-side. */
export function useChatConversationLoad({
	page,
	setChatTurns,
	setTopicDraft,
	setKeptAttachments,
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

	// the page object is rebuilt each render, so the effect depends on the fields that name the conversation
	// biome-ignore lint/correctness/useExhaustiveDependencies: the page's ids identify the conversation
	useEffect(() => {
		// moving to another topic must not let the previous topic's conversation load into this one
		let isCurrentTopic = true
		fetchChatConversation(page)
			.then((chatConversation) => {
				if (!isCurrentTopic) {
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
				const proposedTopicEdit = page.topicId ? toProposedTopicEdit(chatConversation.chatTurns) : null
				if (page.topicId && proposedTopicEdit) {
					startEditingTopic(page.topicId, proposedTopicEdit)
				}
				// the kept files and the loaded flag are set last, so the panel opens in one finished state
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

		// leaving this topic discards any request in progress for it
		return () => {
			isCurrentTopic = false
		}
	}, [page.topicId, page.teamId, page.newTopic, setKeptAttachments])
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
	}
}
