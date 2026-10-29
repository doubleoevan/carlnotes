import { CHAT_NAME } from "@carlnotes/contracts/chat"
import { type ChatPillElements, ChatPill as SharedChatPill } from "@carlnotes/core/components/ChatPill"
import { useIsPodcastPlayerShown } from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { Coffee, X } from "lucide-react-native"
import type { ReactNode } from "react"
import { KeyboardAvoidingView, Platform, StatusBar, View } from "react-native"
import { useUniwind } from "uniwind"
import { CoffeeCup } from "@/components/branding/CoffeeCup"
import { ClassNameSafeAreaView } from "@/components/common/ClassNameSafeAreaView"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

/**
 * Frames a native conversation above the keyboard and device safe areas.
 */
export function ChatPanelWidget({ children, onClose }: { children: ReactNode; onClose: () => void }) {
	// let the root reserve keyboard space for the conversation and its loaded podcast together
	const { theme } = useUniwind()
	const isPodcastPlayerShown = useIsPodcastPlayerShown()
	return (
		<ClassNameSafeAreaView className="w-full flex-1 bg-card">
			<StatusBar barStyle={theme === "dark" ? "light-content" : "dark-content"} />
			<KeyboardAvoidingView
				className="flex-1"
				enabled={!isPodcastPlayerShown}
				behavior={Platform.OS === "ios" ? "padding" : "height"}
			>
				{/* conversation heading */}
				<View className="flex-row items-center justify-between gap-2 px-3 pt-2">
					<View className="flex-row items-center gap-2">
						<Icon as={Coffee} className="size-5 text-primary" />
						<Text accessibilityRole="header" className="font-display text-xl">
							{CHAT_NAME}
						</Text>
					</View>
					<Button variant="ghost" size="icon" accessibilityLabel={`Close ${CHAT_NAME}`} onPress={onClose}>
						<Icon as={X} className="size-5" />
					</Button>
				</View>
				{children}
			</KeyboardAvoidingView>
		</ClassNameSafeAreaView>
	)
}

/**
 * Draws the shared chat pill with Nightshift's native controls.
 */
export function ChatPill({ onOpenChat }: { onOpenChat: () => void }) {
	return <SharedChatPill onOpenChat={onOpenChat} elements={CHAT_PILL_ELEMENTS} />
}

// the native button grows for larger text and keeps the platform's minimum touch target
const CHAT_PILL_ELEMENTS: ChatPillElements = {
	Button: ({ children, onOpenChat, label }) => (
		<Button
			accessibilityLabel={label}
			onPress={onOpenChat}
			className="min-h-11 gap-2 rounded-full border-0 py-2.5 pr-4 pl-3 shadow-raised"
		>
			{children}
		</Button>
	),
	Label: ({ children }) => <Text className="font-display text-sm font-normal">{children}</Text>,
	CoffeeCup: () => <CoffeeCup className="text-primary-foreground" />,
}
