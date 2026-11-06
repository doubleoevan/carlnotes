import type { McpView } from "@carlnotes/contracts/mcpViews"
import {
	applyDocumentTheme,
	applyHostStyleVariables,
	type McpUiHostContext,
	type McpUiStyles,
} from "@modelcontextprotocol/ext-apps"
import { useApp } from "@modelcontextprotocol/ext-apps/react"
import { RouterProvider } from "@tanstack/react-router"
import { useEffect, useRef } from "react"
import { LinkBaseUrlContext, LinkOpenerContext } from "@/components/common/AnchorLink"
import { replaceMcpViewToolCall } from "./mcpViewHistory"
import { openMcpViewLink, setMcpViewApp, setMcpViewDisplayModes } from "./mcpViewHost"
import { mcpViewRouter, toMcpViewOpeningPath } from "./mcpViewRouter"

// the host variables an MCP view applies
const HOST_STYLE_VARIABLE_PREFIXES = ["--color-", "--border-radius-"]

/**
 * An MCP view in its host's frame. It connects to the host, follows the host's theme, and opens the route its html names
 * from each tool result. Every link opens through the host.
 */
export function McpViewApp({ mcpView }: { mcpView: McpView }) {
	// the tool's arguments, which arrive before its result
	const toolArguments = useRef<Record<string, unknown> | null>(null)
	const { app } = useApp({
		appInfo: { name: "carlnotes-card", version: "1.0.0" },
		capabilities: {},
		onAppCreated: (createdApp) => {
			// keep the tool's arguments, then open the route for its result
			createdApp.ontoolinput = (toolInput) => {
				toolArguments.current = toolInput.arguments ?? null
			}
			createdApp.ontoolresult = (toolResult) => {
				const mcpViewToolCall = { toolResult, toolArguments: toolArguments.current }
				replaceMcpViewToolCall(mcpViewToolCall, toMcpViewOpeningPath(mcpView, mcpViewToolCall))
			}
			createdApp.onhostcontextchanged = applyHostContext
		},
	})

	// keep the connected app for the MCP view's links and tool calls, and follow the host
	useEffect(() => {
		setMcpViewApp(app)
		const hostContext = app?.getHostContext()
		if (hostContext) {
			applyHostContext(hostContext)
		}
	}, [app])
	return (
		<LinkBaseUrlContext.Provider value={document.body.dataset.siteUrl ?? null}>
			<LinkOpenerContext.Provider value={openMcpViewLink}>
				<RouterProvider router={mcpViewRouter} />
			</LinkOpenerContext.Provider>
		</LinkBaseUrlContext.Provider>
	)
}

// follow the host's light or dark theme, with the class the Nightshift tokens read, its colors and radii, and its
// display modes
function applyHostContext({ theme, styles, displayMode, availableDisplayModes }: McpUiHostContext): void {
	setMcpViewDisplayModes({ displayMode, availableDisplayModes })
	if (theme) {
		applyDocumentTheme(theme)
		document.documentElement.classList.toggle("dark", theme === "dark")
	}
	if (styles?.variables) {
		applyHostStyleVariables(toHostStyleVariables(styles.variables))
	}
}

// keep the host's colors and radii. its font variables would replace Nightshift's and share names with Tailwind's
function toHostStyleVariables(hostStyleVariables: McpUiStyles): McpUiStyles {
	const hostStyleVariableEntries = Object.entries(hostStyleVariables)
	return Object.fromEntries(
		hostStyleVariableEntries.filter(([name]) => HOST_STYLE_VARIABLE_PREFIXES.some((prefix) => name.startsWith(prefix))),
	) as McpUiStyles
}
