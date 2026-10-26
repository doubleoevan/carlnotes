import AsyncStorage from "@react-native-async-storage/async-storage"
import { Appearance } from "react-native"
import { Uniwind } from "uniwind"

// the device's appearance is the default until the user chooses a palette
type ThemePreference = "system" | "light" | "dark"
const THEME_STORAGE_KEY = "carlnotes.theme"

/**
 * Restores the saved appearance before the first screen renders.
 */
export async function restoreTheme(): Promise<void> {
	try {
		// accept only the app's palettes and otherwise follow the device
		const storedTheme = await AsyncStorage.getItem(THEME_STORAGE_KEY)
		applyTheme(storedTheme === "light" || storedTheme === "dark" ? storedTheme : "system")
	} catch (error) {
		// keep the app usable when the preference cannot be read
		console.error("theme preference read failed", error)
		applyTheme("system")
	}
}

/**
 * Applies an appearance choice immediately and remembers it across launches.
 */
export async function setThemePreference(theme: "light" | "dark"): Promise<void> {
	// apply the palette and persist only an explicit override
	applyTheme(theme)
	try {
		await AsyncStorage.setItem(THEME_STORAGE_KEY, theme)
	} catch (error) {
		console.error("theme preference save failed", error)
	}
}

// keep native sheets and the Nightshift palette on the same appearance
function applyTheme(theme: ThemePreference): void {
	Appearance.setColorScheme(theme === "system" ? "auto" : theme)
	Uniwind.setTheme(theme)
}
