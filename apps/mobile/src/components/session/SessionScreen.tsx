// the frame every session screen renders inside
import { Link } from "expo-router"
import type { ReactNode } from "react"
import { Pressable, ScrollView, Text, View } from "react-native"
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
					{/* the logo, the mug beside the name, centered as on the web, and a link home as the web's header logo is.
						the row reaches the 44-point touch target the mug alone falls short of */}
					<Link href="/" asChild>
						<Pressable
							className="mb-4 min-h-11 flex-row items-center justify-center gap-2 self-center"
							accessibilityRole="link"
							accessibilityLabel="CarlNotes home"
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
						</Pressable>
					</Link>
					{children}
				</ScrollView>
			</ClassNameSafeAreaView>
		</View>
	)
}
