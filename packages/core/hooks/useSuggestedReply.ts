// the suggested reply's one rule for both apps: when an empty private chat composer shows a suggestion as its
// placeholder, which suggestion it is, and accepting it into the box without sending

import type { ChatPage } from "@carlnotes/client/chatClient"
import type { ChatKind } from "@carlnotes/contracts/chat"
import { useEffect, useRef, useState } from "react"
import { NEW_TOPIC_EXAMPLE_TOPICS } from "../lib/chatCopy"
import type { TopicChat } from "./useTopicChat"

// the private chats a suggestion shows in, as the server's chat events name them
type SuggestedReplyChatKind = Exclude<ChatKind, "room">

// where a suggestion came from: the new-topic chat's example topic, or the call after carl's reply
type SuggestedReplyOrigin = "example" | "reply"

// how the user accepted it: Right Arrow on the web, the accept button on both apps, or a swipe on mobile
export type SuggestedReplyAcceptMethod = "arrowKey" | "button" | "swipe"

// what the analytics count: a suggestion shown or accepted, with its chat, its origin, and how it was accepted, and never
// its text
export type SuggestedReplyEvent =
	| { event: "shown"; chatKind: SuggestedReplyChatKind; isTopicPost: boolean; origin: SuggestedReplyOrigin }
	| {
			event: "accepted"
			chatKind: SuggestedReplyChatKind
			isTopicPost: boolean
			origin: SuggestedReplyOrigin
			acceptMethod: SuggestedReplyAcceptMethod
	  }

// the conversation fields the rule reads
type SuggestedReplyChat = Pick<
	TopicChat,
	// the conversation and the composer's draft
	| "chatTurns"
	| "question"
	| "setQuestion"
	| "attachments"
	| "isStreaming"
	// the suggestion the stream sent, and the gates the load resolved
	| "receivedSuggestedReply"
	| "isSuggestedReplyOn"
	| "isLoaded"
	| "canChat"
	| "isSignupRequired"
	| "topicsRemaining"
>

// the page, its conversation, whether the composer is busy recording or in voice, and the app's adapters
export type UseSuggestedReplyOptions = {
	page: ChatPage
	topicChat: SuggestedReplyChat
	// a recording, a transcript on its way, or the voice composer
	isComposerBusy: boolean
	// the app's analytics, which never receive the text
	onSuggestedReplyEvent?: (suggestedReplyEvent: SuggestedReplyEvent) => void
	// the app's screen reader announcement, once for each suggestion
	onSuggestedReplyShown?: (suggestedReply: string) => void
	// which example topic an empty new-topic chat shows, random unless a test or a story says
	pickExampleTopic?: (exampleCount: number) => number
}

// the suggestion the composer shows, or null, and how it is accepted into the box
export type SuggestedReply = {
	suggestedReply: string | null
	accept: (acceptMethod: SuggestedReplyAcceptMethod) => void
}

// one suggestion the rule may show: its text, its origin, and the key it is counted and announced once by
type CurrentSuggestedReply = { text: string; origin: SuggestedReplyOrigin; key: string }

/**
 * Returns the suggestion an empty, idle private composer shows, and the accept that puts it in the box without sending.
 * A suggestion shows only with no question, no attachments, nothing streaming, no recording, and no voice composer, for
 * the latest chat turn of the account and conversation on screen. An empty new-topic chat shows an example topic.
 */
export function useSuggestedReply({
	page,
	topicChat,
	isComposerBusy,
	onSuggestedReplyEvent,
	onSuggestedReplyShown,
	pickExampleTopic = (exampleCount) => Math.floor(Math.random() * exampleCount),
}: UseSuggestedReplyOptions): SuggestedReply {
	// the example topic, picked once for each page
	const pageKey = toChatPageKey(page)
	const [exampleTopic, setExampleTopic] = useState(() => toExampleTopic(pickExampleTopic))
	const exampleTopicPageKeyRef = useRef(pageKey)
	if (exampleTopicPageKeyRef.current !== pageKey) {
		exampleTopicPageKeyRef.current = pageKey
		setExampleTopic(toExampleTopic(pickExampleTopic))
	}

	// the suggestion this conversation holds, and whether the box would show it now
	const currentSuggestedReply = toCurrentSuggestedReply({ page, topicChat, exampleTopic, pageKey })
	const isShown = currentSuggestedReply !== null && isComposerIdle(topicChat, isComposerBusy)
	const shownSuggestedReply = isShown ? currentSuggestedReply : null

	// count and announce each suggestion the first time it shows, never again when the box clears back to it
	const reportedKeysRef = useRef(new Set<string>())
	const chatKind = toSuggestedReplyChatKind(page)
	const isTopicPost = page.topicPost !== undefined
	useEffect(() => {
		if (!shownSuggestedReply || reportedKeysRef.current.has(shownSuggestedReply.key)) {
			return
		}
		// the first showing is counted with no text, and announced with its text
		reportedKeysRef.current.add(shownSuggestedReply.key)
		onSuggestedReplyEvent?.({ event: "shown", chatKind, isTopicPost, origin: shownSuggestedReply.origin })
		onSuggestedReplyShown?.(shownSuggestedReply.text)
	}, [shownSuggestedReply, chatKind, isTopicPost, onSuggestedReplyEvent, onSuggestedReplyShown])

	// accept the shown suggestion into the box. nothing is sent
	const accept = (acceptMethod: SuggestedReplyAcceptMethod): void => {
		if (!shownSuggestedReply) {
			return
		}
		// the box holds the text, and the accept is counted with no text
		topicChat.setQuestion(shownSuggestedReply.text)
		onSuggestedReplyEvent?.({
			event: "accepted",
			chatKind,
			isTopicPost,
			origin: shownSuggestedReply.origin,
			acceptMethod,
		})
	}
	return { suggestedReply: shownSuggestedReply?.text ?? null, accept }
}

