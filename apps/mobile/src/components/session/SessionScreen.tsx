// the frame every session screen renders inside
import type { ReactNode } from "react"
import { ScrollView, Text, View } from "react-native"
import { SafeAreaView } from "react-native-safe-area-context"
import { toTypeRoleStyle } from "../../typeRoleStyles"

/**
 * The frame every session screen renders inside: the safe area, the scroll, and the CarlNotes name.
 */
export function SessionScreen({ children }: { children: ReactNode }) {
	return (
		<View className="flex-1 bg-background">
			<SafeAreaView className="flex-1">
				<ScrollView contentContainerClassName="gap-4 p-6" keyboardShouldPersistTaps="handled">
					{/* the name, centered as the web's brand mark is */}
					<Text
						style={toTypeRoleStyle("display")}
						className="mb-4 text-center text-foreground"
						accessibilityRole="header"
					>
						CarlNotes
					</Text>
					{children}
				</ScrollView>
			</SafeAreaView>
		</View>
	)
}
