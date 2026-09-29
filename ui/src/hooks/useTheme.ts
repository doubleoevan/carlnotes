import { useLayoutEffect, useState } from "react"

/**
 * Returns whether the dark theme is on, and a toggle that switches the theme and saves the choice to localStorage.
 */
export function useTheme(): { isDark: boolean; toggleTheme: () => void } {
	// start on the light theme the server renders. the layout effect reads back the dark class that the theme script set
	// before the first browser paint
	const [isDark, setIsDark] = useState(false)
	useLayoutEffect(() => {
		setIsDark(document.documentElement.classList.contains("dark"))
	}, [])

	// a toggle is an explicit choice, so it persists and wins over the OS setting next time
	const toggleTheme = (): void => {
		const nextIsDark = !isDark
		document.documentElement.classList.toggle("dark", nextIsDark)
		localStorage.setItem("theme", nextIsDark ? "dark" : "light")
		// set the theme-color meta tag to the theme's hero color
		document.querySelector('meta[name="theme-color"]')?.setAttribute("content", nextIsDark ? HERO_DARK : HERO_LIGHT)
		setIsDark(nextIsDark)
	}
	return { isDark, toggleTheme }
}

// each theme's hero color, mirroring --hero in globals.css. the browser tints its toolbar with the hero color
const HERO_LIGHT = "#3b2a1d"
const HERO_DARK = "#0f0c09"
