import { MonitorSmartphone, Moon, Sun } from "lucide-react-native"
import { useUniwind } from "uniwind"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { setThemePreference, useThemePreference } from "@/theme"
import type { ThemePreference } from "@/themePreference"

// the item that forgets a saved palette and follows the device again
const SYSTEM_APPEARANCE_LABEL = "System appearance"

/**
 * Offers the opposite palette, and the way back to the device's appearance while a palette is saved.
 */
export function ThemeMenu({ onClose }: { onClose: () => void }) {
	// match the web's light and dark toggle, and the system item that returns to the device's appearance
	const { theme } = useUniwind()
	const themePreference = useThemePreference()
	const isDark = theme === "dark"
	const label = isDark ? "Light mode" : "Dark mode"
	const handleChange = (nextTheme: ThemePreference): void => {
		// apply and save the choice, then close the menu
		void setThemePreference(nextTheme)
		onClose()
	}
	return (
		<>
			<Button
				variant="ghost"
				className="min-h-12 justify-start gap-2 px-2"
				accessibilityLabel={label}
				onPress={() => handleChange(isDark ? "light" : "dark")}
			>
				<Icon as={isDark ? Sun : Moon} className="size-4 text-foreground" />
				<Text>{label}</Text>
			</Button>
			{themePreference !== "system" && (
				<Button
					variant="ghost"
					className="min-h-12 justify-start gap-2 px-2"
					accessibilityLabel={SYSTEM_APPEARANCE_LABEL}
					onPress={() => handleChange("system")}
				>
					<Icon as={MonitorSmartphone} className="size-4 text-foreground" />
					<Text>{SYSTEM_APPEARANCE_LABEL}</Text>
				</Button>
			)}
		</>
	)
}
