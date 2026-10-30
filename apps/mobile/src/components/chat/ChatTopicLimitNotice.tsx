import {
	type ChatTopicLimitNoticeElements,
	ChatTopicLimitNotice as SharedChatTopicLimitNotice,
} from "@carlnotes/core/components/ChatTopicLimitNotice"
import { Text } from "@/components/primitives/text"

/**
 * The line the new-topic chat shows in place of the draft when the plan holds no more topics, with no plans link,
 * since the app links to no pricing.
 */
export function ChatTopicLimitNotice({ topicLimit }: { topicLimit: number }) {
	return <SharedChatTopicLimitNotice topicLimit={topicLimit} elements={CHAT_TOPIC_LIMIT_ELEMENTS} />
}

// the native paragraph, bordered above like the web's
const CHAT_TOPIC_LIMIT_ELEMENTS: ChatTopicLimitNoticeElements = {
	Text: ({ children }) => (
		<Text className="border-t border-border px-3 py-3 text-sm text-muted-foreground">{children}</Text>
	),
}
