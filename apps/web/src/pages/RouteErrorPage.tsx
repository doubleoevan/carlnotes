import { ErrorComponent, type ErrorComponentProps } from "@tanstack/react-router"
import { Button } from "@/components/primitives/button"
import { isStaleBundleError } from "@/lib/staleBundleReload"
import { HIGHLIGHTED_PAGE_BUTTON_CLASS } from "@/lib/styleClasses"

/**
 * A route's error. A page file that a deploy removed asks for a reload onto the new build, and any other error shows
 * the router's own error.
 */
export function RouteErrorPage(props: ErrorComponentProps) {
	if (!isStaleBundleError(props.error)) {
		return <ErrorComponent {...props} />
	}
	return (
		<main className="mx-auto max-w-3xl px-4 py-16 text-center">
			{/* the news that a new build is out, and the reload onto it */}
			<h1 className="font-display text-2xl">A fresh batch of CarlNotes is ready.</h1>
			<Button className={`${HIGHLIGHTED_PAGE_BUTTON_CLASS} mt-6`} onClick={handleReloadClick}>
				Pour
			</Button>
		</main>
	)
}

// load the page again on the new build
function handleReloadClick() {
	window.location.reload()
}
