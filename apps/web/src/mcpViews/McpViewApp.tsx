import type { McpSearchPage, McpView, McpViewTopicResult } from "@carlnotes/contracts/mcpViews"
import type { TopicSuggestionsResult } from "@carlnotes/contracts/topicSuggestions"
import { useApp } from "@modelcontextprotocol/ext-apps/react"
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from "@tanstack/react-router"
import { createContext, type ReactNode, useContext, useEffect, useState } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { LinkBaseUrlContext, LinkOpenerContext } from "@/components/common/AnchorLink"
import { FindingsMcpView } from "./FindingsMcpView"
import { openHostLink, setMcpViewApp, setMcpViewData } from "./mcpViewHost"
import { SearchMcpView } from "./SearchMcpView"
import { TopicMcpView } from "./TopicMcpView"
import { TopicSuggestionsMcpView } from "./TopicSuggestionsMcpView"

// what an MCP view renders from: the tool result's structured content and the arguments the tool was called with
type McpViewToolCall = { structuredContent: unknown; toolArguments: Record<string, unknown> | null }

// the MCP view's tool call, which the root route's component reads
const McpViewToolCallContext = createContext<{ mcpView: McpView; mcpViewToolCall: McpViewToolCall | null } | null>(null)

// a router with one route, so a shared component's router hooks work inside an MCP view. every link opens through the host
const mcpViewRouter = createRouter({
	routeTree: createRootRoute({ component: McpViewBody }),
	history: createMemoryHistory({ initialEntries: ["/"] }),
})

/**
 * An MCP view in its host's frame: it connects to the host, follows the host's theme, and renders the MCP view its html
 * names from each tool result.
 */
export function McpViewApp({ mcpView }: { mcpView: McpView }) {
	// the tool call the MCP view shows, set from the host's notifications
	const [mcpViewToolCall, setMcpViewToolCall] = useState<McpViewToolCall | null>(null)
	const [linkError, setLinkError] = useState<string | null>(null)
	const [toolArguments, setToolArguments] = useState<Record<string, unknown> | null>(null)
	const { app } = useApp({
		appInfo: { name: "carlnotes-card", version: "1.0.0" },
		capabilities: {},
		onAppCreated: (createdApp) => {
			// keep the tool's arguments, then show its result with the MCP view data beside it
			createdApp.ontoolinput = (toolInput) => setToolArguments(toolInput.arguments ?? null)
			createdApp.ontoolresult = (toolResult) => {
				setMcpViewData(toolResult._meta)
				setMcpViewToolCall({ structuredContent: toolResult.structuredContent, toolArguments: null })
			}
			createdApp.onhostcontextchanged = (hostContext) => applyHostTheme(hostContext.theme)
		},
	})

	// show a host refusal without navigating inside the sandbox
	const handleOpenLink = (url: string): void => {
		setLinkError(null)
		void openHostLink(url).catch(() =>
			setLinkError(
				"Your app could not open this link. Use its link menu to copy the address and open it in your browser.",
			),
		)
	}

	// keep the connected app for the MCP view's links and tool calls, and take the host's theme
	useEffect(() => {
		setMcpViewApp(app)
		applyHostTheme(app?.getHostContext()?.theme)
	}, [app])
	// a host frames the MCP view edge to edge, so the MCP view keeps its own margin inside the frame
	const shownToolCall = mcpViewToolCall ? { ...mcpViewToolCall, toolArguments } : null
	return (
		<LinkBaseUrlContext.Provider value={document.body.dataset.siteUrl ?? null}>
			<LinkOpenerContext.Provider value={handleOpenLink}>
				<McpViewToolCallContext.Provider value={{ mcpView, mcpViewToolCall: shownToolCall }}>
					<div className="p-3">
						<RouterProvider router={mcpViewRouter} />
						{linkError && (
							<p role="alert" className="text-muted-foreground mt-3 text-sm">
								{linkError}
							</p>
						)}
					</div>
				</McpViewToolCallContext.Provider>
			</LinkOpenerContext.Provider>
		</LinkBaseUrlContext.Provider>
	)
}

// the MCP view's body: the loading state until a tool result arrives, then the MCP view its html names
function McpViewBody(): ReactNode {
	const mcpViewToolCallValue = useContext(McpViewToolCallContext)
	if (!mcpViewToolCallValue?.mcpViewToolCall) {
		return <CoffeeLoading />
	}

	// the findings MCP view reads its MCP view data. any other MCP view shows nothing for a result with no structured content, a
	// rejection the model reads
	const { mcpView, mcpViewToolCall } = mcpViewToolCallValue
	if (mcpView === "findings") {
		return <FindingsMcpView />
	}
	if (!mcpViewToolCall.structuredContent) {
		return null
	}
	if (mcpView === "suggest-topics") {
		return (
			<TopicSuggestionsMcpView
				key={JSON.stringify(mcpViewToolCall)}
				suggestions={mcpViewToolCall.structuredContent as TopicSuggestionsResult}
				toolArguments={mcpViewToolCall.toolArguments}
			/>
		)
	}
	return mcpView === "search" ? (
		<SearchMcpView mcpSearchPage={mcpViewToolCall.structuredContent as McpSearchPage} />
	) : (
		<TopicMcpView
			mcpViewTopicResult={mcpViewToolCall.structuredContent as McpViewTopicResult}
			editTopicArguments={mcpViewToolCall.toolArguments}
		/>
	)
}

// follow the host's light or dark theme with the class the Nightshift tokens read
function applyHostTheme(theme: string | undefined): void {
	if (theme) {
		document.documentElement.classList.toggle("dark", theme === "dark")
	}
}
