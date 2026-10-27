import type { ChatRoomMessage } from "@carlnotes/contracts/chat"
import { ALL_USERNAME, CARL_USERNAME, isModelChatMessage, toChatMentions } from "@carlnotes/contracts/chatMentions"

// the draft, the members it may mention, the reply chat message selected, and whether that reply was auto-selected
type ToReplyUserOptions = {
	chatMessage: string
	memberUsernames: string[]
	replyTo: ChatRoomMessage | null
	isAutoReply: boolean
}

/**
 * Returns the reply recipient from the selected message and chat mentions.
 */
export function toReplyUser({ chatMessage, memberUsernames, replyTo, isAutoReply }: ToReplyUserOptions): {
	hasMention: boolean
	replyUser: string
} {
	// prefer an explicit mention over an automatic reply
	const mentionedUser = toChatMentions(chatMessage, [CARL_USERNAME, ALL_USERNAME, ...memberUsernames])[0] ?? null
	const hasMention = mentionedUser !== null && (replyTo === null || isAutoReply)
	if (hasMention) {
		return { hasMention, replyUser: mentionedUser }
	}

	// the reply chat message's author, or everyone with no reply selected
	if (replyTo === null) {
		return { hasMention, replyUser: ALL_USERNAME }
	}
	return { hasMention, replyUser: isModelChatMessage(replyTo) ? CARL_USERNAME : replyTo.authorUsername }
}

/**
 * Returns the composer placeholder for the selected recipient.
 */
export function toComposerPlaceholder(replyUsername: string): string {
	return `@${replyUsername}, penny for your thoughts…`
}
