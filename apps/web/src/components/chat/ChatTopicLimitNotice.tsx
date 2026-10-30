import { PLANS_PATH, PURCHASE_COPY } from "@carlnotes/contracts/plans"
import {
	type ChatTopicLimitNoticeElements,
	ChatTopicLimitNotice as SharedChatTopicLimitNotice,
} from "@carlnotes/core/components/ChatTopicLimitNotice"
import { AnchorLink } from "@/components/common/AnchorLink"

// the line the new-topic chat shows in place of the wizard when the plan holds no more topics
export function ChatTopicLimitNotice({ topicLimit }: { topicLimit: number }) {
	return <SharedChatTopicLimitNotice topicLimit={topicLimit} elements={CHAT_TOPIC_LIMIT_ELEMENTS} />
}

// the browser paragraph and the plans link
const CHAT_TOPIC_LIMIT_ELEMENTS: ChatTopicLimitNoticeElements = {
	Text: ({ children }) => (
		<p className="text-muted-foreground border-t px-3 py-3 text-sm whitespace-pre-line">{children}</p>
	),
	PlansLink: () => (
		<AnchorLink href={PLANS_PATH} className="sentence-link">
			{PURCHASE_COPY.pickUpMoreCoffee}
		</AnchorLink>
	),
}
