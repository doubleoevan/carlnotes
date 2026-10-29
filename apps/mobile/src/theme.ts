import { toStoreListeners } from "@carlnotes/core/stores/storeListeners"
import AsyncStorage from "@react-native-async-storage/async-storage"
import { Appearance } from "react-native"
import { Uniwind } from "uniwind"
import { type ThemePreference, toThemePreference } from "./themePreference"

// the device's appearance is the default until the user chooses a palette, and the choice that returns to it
const THEME_STORAGE_KEY = "carlnotes.theme"
let themePreference: ThemePreference = "system"
const { publish, useStoreVersion } = toStoreListeners()

/**
 * Restores the saved appearance before the first screen renders.
 */
export async function restoreTheme(): Promise<void> {
	try {
		// accept only the app's palettes and otherwise follow the device
		applyTheme(toThemePreference(await AsyncStorage.getItem(THEME_STORAGE_KEY)))
	} catch (error) {
		// keep the app usable when the preference cannot be read
		console.error("theme preference read failed", error)
		applyTheme("system")
	}
}

/**
 * Applies an appearance choice immediately and remembers it across launches. System forgets the saved palette.
 */
export async function setThemePreference(theme: ThemePreference): Promise<void> {
	applyTheme(theme)

	// remember a palette, and forget it for system
	try {
		if (theme === "system") {
			await AsyncStorage.removeItem(THEME_STORAGE_KEY)
		} else {
			await AsyncStorage.setItem(THEME_STORAGE_KEY, theme)
		}
	} catch (error) {
		// a save that fails leaves the choice applied for this launch
		console.error("theme preference save failed", error)
	}
}

/**
 * Reads the current appearance choice: system, or the palette the user chose.
 */
export function useThemePreference(): ThemePreference {
	useStoreVersion()
	return themePreference
}

// keep native sheets and the Nightshift palette on the same appearance, and publish the choice
function applyTheme(theme: ThemePreference): void {
	themePreference = theme
	Appearance.setColorScheme(theme === "system" ? "auto" : theme)
	Uniwind.setTheme(theme)
	publish()
}
