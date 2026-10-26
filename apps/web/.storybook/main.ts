// the Nightshift component browser: Storybook on its TanStack React framework, which loads the app's own vite.config.ts,
// wraps every story in a memory-backed router, and stubs TanStack Start's server entry points
import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { FONT_STYLESHEET_URL } from "@carlnotes/nightshift/typography"
import { defineMain } from "@storybook/tanstack-react/node"
import { mergeConfig, type Plugin, type PluginOption } from "vite"

// the auth client stories read. Better Auth's client is a proxy that automocking cannot see into, so stories import a
// hand-written mock instead
const AUTH_CLIENT_MOCK_PATH = fileURLToPath(new URL("./mocks/authClient.ts", import.meta.url))

// the router stories read: the framework's router mock with a Link that keeps the caller's ref and onClick
const ROUTER_MOCK_PATH = fileURLToPath(new URL("./mocks/reactRouter.tsx", import.meta.url))

// the folder of the framework's own mocks, whose router mock imports the real router
const FRAMEWORK_MOCKS_FOLDER = "export-mocks"

// the web app's favicon, embedded for both standalone and /nightshift builds
const CARLNOTES_ICON_URL = `data:image/png;base64,${readFileSync(
	new URL("../public/favicon-96x96.png", import.meta.url),
).toString("base64")}`

// the script that renames the tab from Storybook to Nightshift each time Storybook sets the title, which it does on
// every story
const NIGHTSHIFT_TAB_TITLE_SCRIPT = `<script>
	(() => {
		// name Nightshift where Storybook's title names Storybook, and leave a title that already does alone
		const renameTabTitle = () => {
			const nightshiftTitle = document.title.replace(/Storybook$/, "Nightshift")
			if (nightshiftTitle !== document.title) {
				document.title = nightshiftTitle
			}
		}
		// rename the title now, and again each time Storybook changes it
		new MutationObserver(renameTabTitle).observe(document.head, { childList: true, subtree: true, characterData: true })
		renameTabTitle()
	})()
</script>`

// the Storybook config
const storybookConfig = defineMain({
	framework: "@storybook/tanstack-react",
	// the Tokens, Typography, and Inventory pages, then every story beside its component
	stories: ["../src/nightshift/**/*.mdx", "../src/**/*.stories.tsx"],
	addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "@storybook/addon-themes", "@storybook/addon-mcp"],
	// the components manifest on, and the onboarding checklists in the sidebar and the menu off
	features: { componentsManifest: true, sidebarOnboardingChecklist: false, menuOnboardingChecklist: false },
	// telemetry, the what's new notices, and the build's project.json stay off
	core: { disableTelemetry: true, disableWhatsNewNotifications: true, disableProjectJson: true },
	// the frame's head: the CarlNotes favicon, web fonts, and Nightshift tab title
	managerHead: (head) => `${head ?? ""}
<link rel="icon" type="image/png" sizes="96x96" href="${CARLNOTES_ICON_URL}" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link rel="stylesheet" href="${FONT_STYLESHEET_URL}" />
${NIGHTSHIFT_TAB_TITLE_SCRIPT}`,
	// point the auth client at its mock, ahead of the app's own aliases, and the router at its mock, ahead of the
	// framework's. the build leaves out the app's public files and the voice activity runtime, which a story loads from
	// the app's own root paths
	viteFinal: (viteConfig) => ({
		...mergeConfig(viteConfig, {
			resolve: { alias: [{ find: /^@carlnotes\/client\/authClient$/, replacement: AUTH_CLIENT_MOCK_PATH }] },
			build: { copyPublicDir: false },
		}),
		plugins: [storyRouterMockPlugin(), ...(viteConfig.plugins ?? []).map(withoutVoiceActivityFiles)],
	}),
})

// a plugin that resolves the router to the story router mock for every module but the two router mocks, which import
// the router themselves. it runs ahead of the framework's plugin, which would resolve the router to its own mock
function storyRouterMockPlugin(): Plugin {
	return {
		name: "nightshift:story-router-mock",
		enforce: "pre",
		resolveId: {
			order: "pre",
			handler(moduleId: string, importer: string | undefined): string | null {
				// an import of the router from anywhere but a router mock resolves to the story router mock
				const isRouterMockImporter =
					!importer || importer.startsWith(ROUTER_MOCK_PATH) || importer.includes(FRAMEWORK_MOCKS_FOLDER)
				return moduleId === "@tanstack/react-router" && !isRouterMockImporter ? ROUTER_MOCK_PATH : null
			},
		},
	}
}

// the voice activity plugin without the files it writes into a build. its define still points the detector at the
// app's own copy
function withoutVoiceActivityFiles(plugin: PluginOption): PluginOption {
	const isVoiceActivityPlugin =
		typeof plugin === "object" && plugin !== null && "name" in plugin && plugin.name === "voice-activity-assets"
	return isVoiceActivityPlugin ? { ...plugin, generateBundle: undefined } : plugin
}

export default storybookConfig
