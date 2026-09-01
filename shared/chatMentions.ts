// the chat mention parser for the chat room composer and the chat room's notifications
import { toNormalizedUsername } from "./usernames"

// the username that starts carl's chat turn. reserved, so no account can hold it
export const CARL_USERNAME = "carl"

// the username that addresses the whole chat room. reserved too. it starts carl's chat turn as well as notifying everyone
export const ALL_USERNAME = "all"

/**
 * Whether a chat message is Carl's. A closed account's chat messages also have no author reference while
 * keeping the name they were written under, so the recorded name is what tells the two apart.
 */
export function isModelChatMessage(chatMessage: { authorUserId: string | null; authorUsername: string }): boolean {
	return chatMessage.authorUserId === null && chatMessage.authorUsername === "Carl"
}

// a username token after an @: the same characters a username may contain
const CHAT_MENTION_PATTERN = /(^|[^\w@.-])@([a-zA-Z0-9_-]+)/g

/**
 * The known usernames a chat message can mention, deduped, in the order they appear. An @ inside a longer token,
 * like an email address or a doubled @@, is not a chat mention, and an unknown username mentions nobody.
 */
export function toChatMentions(content: string, knownUsernames: string[]): string[] {
	// known usernames mapped to their normalized form, the way the username namespace compares them
	const usernamesByNormalizedUsername = new Map(
		knownUsernames.map((username) => [toNormalizedUsername(username), username]),
	)

	// each match keeps its first appearance and drops unknown usernames
	const mentionedUsernames: string[] = []
	for (const mention of content.matchAll(CHAT_MENTION_PATTERN)) {
		// dedupe on first known username appearance
		const knownUsername = usernamesByNormalizedUsername.get(toNormalizedUsername(mention[2] ?? ""))
		if (knownUsername && !mentionedUsernames.includes(knownUsername)) {
			mentionedUsernames.push(knownUsername)
		}
	}
	return mentionedUsernames
}

/**
 * Whether the chat message addresses Carl by chat mention.
 */
export function hasModelMention(chatMessage: string): boolean {
	return toChatMentions(chatMessage, [CARL_USERNAME]).length > 0
}

/**
 * Whether the chat message addresses the whole chat room with @all.
 */
export function hasAllMention(chatMessage: string): boolean {
	return toChatMentions(chatMessage, [ALL_USERNAME]).length > 0
}

/**
 * The members a chat message notifies: everyone on @all, otherwise the named members. Carl is never
 * among them, and neither is the author, who is dropped by name below. A carl chat mention is answered
 * instead, which hasModelMention decides.
 */
export function toMentionedUserIds(
	chatMessage: string,
	members: { userId: string; username: string }[],
	authorUserId: string,
): string[] {
	// @all reaches every member without naming anyone
	const usernames = members.map((member) => member.username)
	const mentionedUsernames = hasAllMention(chatMessage) ? usernames : toChatMentions(chatMessage, usernames)

	// each mentioned name resolves back to its member, with the author dropped
	return mentionedUsernames.flatMap((username) => {
		const mentionedMember = members.find((member) => member.username === username)
		return mentionedMember && mentionedMember.userId !== authorUserId ? [mentionedMember.userId] : []
	})
}
