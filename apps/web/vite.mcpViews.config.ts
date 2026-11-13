import path from "node:path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

// the mode of the second build, which writes the dashboard MCP view's own script beside the first build's
const DASHBOARD_MCP_VIEW_MODE = "dashboard"

/**
 * The Vite config for the MCP views: one script for every MCP view but the dashboard, the dashboard MCP view's own
 * script in the dashboard mode, and one stylesheet, with every asset inlined, which the api writes into each MCP view's
 * html. The auth client is the MCP view's own, whose session is the caller the tool result names, the visit analytics
 * report nothing, the voice detector never starts, the Topic Post editor draws nothing, a url outside the app opens
 * through the host, chat Markdown renders through the safe note renderer, a HEIC file the browser cannot decode is
 * rejected, and outside the dashboard mode the dashboard MCP view draws nothing.
 */
export default defineConfig(({ mode }) => {
	const isDashboardMcpView = mode === DASHBOARD_MCP_VIEW_MODE
	return {
		plugins: [react(), tailwindcss()],
		resolve: {
			// the MCP view's auth client, its visit analytics, voice detector, and Topic Post editor, which do nothing, its
			// way out to a url, its chat Markdown and HEIC decoder, the empty dashboard MCP view outside the dashboard mode,
			// then the alias for the app's src
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
				{
					find: "@/components/topicPost/TopicPostEditor",
					replacement: path.resolve(__dirname, "./src/mcpViews/mcpViewTopicPostEditor.ts"),
				},
				{
					find: "@/lib/externalLinks",
					replacement: path.resolve(__dirname, "./src/mcpViews/mcpViewExternalLinks.ts"),
				},
				{
					find: /^\.\/ChatMarkdown$/,
					replacement: path.resolve(__dirname, "./src/mcpViews/mcpViewChatMarkdown.tsx"),
				},
				{ find: /^heic-to$/, replacement: path.resolve(__dirname, "./src/mcpViews/mcpViewHeicTo.ts") },
				...(isDashboardMcpView
					? []
					: [
							{
								find: /^\.\/DashboardMcpView$/,
								replacement: path.resolve(__dirname, "./src/mcpViews/emptyDashboardMcpView.ts"),
							},
						]),
				{ find: "@", replacement: path.resolve(__dirname, "./src") },
			],
			// force a single React copy so hooks work. duplicate copies cause "invalid hook call"
			dedupe: ["react", "react-dom"],
		},
		// an MCP view holds no files of its own, so the site's public folder is left out
		publicDir: false,
		build: {
			outDir: "dist/mcp-views",
			// the first build empties the folder, and the dashboard mode's build adds its script to it. its stylesheet
			// replaces the first build's, which Tailwind writes from the same sources
			emptyOutDir: !isDashboardMcpView,
			// one stylesheet, and every font and image inlined, since an MCP view loads nothing it does not hold
			cssCodeSplit: false,
			assetsInlineLimit: () => true,
			// ponytail: the dashboard MCP view's script holds every component an MCP view renders, about 2.4 MB. split it
			// into served files if a host rejects a resource that large
			chunkSizeWarningLimit: 2500,
			rolldownOptions: {
				input: path.resolve(__dirname, "./src/mcpViews/main.tsx"),
				output: {
					format: "es",
					codeSplitting: false,
					entryFileNames: isDashboardMcpView ? "dashboardMcpView.js" : "mcpViews.js",
					assetFileNames: "mcpViews[extname]",
				},
			},
		},
	}
})