// the key of the page's conversation
function toChatPageKey(page: ChatPage): string {
	if (page.newTopic) {
		return "newTopic"
	}
	return page.topicId !== undefined ? `topic:${page.topicId}:${page.topicPost?.id ?? ""}` : `team:${page.teamId}`
}

// one example topic from the list
function toExampleTopic(pickExampleTopic: (exampleCount: number) => number): string {
	const exampleCount = NEW_TOPIC_EXAMPLE_TOPICS.length
	const index = Math.min(Math.max(0, Math.floor(pickExampleTopic(exampleCount))), exampleCount - 1)
	return NEW_TOPIC_EXAMPLE_TOPICS[index] ?? NEW_TOPIC_EXAMPLE_TOPICS[0]
}

// the page, its conversation, the example topic, and the page's key
type ToCurrentSuggestedReplyOptions = {
	page: ChatPage
	topicChat: SuggestedReplyChat
	exampleTopic: string
	pageKey: string
}

// the suggestion the conversation holds: the latest chat turn's, in the account and conversation it arrived in, or an
// empty new-topic chat's example while the plan holds another topic. none while the conversation turns them off
function toCurrentSuggestedReply({
	page,
	topicChat,
	exampleTopic,
	pageKey,
}: ToCurrentSuggestedReplyOptions): CurrentSuggestedReply | null {
	if (!topicChat.isLoaded || !topicChat.isSuggestedReplyOn) {
		return null
	}

	// the reply's suggestion, for the chat turn it followed
	const { receivedSuggestedReply, chatTurns } = topicChat
	const latestChatTurnKey = chatTurns.at(-1)?.spokenAnswerKey
	if (receivedSuggestedReply) {
		const isLatest = receivedSuggestedReply.spokenAnswerKey === latestChatTurnKey
		return isLatest && receivedSuggestedReply.isCurrentChat()
			? { text: receivedSuggestedReply.text, origin: "reply", key: `reply:${receivedSuggestedReply.spokenAnswerKey}` }
			: null
	}

	// an empty new-topic chat's example, while the plan holds another topic
	const isExampleTopicShown = page.newTopic === true && chatTurns.length === 0 && topicChat.topicsRemaining !== 0
	return isExampleTopicShown
		? { text: exampleTopic, origin: "example", key: `example:${pageKey}:${exampleTopic}` }
		: null
}

// whether the composer is empty and idle: no question, no attachments, nothing streaming, nothing recording, and a
// signed-in user who may chat
function isComposerIdle(topicChat: SuggestedReplyChat, isComposerBusy: boolean): boolean {
	const isEmpty = topicChat.question === "" && topicChat.attachments.length === 0
	const isIdle = !topicChat.isStreaming && !isComposerBusy
	return isEmpty && isIdle && topicChat.canChat && !topicChat.isSignupRequired
}

// the chat a page's suggestion is counted under, a Topic Post's chat being its topic's
function toSuggestedReplyChatKind(page: ChatPage): SuggestedReplyChatKind {
	if (page.newTopic) {
		return "new_topic"
	}
	return page.topicId !== undefined ? "topic" : "team"
}

/**
 * Returns the analytics event name and properties of a suggested reply event, without its text: its chat, its origin,
 * and how it was accepted.
 */
export function toSuggestedReplyCapture(suggestedReplyEvent: SuggestedReplyEvent): {
	name: "chat_suggested_reply_shown" | "chat_suggested_reply_accepted"
	properties: Record<string, string | boolean>
} {
	// a shown suggestion names its chat and its origin
	const { chatKind, isTopicPost, origin } = suggestedReplyEvent
	if (suggestedReplyEvent.event === "shown") {
		return { name: "chat_suggested_reply_shown", properties: { chatKind, isTopicPost, origin } }
	}
	return {
		name: "chat_suggested_reply_accepted",
		properties: { chatKind, isTopicPost, origin, acceptMethod: suggestedReplyEvent.acceptMethod },
	}
}
