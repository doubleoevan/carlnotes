import { useEffect, useState } from "react"

/**
 * A hook to sync to theme to its class on the HTML element and to localStorage.
 * returns the current theme and a toggle function
 */
export function useTheme(): { isDark: boolean; toggleTheme: () => void } {
	const [isDark, setIsDark] = useState(false)
	// load the persisted theme on mount
	useEffect(() => {
		setIsDark(localStorage.getItem("theme") === "dark")
	}, [])

	// apply the theme to the HTML element and persist it on every change
	useEffect(() => {
		document.documentElement.classList.toggle("dark", isDark)
		localStorage.setItem("theme", isDark ? "dark" : "light")
	}, [isDark])
	return { isDark, toggleTheme: () => setIsDark((previousIsDark) => !previousIsDark) }
}
