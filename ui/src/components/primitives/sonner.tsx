import type * as React from "react"
import { useEffect, useState } from "react"
import { Toaster as SonnerToaster } from "sonner"

/**
 * The app's toast host, mounted once in the layout. It mirrors the HTML dark class so that toasts match the theme.
 */
export function Toaster(props: React.ComponentProps<typeof SonnerToaster>) {
	// track the dark class on the HTML element so a theme toggle restyles live
	const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains("dark"))
	useEffect(() => {
		const observer = new MutationObserver(() => setIsDark(document.documentElement.classList.contains("dark")))
		observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
		return () => observer.disconnect()
	}, [])

	// toasts drop down from the top, styled red by rich colors, with a close button to dismiss, themed to match the app
	return <SonnerToaster theme={isDark ? "dark" : "light"} position="top-center" richColors closeButton {...props} />
}
