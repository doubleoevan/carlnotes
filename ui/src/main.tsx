/**
 * Entry point for the React app: mounts the App component to the DOM.
 *
 * Referenced by `ui/index.html`.
 */

// react + app bootstrap deps
import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { App } from "./App"
import "./globals.css"

// find the mount point
const container = document.getElementById("root")
if (!container) {
	throw new Error("Root element #root not found")
}

// mount the app
createRoot(container).render(
	<StrictMode>
		<App />
	</StrictMode>,
)
