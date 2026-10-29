import { CHAT_NAME, type ChatMention } from "@carlnotes/contracts/chat"
import { type ChatPillElements, ChatPill as SharedChatPill } from "@carlnotes/core/components/ChatPill"
import { useIsPodcastPlayerShown } from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { Coffee, X } from "lucide-react-native"
import type { ReactNode } from "react"
import { KeyboardAvoidingView, Platform, StatusBar, View } from "react-native"
import { useUniwind } from "uniwind"
import { CoffeeCup } from "@/components/branding/CoffeeCup"
import { ClassNameSafeAreaView } from "@/components/common/ClassNameSafeAreaView"
import { UpdateCountBadge } from "@/components/common/UpdateCountBadge"
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
 * Draws the shared chat pill with Nightshift's native controls, its unread chat mentions as the web's badge.
 */
export function ChatPill({ onOpenChat, chatMentions }: { onOpenChat: () => void; chatMentions: ChatMention[] }) {
	// the pill's own name reads the count, so the badge is decorative
	return (
		<SharedChatPill
			onOpenChat={onOpenChat}
			chatMentions={chatMentions}
			elements={CHAT_PILL_ELEMENTS}
			badge={
				<UpdateCountBadge
					chatMentions={chatMentions}
					isDecorative
					className="absolute -top-1.5 -right-1"
					countBadgeClassName="border border-border bg-card text-card-foreground text-xs"
				/>
			}
		/>
	)
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
