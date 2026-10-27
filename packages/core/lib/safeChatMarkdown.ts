// the words that name the new-topic chat, which carl writes when he points a user at it, and the href they get
// once they are linked. a url fragment, which streamdown's harden plugin passes through and no page reads
export const NEW_TOPIC_CHAT_WORDS = "Give Carl a topic. You know the one."
export const NEW_TOPIC_CHAT_HREF = "#new-topic-chat"

/**
 * Links the invitation to the new-topic chat in Markdown.
 */
export function toNewTopicChatLinkedMarkdown(markdown: string): string {
	return markdown.replaceAll(NEW_TOPIC_CHAT_WORDS, `[${NEW_TOPIC_CHAT_WORDS}](${NEW_TOPIC_CHAT_HREF})`)
}

/**
 * Checks whether a chat link uses HTTP or HTTPS.
 */
export function isSafeHref(href: string | undefined): href is string {
	return typeof href === "string" && (href.startsWith("https://") || href.startsWith("http://"))
}
