// the screen a Tasting Note or a Topic Post is edited on: the header over the editor in the keyboard-safe space
import { useIsPodcastPlayerShown } from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { cn } from "@carlnotes/nightshift/classNames"
import { type ReactNode, useState } from "react"
import { KeyboardAvoidingView, View } from "react-native"
import { ClassNameSafeAreaView } from "@/components/common/ClassNameSafeAreaView"
import { Header } from "@/components/layout/Header"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"
import { useIsKeyboardVisible } from "@/hooks/useIsKeyboardVisible"

/**
 * Renders the header, which an open keyboard hides, over the content in the keyboard-safe space, with room for the
 * chat launcher below the content while the keyboard is closed.
 */
export function NoteEditorScreen({ contentClassName, children }: { contentClassName?: string; children: ReactNode }) {
	// the header's height the keyboard offset leaves out, and the launcher's room
	const [headerHeight, setHeaderHeight] = useState(0)
	const isKeyboardVisible = useIsKeyboardVisible()
	const isPodcastPlayerShown = useIsPodcastPlayerShown()
	const chatLauncherClearance = useFontScaledSize(44) + 24
	return (
		<View className="flex-1 bg-background">
			<View onLayout={(event) => setHeaderHeight(event.nativeEvent.layout.height)}>
				{!isKeyboardVisible && <Header />}
			</View>
			<ClassNameSafeAreaView
				edges={isKeyboardVisible ? ["top", "left", "right", "bottom"] : ["left", "right", "bottom"]}
				className="w-full max-w-3xl flex-1 self-center"
			>
				<KeyboardAvoidingView
					className="flex-1"
					enabled={!isPodcastPlayerShown}
					keyboardVerticalOffset={headerHeight}
					behavior="padding"
				>
					{/* reserve launcher space inside the keyboard-adjusted viewport */}
					<View
						className={cn("flex-1", contentClassName)}
						style={{ paddingBottom: isKeyboardVisible ? 0 : chatLauncherClearance }}
					>
						{children}
					</View>
				</KeyboardAvoidingView>
			</ClassNameSafeAreaView>
		</View>
	)
}
