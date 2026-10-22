import type * as React from "react"
import { useSyncExternalStore } from "react"
import { Toaster as SonnerToaster } from "sonner"

// sonner's light rich colors set success, info, warning, and error text under 4.5:1 on their own fills. these are the
// same hues, darkened to clear it. the dark ones already do
const LIGHT_TOAST_TEXT_COLORS = {
	"--success-text": "hsl(140, 100%, 26%)",
	"--info-text": "hsl(210, 92%, 44%)",
	"--warning-text": "hsl(31, 92%, 36%)",
	"--error-text": "hsl(360, 100%, 44%)",
} as React.CSSProperties

/**
 * The app's toast host, mounted once in the root route. It mirrors the HTML dark class so that toasts match the theme.
 */
export function Toaster(props: React.ComponentProps<typeof SonnerToaster>) {
	// read the HTML element's dark class, and read it again on every class change so a theme toggle restyles the toasts
	const isDark = useSyncExternalStore(subscribeToHtmlClass, readIsDark, readIsDarkOnServer)

	// toasts drop from the top, themed to match the app, with props last so a caller can override
	return (
		<div onPointerDown={(event) => event.stopPropagation()}>
			<SonnerToaster
				theme={isDark ? "dark" : "light"}
				position="top-center"
				richColors
				closeButton
				// the toaster's own style outranks sonner's stylesheet, which sets the colors on the same element
				style={isDark ? undefined : LIGHT_TOAST_TEXT_COLORS}
				// pass clicks up to the wrapper to stop it from closing other dialogs
				toastOptions={{ classNames: { title: "whitespace-pre-line", toast: "pointer-events-auto" } }}
				{...props}
			/>
		</div>
	)
}

// run the callback on every change to the HTML element's class list
function subscribeToHtmlClass(onClassChange: () => void): () => void {
	const observer = new MutationObserver(onClassChange)
	observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
	return () => observer.disconnect()
}

// whether the HTML element has the dark class
function readIsDark(): boolean {
	return document.documentElement.classList.contains("dark")
}

// the server render has no document, so it renders the light theme
function readIsDarkOnServer(): boolean {
	return false
}
