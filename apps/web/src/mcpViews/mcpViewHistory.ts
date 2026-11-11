// the MCP view's memory history. each route keeps the tool call it shows in its history state, so back shows that call
// again with no new tool call. an MCP view moves only through the functions here, and any other navigation opens on the site
import { createMemoryHistory } from "@tanstack/react-router"
import { type McpViewToolResult, openMcpViewLink, setMcpViewData, toMcpViewSiteUrl } from "./mcpViewHost"

// what a route shows: a tool's result and the arguments the tool was called with
export type McpViewToolCall = { toolResult: McpViewToolResult; toolArguments: Record<string, unknown> | null }

/**
 * The history the MCP view router reads, which starts on the route that waits for the first tool result.
 */
export const mcpViewHistory = createMemoryHistory({ initialEntries: ["/"] })

// the path every route of a Topic's findings starts with
export const FINDINGS_ROUTE_PREFIX = "/findings/"

// the news route, and the paths every route of a Topic's Topic Posts and of one Topic Post start with
export const NEWS_ROUTE_PATH = "/news"
export const TOPIC_POSTS_ROUTE_PREFIX = "/posts/"
export const TOPIC_POST_ROUTE_PREFIX = "/post/"

// the MCP view data follows the route, which is how back restores what the route read
mcpViewHistory.subscribe(() => setMcpViewData(toMcpViewToolCall(mcpViewHistory.location.state)?.toolResult._meta))

// a shared component's navigation names a page of the site, so the host opens it and the MCP view stays on its route
mcpViewHistory.block({
	blockerFn: ({ nextLocation }) => {
		void openMcpViewLink(toMcpViewSiteUrl(nextLocation.href))
		return true
	},
})

/**
 * Returns the tool call a history state keeps.
 */
export function toMcpViewToolCall(historyState: unknown): McpViewToolCall | null {
	return (historyState as { mcpViewToolCall?: McpViewToolCall }).mcpViewToolCall ?? null
}

/**
 * Moves to a route, showing a tool call there.
 */
export function navigateMcpView(path: string, mcpViewToolCall: McpViewToolCall): void {
	mcpViewHistory.push(path, { mcpViewToolCall }, { ignoreBlocker: true })
}

/**
 * Shows a tool call on the current route in place of the one it shows. Back returns to this call, and a path sets where
 * an opening route starts.
 */
export function replaceMcpViewToolCall(
	mcpViewToolCall: McpViewToolCall,
	path: string = mcpViewHistory.location.pathname,
): void {
	mcpViewHistory.replace(path, { mcpViewToolCall }, { ignoreBlocker: true })
}
