// the browser entry point, which hydrates the document the server sent
import { StartClient } from "@tanstack/react-start/client"
import { StrictMode, startTransition } from "react"
import { hydrateRoot } from "react-dom/client"
import { reloadOnStaleBundle } from "@/lib/staleBundleReload"
import { startVisitAnalytics } from "@/lib/visitAnalytics"

// start visit analytics before hydration, and reload a page that a deploy left asking for a removed chunk.
// the first page view is captured right after hydration
startVisitAnalytics()
reloadOnStaleBundle()

// hydrate the whole document in a transition, which yields to user input
startTransition(() => {
	hydrateRoot(
		document,
		<StrictMode>
			<StartClient />
		</StrictMode>,
	)
})
