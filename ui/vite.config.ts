import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/**
 * The Vite config for the UI.
 */
export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		// path aliases for app src and the shared package
		alias: { "@": path.resolve(__dirname, "./src"), "@shared": path.resolve(__dirname, "../shared") },
		// force a single React copy so hooks work. duplicate copies cause "invalid hook call"
		dedupe: ["react", "react-dom"],
	},
	// proxy /api to the Hono dev server so the browser sees one origin (prod serves both together).
	// host: true exposes the dev server beyond loopback which is needed for browser-preview tooling to reach it
	server: { host: true, proxy: { "/api": "http://localhost:3000" } },
})
