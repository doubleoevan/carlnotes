import { ALL_USERNAME, CARL_USERNAME } from "@carlnotes/contracts/chatMentions"
import { PODCAST_EPISODE_SPEAKER_NAMES } from "@carlnotes/contracts/podcastEpisodes"

// the active username chat mention token behind the caret: an @ at a word start and whatever prefix follows it
const ACTIVE_CHAT_MENTION_PATTERN = /(^|[^\w@.-])@([\w-]*)$/

/**
 * Returns matching room usernames with Carl's username first.
 */
export function toChatMentionSuggestions(mentionQuery: string, memberUsernames: string[]): string[] {
	return [CARL_USERNAME, ...memberUsernames.filter((username) => username.toLowerCase() !== CARL_USERNAME)].filter(
		(username) => username.toLowerCase().startsWith(mentionQuery.toLowerCase()),
	)
}

/**
 * Reads the active chat mention before the caret.
 */
export function toActiveChatMention(messageStart: string): string | null {
	return messageStart.match(ACTIVE_CHAT_MENTION_PATTERN)?.[2] ?? null
}

/**
 * Inserts a selected username at the active chat mention.
 */
export function toInsertedChatMention({
	message,
	caret,
	username,
}: {
	message: string
	caret: number
	username: string
}): { message: string; caret: number } {
	// replace the active mention and preserve the text after the caret
	const start = message.slice(0, caret).replace(ACTIVE_CHAT_MENTION_PATTERN, `$1@${username} `)
	return { message: start + message.slice(caret), caret: start.length }
}

/**
 * Returns the display label for a chat mention.
 */
export function toMentionLabel(username: string): string {
	if (username === CARL_USERNAME) {
		return PODCAST_EPISODE_SPEAKER_NAMES.host
	}
	return username === ALL_USERNAME ? "@all" : username
}

/**
 * Swaps the current chat mention for the selected chat mention if there is one.
 */
export function toChangedMentionChatMessage(chatMessage: string, username: string, memberUsernames: string[]): string {
	return `@${username} ${toChatMessage(chatMessage, memberUsernames)}`
}

/**
 * Returns the chat message without its leading chat mention.
 */
export function toChatMessage(chatMessage: string, memberUsernames: string[]): string {
	// match the leading mention against the room's usernames
	const currentMentions = chatMessage.match(/^@([\w-]+)\s*/)
	const chatUsernames = [
		CARL_USERNAME,
		ALL_USERNAME,
		...memberUsernames.map((memberUsername) => memberUsername.toLowerCase()),
	]
	if (currentMentions && chatUsernames.includes((currentMentions[1] ?? "").toLowerCase())) {
		return chatMessage.slice(currentMentions[0].length)
	}
	return chatMessage
}
