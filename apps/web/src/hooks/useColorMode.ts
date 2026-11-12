// the color mode the page shows, kept current as the theme toggle switches it
import type { ColorMode } from "@carlnotes/nightshift/theme"
import { useSyncExternalStore } from "react"

/**
 * Returns "dark" while the html element has the dark class and "light" otherwise, following every switch.
 */
export function useColorMode(): ColorMode {
	return useSyncExternalStore(subscribeToHtmlClass, readColorMode, readServerColorMode)
}

// run the callback on every change to the html element's class list
function subscribeToHtmlClass(onClassChange: () => void): () => void {
	const classObserver = new MutationObserver(onClassChange)
	classObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
	return () => classObserver.disconnect()
}

// dark while the html element has the dark class, and light otherwise
function readColorMode(): ColorMode {
	return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

// the server render has no document, so it renders the light theme
function readServerColorMode(): ColorMode {
	return "light"
}
