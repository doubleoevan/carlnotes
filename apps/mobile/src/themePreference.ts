// the appearance choice the device remembers: the system's, or one of the app's two palettes
export type ThemePreference = "system" | "light" | "dark"

/**
 * Returns the appearance choice a stored value names, and system for nothing stored or a value the app never wrote.
 */
export function toThemePreference(storedTheme: string | null): ThemePreference {
	return storedTheme === "light" || storedTheme === "dark" ? storedTheme : "system"
}
