/**
 * Entry point for the React app. Mounts the App component to the DOM.
 *
 * Referenced by `ui/index.html`.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import "./globals.css"

// find the mount point
const container = document.getElementById("root")
if (!container) {
	throw new Error("Root element #root not found")
}

// one query client for the whole app. no focus re-fetch and no automatic retry, matching the fetches it replaces
const queryClient = new QueryClient({
	defaultOptions: { queries: { refetchOnWindowFocus: false, retry: false } },
})

// mount the app to the DOM
createRoot(container).render(
	<StrictMode>
		<QueryClientProvider client={queryClient}>
			<App />
		</QueryClientProvider>
	</StrictMode>,
)
