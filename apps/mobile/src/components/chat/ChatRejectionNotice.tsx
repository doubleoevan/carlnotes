import type { ChatRejection } from "@carlnotes/client/chatClient"
import {
	type ChatRejectionElements,
	ChatRejectionNotice as SharedChatRejectionNotice,
} from "@carlnotes/core/components/ChatRejectionNotice"
import { CHAT_REJECTION_COPY } from "@carlnotes/core/lib/chatRejectionCopy"
import { RotateCcw } from "lucide-react-native"
import { Children } from "react"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

/**
 * Shows shared chat rejection wording and native retry controls.
 */
export function ChatRejectionNotice({ rejection, onRetry }: { rejection: ChatRejection; onRetry?: () => void }) {
	return <SharedChatRejectionNotice rejection={rejection} onRetry={onRetry} elements={CHAT_REJECTION_ELEMENTS} />
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
	Budget: () => <Text className="text-sm text-muted-foreground">{CHAT_REJECTION_COPY.budget}</Text>,
}
