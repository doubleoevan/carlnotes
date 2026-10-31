import { PURCHASE_COPY } from "@carlnotes/contracts/plans"
import {
	type ChatTopicLimitNoticeElements,
	ChatTopicLimitNotice as SharedChatTopicLimitNotice,
} from "@carlnotes/core/components/ChatTopicLimitNotice"
import type { PurchaseOffers } from "@carlnotes/core/lib/storefrontPurchaseRules"
import { PlansLink } from "@/components/account/PlansLink"
import { Text } from "@/components/primitives/text"

/**
 * Shows the line that replaces the new-topic chat's draft if the plan holds no more topics, with the plans link if the
 * store sells the user a plan.
 */
export function ChatTopicLimitNotice({
	topicLimit,
	canPurchase,
}: { topicLimit: number } & Pick<PurchaseOffers, "canPurchase">) {
	return (
		<SharedChatTopicLimitNotice
			topicLimit={topicLimit}
			elements={canPurchase ? PLANS_LINK_CHAT_TOPIC_LIMIT_ELEMENTS : CHAT_TOPIC_LIMIT_ELEMENTS}
		/>
	)
}

// the native paragraph, bordered above like the web's
const CHAT_TOPIC_LIMIT_ELEMENTS: ChatTopicLimitNoticeElements = {
	Text: ({ children }) => (
		<Text className="border-t border-border px-3 py-3 text-sm text-muted-foreground">{children}</Text>
	),
}

// the same paragraph with the plans link
const PLANS_LINK_CHAT_TOPIC_LIMIT_ELEMENTS: ChatTopicLimitNoticeElements = {
	...CHAT_TOPIC_LIMIT_ELEMENTS,
	PlansLink: () => <PlansLink label={PURCHASE_COPY.pickUpMoreCoffee} />,
}
