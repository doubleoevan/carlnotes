// shared chat confirmations and completion notices
export const CHAT_QUESTION_PLACEHOLDER = "Hand-crafted notes are richer…"
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
