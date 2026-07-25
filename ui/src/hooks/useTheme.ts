import { useState } from "react"

/**
 * A hook to sync the theme to its class on the HTML element and to localStorage.
 * returns the current theme and a toggle handler
 */
export function useTheme(): { isDark: boolean; toggleTheme: () => void } {
	// the head script set the dark class from localStorage or the OS setting before paint, so read that back
	const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"))

	// a toggle is an explicit choice: flip the class and persist it so it wins over the OS setting next time
	const toggleTheme = (): void => {
		const nextIsDark = !isDark
		document.documentElement.classList.toggle("dark", nextIsDark)
		localStorage.setItem("theme", nextIsDark ? "dark" : "light")
		setIsDark(nextIsDark)
	}
	return { isDark, toggleTheme }
}
