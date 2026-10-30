import type { ComponentType, ReactNode } from "react"
import { toChatTopicLimitCopy } from "../lib/chatRejectionCopy"

export type ChatTopicLimitNoticeElements = {
	Text: ComponentType<{ children: ReactNode }>
	PlansLink?: ComponentType
}

/**
 * The line the new-topic chat shows in place of the draft if the plan holds no more topics. An app that offers plans
 * passes its plans link, and an app that does not tells the user to drop a topic instead.
 */
export function ChatTopicLimitNotice({
	topicLimit,
	elements: { Text, PlansLink },
}: {
	topicLimit: number
	elements: ChatTopicLimitNoticeElements
}) {
	if (!PlansLink) {
		return <Text>{`${toChatTopicLimitCopy(topicLimit)}\nDrop an existing topic from its page to make room.`}</Text>
	}
	return (
		<Text>
			{`${toChatTopicLimitCopy(topicLimit)}\n`}
			<PlansLink />
			{" for more, or drop an existing topic from its page."}
		</Text>
	)
}
