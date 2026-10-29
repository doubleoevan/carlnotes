import { authClient } from "@carlnotes/client/authClient"
import { CHAT_NAME } from "@carlnotes/contracts/chat"
import { VISITOR_CHAT_COPY } from "@carlnotes/core/lib/chatCopy"
import { useAllChatMentions } from "@carlnotes/core/stores/chatRoomStore"
import { router, usePathname } from "expo-router"
import { useState } from "react"
import { View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { useIsKeyboardVisible } from "@/hooks/useIsKeyboardVisible"
import { openSessionScreen } from "@/sessionReturnPath"
import { ChatPill } from "./ChatPanelWidget"
import { toChatHref } from "./chatNavigation"

/**
 * Places the chat launcher above each screen's safe area. A user's opens the conversation, and a visitor's opens the
 * web's sign-up panel.
 */
export function AppChatPanel() {
	// keep typing and the full-screen conversation clear of the launcher
	const pathname = usePathname()
	const insets = useSafeAreaInsets()
	const isKeyboardVisible = useIsKeyboardVisible()
	const { data: session } = authClient().useSession()
	// every chat mention for a chat that the user hasn't opened, and the visitor's sign-up sheet
	const chatMentions = useAllChatMentions()
	const [isNoConversationSheetOpen, setIsNoConversationSheetOpen] = useState(false)
	if (isKeyboardVisible || pathname === "/chat" || pathname.endsWith("/chat") || pathname === "/storybook") {
		return null
	}

	// retain the Topic or Team context on its pages and notes. a visitor is asked for an account first
	const handleOpenChat = (): void => {
		if (!session) {
			setIsNoConversationSheetOpen(true)
			return
		}
		router.push(toChatHref(pathname))
	}
	return (
		<View
			pointerEvents="box-none"
			style={{ position: "absolute", right: insets.right + 12, bottom: insets.bottom + 12 }}
		>
			<ChatPill onOpenChat={handleOpenChat} chatMentions={chatMentions} />
			{isNoConversationSheetOpen ? (
				<NoConversationSheet
					onSignup={() => openSessionScreen({ screen: "/sign-up", returnPath: pathname, cta: "chat" })}
					onClose={() => setIsNoConversationSheetOpen(false)}
				/>
			) : null}
		</View>
	)
}

// the web's panel where a visitor has no conversation to open, which asks for an account, as a sheet
function NoConversationSheet({ onSignup, onClose }: { onSignup: () => void; onClose: () => void }) {
	return (
		<Sheet title={CHAT_NAME} onClose={onClose}>
			<View className="gap-4 px-2 pb-2">
				<Text className="font-display text-lg">{VISITOR_CHAT_COPY.actionLine}</Text>
				<Text className="rounded-md border border-input px-3 py-2 text-sm text-muted-foreground">
					{VISITOR_CHAT_COPY.placeholder}
				</Text>
				<Button
					accessibilityLabel="Sign up"
					className="self-start"
					onPress={() => {
						onClose()
						onSignup()
					}}
				>
					<Text>Sign up</Text>
				</Button>
			</View>
		</Sheet>
	)
}
