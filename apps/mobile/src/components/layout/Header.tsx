import { TOPIC_TUTORIAL_WATCH_LABEL } from "@carlnotes/core/lib/topicTutorialVideo"
import type { ComponentRef } from "react"
import { useRef, useState } from "react"
import { type GestureResponderEvent, Text, View } from "react-native"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ClassNameSafeAreaView } from "@/components/common/ClassNameSafeAreaView"
import { Button } from "@/components/primitives/button"
import { TopicTutorialVideoDialog, TopicTutorialVideoIcon } from "@/components/topic/TopicTutorialVideoDialog"
import { MAX_FONT_SCALE } from "@/hooks/useFontScaledSize"
import { useHomeLink } from "@/providers/SearchBarProvider"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { UserMenu } from "./UserMenu"

// navigation remains with the screen that supplies the header
export type HeaderProps = { isHome?: boolean; isReheating?: boolean; onReheat?: () => void }

/**
 * Shows the compact web brand and tutorial above the native reading screens.
 */
export function Header({ isHome = false, isReheating = false, onReheat }: HeaderProps) {
	// keep each tutorial opening in its own playback lifetime
	const [isTutorialOpen, setIsTutorialOpen] = useState(false)
	const tutorialTriggerRef = useRef<ComponentRef<typeof View>>(null)
	const homeLink = useHomeLink()
	const handleHomePress = (event: GestureResponderEvent): void => {
		homeLink.onPress()
		if (!isHome || homeLink.href !== "/") {
			return
		}
		event.preventDefault()
		onReheat?.()
	}
	return (
		<ClassNameSafeAreaView edges={["top", "left", "right"]} className="bg-hero">
			<View className="w-full max-w-3xl self-center px-4 pt-3 pb-6">
				<View className="flex-row flex-wrap items-center gap-2">
					{/* return to search before home, and reheat when already home */}
					<AnchorLink
						href={homeLink.href}
						shouldDismissTo={homeLink.href === "/search"}
						accessibilityLabel={homeLink.href === "/search" ? "CarlNotes search" : "CarlNotes home"}
						accessibilityState={{ busy: isReheating }}
						onPress={handleHomePress}
						className="min-h-12 flex-row items-center gap-2 rounded-md active:opacity-75"
					>
						<CoffeeMug className="text-hero-accent -translate-y-0.5" size={40} />
						<Text
							style={toTypeRoleStyle("logo")}
							maxFontSizeMultiplier={MAX_FONT_SCALE}
							className="text-hero-foreground"
						>
							CarlNotes
						</Text>
					</AnchorLink>
					{/* the same YouTube mark as the compact web header */}
					<Button
						ref={tutorialTriggerRef}
						variant="ghost"
						accessibilityLabel={TOPIC_TUTORIAL_WATCH_LABEL}
						onPress={() => setIsTutorialOpen(true)}
					>
						<TopicTutorialVideoIcon size={28} />
					</Button>
					<UserMenu />
				</View>
			</View>
			{isTutorialOpen ? (
				<TopicTutorialVideoDialog
					opener="mobile-header"
					triggerRef={tutorialTriggerRef}
					onClose={() => setIsTutorialOpen(false)}
				/>
			) : null}
		</ClassNameSafeAreaView>
	)
}
