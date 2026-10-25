// the frame every session screen renders inside
import type { ReactNode } from "react"
import { ScrollView, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { MAX_FONT_SCALE } from "@/hooks/useFontScaledSize"
import { toTypeRoleStyle } from "@/typeRoleStyles"

/**
 * The frame every session screen renders inside, with the safe area, the scroll, and the logo.
 */
export function SessionScreen({ children }: { children: ReactNode }) {
	return (
		<View className="flex-1 bg-background">
			<SafeAreaView className="flex-1">
				<ScrollView contentContainerClassName="gap-4 p-6" keyboardShouldPersistTaps="handled">
					{/* the logo, the mug beside the name, centered as on the web */}
					<View
						className="mb-4 flex-row items-center justify-center gap-2"
						accessible
						accessibilityRole="header"
						accessibilityLabel="CarlNotes"
					>
						{/* nudged up to optically center the cup on the name, as the web nudges it */}
						<View className="-translate-y-0.75">
							<CoffeeMug className="text-primary" size={40} />
						</View>
						{/* the name, which stops growing with the system text size where the mug does */}
						<Text
							style={toTypeRoleStyle("logo")}
							className="text-foreground"
							numberOfLines={1}
							maxFontSizeMultiplier={MAX_FONT_SCALE}
						>
							CarlNotes
						</Text>
					</View>
					{children}
				</ScrollView>
			</SafeAreaView>
		</View>
	)
}
