import { router, usePathname } from "expo-router"
import { View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { useIsKeyboardVisible } from "@/hooks/useIsKeyboardVisible"
import { ChatPill } from "./ChatPanelWidget"
import { toChatHref } from "./chatNavigation"

/**
 * Places the chat launcher above each signed-in screen's safe area.
 */
export function AppChatPanel() {
	// keep typing and the full-screen conversation clear of the launcher
	const pathname = usePathname()
	const insets = useSafeAreaInsets()
	const isKeyboardVisible = useIsKeyboardVisible()
	if (isKeyboardVisible || pathname === "/chat" || pathname.endsWith("/chat") || pathname === "/storybook") {
		return null
	}

	// retain the Topic or Team context on its pages and notes
	const handleOpenChat = (): void => {
		router.push(toChatHref(pathname))
	}
	return (
		<View
			pointerEvents="box-none"
			style={{ position: "absolute", right: insets.right + 12, bottom: insets.bottom + 12 }}
		>
			<ChatPill onOpenChat={handleOpenChat} />
		</View>
	)
}
