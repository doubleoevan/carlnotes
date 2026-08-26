// the chat mention parser for the chat room composer and the chat room's notifications
import { toNormalizedUsername } from "./usernames"

// the username that starts carl's turn. reserved, so no account can hold it
export const CARL_USERNAME = "carl"

// the username that addresses the whole room. reserved too. it starts carl's turn as well as notifying everyone
export const ALL_USERNAME = "all"

/**
 * Whether a chat message is Carl's. A closed account's messages also have no author reference while
 * keeping the name they were written under, so the recorded name is what tells the two apart.
 */
export function isCarlMessage(message: { authorUserId: string | null; authorUsername: string }): boolean {
	return message.authorUserId === null && message.authorUsername === "Carl"
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
export function hasCarlMention(message: string): boolean {
	return toChatMentions(message, [CARL_USERNAME]).length > 0
}

/**
 * Whether the chat message addresses the whole room with @all.
 */
export function hasAllMention(message: string): boolean {
	return toChatMentions(message, [ALL_USERNAME]).length > 0
}

/**
 * The members a chat message notifies: everyone on @all, otherwise the named members. Carl is never
 * among them, and neither is the author, who is dropped by name below. A carl mention is answered
 * instead, which hasCarlMention decides.
 */
export function toMentionedUserIds(
	message: string,
	members: { userId: string; username: string }[],
	authorUserId: string,
): string[] {
	// @all reaches every member without naming anyone
	const usernames = members.map((member) => member.username)
	const mentionedUsernames = hasAllMention(message) ? usernames : toChatMentions(message, usernames)

	// each mentioned name resolves back to its member, with the author dropped
	return mentionedUsernames.flatMap((username) => {
		const mentionedMember = members.find((member) => member.username === username)
		return mentionedMember && mentionedMember.userId !== authorUserId ? [mentionedMember.userId] : []
	})
}
