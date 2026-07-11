/**
 * Entry point for the React app: mounts the App component to the DOM.
 *
 * Referenced by `ui/index.html`.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./globals.css";

const container = document.getElementById("root");
if (!container) {
	throw new Error("Root element #root not found");
}

createRoot(container).render(
	<StrictMode>
		<App />
	</StrictMode>,
);
