import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/**
 * The Vite config for the MCP views: one script and one stylesheet, with every asset inlined, which the api writes into
 * each MCP view's html. The auth client is the MCP view's own, whose session is the caller the tool result names, the visit
 * analytics report nothing, and the voice detector never starts.
 */
export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		// the MCP view's auth client, its visit analytics and voice detector, which do nothing, then the alias for the app's src
		alias: [
			{
				find: "@carlnotes/client/authClient",
				replacement: path.resolve(__dirname, "./src/mcpViews/mcpViewAuthClient.ts"),
			},
			{
				find: "@/lib/visitAnalytics",
				replacement: path.resolve(__dirname, "./src/mcpViews/mcpViewVisitAnalytics.ts"),
			},
			{
				find: "@/lib/voiceActivity",
				replacement: path.resolve(__dirname, "./src/mcpViews/mcpViewVoiceActivity.ts"),
			},
			{ find: "@", replacement: path.resolve(__dirname, "./src") },
		],
		// force a single React copy so hooks work. duplicate copies cause "invalid hook call"
		dedupe: ["react", "react-dom"],
	},
	// an MCP view holds no files of its own, so the site's public folder is left out
	publicDir: false,
	build: {
		outDir: "dist/mcp-views",
		emptyOutDir: true,
		// one stylesheet, and every font and image inlined, since an MCP view loads nothing it does not hold
		cssCodeSplit: false,
		assetsInlineLimit: () => true,
		// ponytail: the one script holds every component an MCP view renders, about 1.1 MB. split it into served files if a
		// host rejects a resource that large
		chunkSizeWarningLimit: 2000,
		rolldownOptions: {
			input: path.resolve(__dirname, "./src/mcpViews/main.tsx"),
			output: {
				format: "es",
				codeSplitting: false,
				entryFileNames: "mcpViews.js",
				assetFileNames: "mcpViews[extname]",
			},
		},
	},
})
