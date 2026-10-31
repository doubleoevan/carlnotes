import type { ChatRejection } from "@carlnotes/client/chatClient"
import {
	CHAT_ROOM_ATTACHMENT_LIMIT,
	type ChatRoomAttachmentRejection,
	SPENT_BUDGET_LINE,
} from "@carlnotes/contracts/chat"

/** The sentence for each chat rejection. */
export const CHAT_REJECTION_COPY: Record<ChatRejection, string> = {
	budget: SPENT_BUDGET_LINE,
	rateLimited: "Carl needs a minute to catch up. Ask again shortly.",
	forbidden: "Carl can't talk about that.",
	failed: "Carl lost his train of thought.",
	attachmentTooLarge: "That file is too large for Carl to read. Try a smaller one.",
	attachmentBusy: "Carl is busy reading other files. Send that file again in a moment.",
	attachmentUnreadable: "Carl couldn't read that file.",
}

// what a recording says: the microphone request was rejected, no speech was recorded or transcribed, and the chat
// failed
export const MICROPHONE_REJECTED_NOTICE = "Carl can't hear you. Type it, he reads fast."
export const NO_SPEECH_NOTICE = "Carl didn't catch that. Please try again."
export const CHAT_FAILED_NOTICE = `${CHAT_REJECTION_COPY.failed} Please try again.`

/** The room's attachment rejection copy, shared with its existing web notice. */
export const CHAT_ROOM_REJECTION_COPY: Record<ChatRoomAttachmentRejection, string> = {
	attachmentLimitReached: `That would pass the ${CHAT_ROOM_ATTACHMENT_LIMIT} files you can share in this chat room. Delete some to share more.`,
	attachmentRejected: "Those files didn't post. One of them may be unreadable.",
	attachmentTooLarge: "Those files didn't post. One of them is too large to read. Share a smaller one.",
	attachmentBusy: "Those files didn't post. Carl is busy reading other files, so share them again in a moment.",
}

/**
 * Returns the shared explanation for an exhausted topic allowance.
 */
export function toChatTopicLimitCopy(topicLimit: number): string {
	return `Your plan has ${topicLimit} topics, and you used them all.`
}
