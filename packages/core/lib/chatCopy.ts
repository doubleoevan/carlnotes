import type { ChatPage } from "@carlnotes/client/chatClient"
import { NEW_TOPIC_CHAT_WORDS } from "./safeChatMarkdown"

// shared chat confirmations and completion notices
export const CHAT_QUESTION_PLACEHOLDER = "Hand-crafted notes are richer…"
// the empty question box's line in a Topic's private chat that asks about a Topic Post
export const TOPIC_POST_CHAT_PLACEHOLDER = "Ask me for a hot take on this post"
// what the panel asks a visitor, and the composer it shows them disabled
// the new-topic chat's words: its name, the empty question box's line for a first topic and for the next, and what
// an empty conversation opens with
export const NEW_TOPIC_CHAT_COPY = {
	name: NEW_TOPIC_CHAT_WORDS,
	firstTopicPlaceholder: "Let's make your first topic. You know the one.",
	placeholder: "Let's make a topic. You know the one.",
	openingLine: "Tell me what you want to keep up with. I'll shape it into a topic.",
}

/**
 * Returns the empty question box's line in a private conversation: the Topic Post chat's while the chat asks about a
 * Topic Post, the new-topic chat's for a first or a next topic, and the private chat's in every other.
 */
export function toPrivateChatPlaceholder(page: ChatPage, isFirstTopic: boolean): string {
	if (page.topicPost) {
		return TOPIC_POST_CHAT_PLACEHOLDER
	}

	// the private chat's line, or the new-topic chat's
	if (!page.newTopic) {
		return CHAT_QUESTION_PLACEHOLDER
	}
	return isFirstTopic ? NEW_TOPIC_CHAT_COPY.firstTopicPlaceholder : NEW_TOPIC_CHAT_COPY.placeholder
}

// what a private conversation is called while the name of what it is about is not known
const PRIVATE_CHAT_NAME = "Private chat"

// the names of what a private conversation may be about, each absent or empty while it is not known
type PrivateChatSubject = { topicPostTitle?: string | null; topicName?: string | null; teamName?: string | null }

/**
 * Labels a private conversation by what it is about: the Topic Post it asks about, else its Topic, else its team. It
 * reads Private chat alone while none of their names is known.
 */
export function toPrivateChatLabel({ topicPostTitle, topicName, teamName }: PrivateChatSubject = {}): string {
	const subjectName = topicPostTitle || topicName || teamName
	return subjectName ? `${PRIVATE_CHAT_NAME} about ${subjectName}` : PRIVATE_CHAT_NAME
}

export const VISITOR_CHAT_COPY = {
	actionLine: "Sign up to begin the conversation",
	placeholder: "Carl is waiting for your topic…",
} as const
export const CLEAR_CHAT_COPY = {
	title: "Clear this chat?",
	confirm: "Clear it",
	cancel: "Keep it",
	private: "Carl forgets this whole conversation.",
	room: "This clears the whole conversation for every member of the team, and the attachment files are deleted too.",
	succeeded: "Chat cleared.",
	failed: "That chat could not be cleared.",
} as const
export const DELETE_CHAT_MESSAGE_COPY = {
	title: "Delete this message?",
	description: "This removes the message and its attachments for everyone in this chat.",
	confirm: "Delete message",
	cancel: "Keep it",
	succeeded: "Message deleted.",
	failed: "That message could not be deleted.",
} as const

/**
 * Invites a member into an empty room using its Topic or Team name.
 */
export function toEmptyChatRoomCopy(name: string): string {
	return `Join the conversation, or ask @carl for a hot take on ${name || "this chat"}.`
}

// the quote of a reply whose message the member cannot see, and the report action's label
export const HIDDEN_QUOTE_TEXT = "a hidden message"
export const REPORT_CHAT_MESSAGE_LABEL = "Report message"

/**
 * Returns the label a reported message's dialog shows for its subject.
 */
export function toReportedChatMessageLabel(authorUsername: string): string {
	return `a message from ${authorUsername}`
}
