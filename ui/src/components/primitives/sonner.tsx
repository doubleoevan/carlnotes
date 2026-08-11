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

	// toasts drop from the top, themed to match the app, with props last so a caller can override.
	// the wrapper stops pointerdown, so a click on a toast does not close other dialogs.
	return (
		// biome-ignore lint/a11y/noStaticElementInteractions: this wrapper has no behavior, it only keeps an event from traveling
		<div onPointerDown={(event) => event.stopPropagation()}>
			<SonnerToaster
				theme={isDark ? "dark" : "light"}
				position="top-center"
				richColors
				closeButton
				// pass clicks up to the wrapper to stop it from closing other dialogs
				toastOptions={{ classNames: { title: "whitespace-pre-line", toast: "pointer-events-auto" } }}
				{...props}
			/>
		</div>
	)
}
