import { NEW_TOPIC_CHAT_WORDS } from "./safeChatMarkdown"

// shared chat confirmations and completion notices
export const CHAT_QUESTION_PLACEHOLDER = "Hand-crafted notes are richer…"
// what the panel asks a visitor, and the composer it shows them disabled
// the new-topic chat's words: its name, the empty question box's line for a first topic and for the next, and what
// an empty conversation opens with
export const NEW_TOPIC_CHAT_COPY = {
	name: NEW_TOPIC_CHAT_WORDS,
	firstTopicPlaceholder: "Let's make your first topic. You know the one.",
	placeholder: "Let's make a topic. You know the one.",
	openingLine: "Tell me what you want to keep up with. I'll shape it into a topic.",
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
