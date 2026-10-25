// the frame every session screen renders inside
import type { ReactNode } from "react"
import { ScrollView, Text, View } from "react-native"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { ClassNameSafeAreaView } from "@/components/common/ClassNameSafeAreaView"
import { MAX_FONT_SCALE } from "@/hooks/useFontScaledSize"
import { toTypeRoleStyle } from "@/typeRoleStyles"

// the web's session page column: 24rem wide at most, centered across the screen and down it, and growing to the
// screen's height so a short form sits in the middle
const SESSION_COLUMN_CLASS = "w-full max-w-sm grow justify-center gap-4 self-center px-4 py-12"

/**
 * The frame every session screen renders inside, with the safe area, the scroll, and the logo, in the web's centered
 * column.
 */
export function SessionScreen({ children }: { children: ReactNode }) {
	return (
		<View className="flex-1 bg-background">
			<ClassNameSafeAreaView className="flex-1">
				<ScrollView contentContainerClassName={SESSION_COLUMN_CLASS} keyboardShouldPersistTaps="handled">
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
			</ClassNameSafeAreaView>
		</View>
	)
}
