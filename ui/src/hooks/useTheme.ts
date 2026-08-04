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
		// keep the browser chrome's tint on the theme's own hero, the way the pre-paint script set it in index.html
		document.querySelector('meta[name="theme-color"]')?.setAttribute("content", nextIsDark ? HERO_DARK : HERO_LIGHT)
		setIsDark(nextIsDark)
	}
	return { isDark, toggleTheme }
}

// each theme's hero color, mirroring --hero in globals.css. the browser tints its own chrome with it
const HERO_LIGHT = "#3b2a1d"
const HERO_DARK = "#0f0c09"
