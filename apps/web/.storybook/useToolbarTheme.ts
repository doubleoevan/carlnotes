// the toolbar's light and dark theme: whether globals name the dark theme, and the hook a theme control's story uses
// to read the theme and switch it
import { useGlobals } from "storybook/preview-api"

/**
 * Returns whether the globals name the dark theme. The toolbar starts on the light theme, so no theme global means light.
 */
export function isDarkToolbarTheme(globals: { theme?: unknown }): boolean {
	return globals.theme === "dark"
}

/**
 * Returns whether the toolbar is on the dark theme, and a toggle that reports the click to the given action and then
 * switches the toolbar to the other theme. A story that sets the theme in its own globals keeps that theme, so its
 * toggle reports the click but cannot switch it.
 */
export function useToolbarTheme(onToggle?: () => void): { isDark: boolean; toggleTheme: () => void } {
	// the toolbar's globals, and the setter that switches the theme
	const [globals, updateGlobals] = useGlobals()
	const isDark = isDarkToolbarTheme(globals)
	return {
		isDark,
		toggleTheme: () => {
			// report the click, then switch the toolbar to the other theme
			onToggle?.()
			updateGlobals({ theme: isDark ? "light" : "dark" })
		},
	}
}
