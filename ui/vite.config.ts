import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// the Hono dev server's origin, which the proxy below forwards to
const API_ORIGIN = "http://localhost:3000"

/**
 * The Vite config for the UI.
 */
export default defineConfig({
	// the TanStack Start plugin generates the route tree from src/routes and has to run before the React plugin
	plugins: [tanstackStart(), react(), tailwindcss()],
	resolve: {
		// path aliases for app src and the shared package
		alias: { "@": path.resolve(__dirname, "./src"), "@shared": path.resolve(__dirname, "../shared") },
		// force a single React copy so hooks work. duplicate copies cause "invalid hook call"
		dedupe: ["react", "react-dom"],
	},
	// proxy /api, /mcp, and the api's own pages and documents to the Hono dev server, so the browser sees one origin
	// (prod serves them all together). host: true exposes the dev server beyond loopback for browser-preview tooling
	server: {
		host: true,
		proxy: {
			"/api": API_ORIGIN,
			// a key that starts with ^ is a regular expression. /mcp and /mcp/t/<topic id> go to the api, and the ui keeps
			// /mcp/consent
			"^/mcp(/t/|\\?|$)": API_ORIGIN,
			"/.well-known": API_ORIGIN,
			"/docs": API_ORIGIN,
			"/blog": API_ORIGIN,
			"/releases": API_ORIGIN,
			"/changelog": API_ORIGIN,
			"/pricing": API_ORIGIN,
			"/sitemap.xml": API_ORIGIN,
			"/feed.xml": API_ORIGIN,
			"/llms.txt": API_ORIGIN,
			"/llms-full.txt": API_ORIGIN,
			"/indexnow.txt": API_ORIGIN,
			// the topic feed goes to the api, and every other /topics path stays in the ui
			"^/topics/[^/]+/feed\\.xml": API_ORIGIN,
		},
	},
})
