import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

/**
 * The Vite config for the mcp cards: one script and one stylesheet, with every asset inlined, which the api writes into
 * each card's html. The auth client is the card's own, whose session is the caller the tool result names, and the visit
 * analytics report nothing.
 */
export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		// the card's auth client and its visit analytics, which report nothing, then the path alias for the app's own src
		alias: [
			{
				find: "@carlnotes/client/authClient",
				replacement: path.resolve(__dirname, "./src/mcpCards/cardAuthClient.ts"),
			},
			{
				find: "@/lib/visitAnalytics",
				replacement: path.resolve(__dirname, "./src/mcpCards/cardVisitAnalytics.ts"),
			},
			{ find: "@", replacement: path.resolve(__dirname, "./src") },
		],
		// force a single React copy so hooks work. duplicate copies cause "invalid hook call"
		dedupe: ["react", "react-dom"],
	},
	// a card holds no files of its own, so the site's public folder is left out
	publicDir: false,
	build: {
		outDir: "dist/mcp-cards",
		emptyOutDir: true,
		// one stylesheet, and every font and image inlined, since a card loads nothing it does not hold
		cssCodeSplit: false,
		assetsInlineLimit: () => true,
		// ponytail: the one script holds every component a card renders, about 1.2 MB. split it into served files if a
		// host rejects a resource that large
		chunkSizeWarningLimit: 2000,
		rolldownOptions: {
			input: path.resolve(__dirname, "./src/mcpCards/main.tsx"),
			output: {
				format: "es",
				codeSplitting: false,
				entryFileNames: "cards.js",
				assetFileNames: "cards[extname]",
			},
		},
	},
})
