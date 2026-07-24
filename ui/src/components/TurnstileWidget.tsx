import { useEffect, useRef } from "react"

// cloudflare's own script, loaded once and shared by every mounted widget
const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js"

// the subset of window.turnstile this component calls
type Turnstile = {
	render: (
		container: HTMLElement,
		options: { sitekey: string; callback: (token: string) => void; size?: "flexible" },
	) => string
	remove: (widgetId: string) => void
}

declare global {
	interface Window {
		turnstile?: Turnstile
	}
}

/**
 * A Cloudflare Turnstile challenge widget. calls onVerify with the passed in token
 */
export function TurnstileWidget({ onVerify }: { onVerify: (token: string) => void }) {
	const containerRef = useRef<HTMLDivElement>(null)

	useEffect(() => {
		// load the script once. a second widget on the same page reuses the already-loaded window.turnstile
		const existingScript = document.querySelector(`script[src="${TURNSTILE_SCRIPT_URL}"]`)
		const script = existingScript ?? document.createElement("script")
		if (!existingScript) {
			script.setAttribute("src", TURNSTILE_SCRIPT_URL)
			script.setAttribute("async", "")
			document.head.append(script)
		}

		// render into this widget's own container once the script is ready.
		// flexible sizing fills the container's width instead of cloudflare's fixed 300px default
		let widgetId: string | undefined
		const renderWidget = () => {
			if (containerRef.current && window.turnstile) {
				widgetId = window.turnstile.render(containerRef.current, {
					sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
					callback: onVerify,
					size: "flexible",
				})
			}
		}
		if (window.turnstile) {
			renderWidget()
		} else {
			script.addEventListener("load", renderWidget)
		}

		// tear down this widget on unmount, leaving the shared script in place for any other mounted widget
		return () => {
			script.removeEventListener("load", renderWidget)
			if (widgetId) {
				window.turnstile?.remove(widgetId)
			}
		}
	}, [onVerify])

	return <div ref={containerRef} />
}
