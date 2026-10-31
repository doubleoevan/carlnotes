import type { ChatRejection } from "@carlnotes/client/chatClient"
import {
	type ChatRejectionElements,
	ChatRejectionNotice as SharedChatRejectionNotice,
} from "@carlnotes/core/components/ChatRejectionNotice"
import { usePurchaseOffers } from "@carlnotes/core/stores/purchaseOffersStore"
import { RotateCcw } from "lucide-react-native"
import { Children } from "react"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { ChatBudgetNotice } from "./ChatBudgetNotice"

/**
 * Shows shared chat rejection wording and native retry controls, with the spent budget's plans link where the store
 * sells the user a plan.
 */
export function ChatRejectionNotice({ rejection, onRetry }: { rejection: ChatRejection; onRetry?: () => void }) {
	// the elements with the plans link where the store sells the user a plan
	const { canPurchase } = usePurchaseOffers()
	return (
		<SharedChatRejectionNotice
			rejection={rejection}
			onRetry={onRetry}
			elements={canPurchase ? PLANS_LINK_CHAT_REJECTION_ELEMENTS : CHAT_REJECTION_ELEMENTS}
		/>
	)
}

// native elements for the shared chat rejection
const CHAT_REJECTION_ELEMENTS: ChatRejectionElements = {
	Text: ({ children }) => (
		<View className="flex-row flex-wrap items-center">
			{Children.map(children, (child) =>
				typeof child === "string" ? <Text className="text-sm text-muted-foreground">{child}</Text> : child,
			)}
		</View>
	),
	Retry: ({ onRetry }) => (
		<Button variant="ghost" accessibilityLabel="Try again" onPress={onRetry}>
			<Text className="text-link">Try again?</Text>
			<Icon as={RotateCcw} className="size-3.5 text-link" />
		</Button>
	),
	Budget: () => <ChatBudgetNotice canPurchase={false} />,
}

// the same elements with the spent budget's plans link
const PLANS_LINK_CHAT_REJECTION_ELEMENTS: ChatRejectionElements = {
	...CHAT_REJECTION_ELEMENTS,
	Budget: () => <ChatBudgetNotice canPurchase />,
}
