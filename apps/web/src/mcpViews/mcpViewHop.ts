// the one hop an MCP view moves from the route it opened on: a tool call whose result shows on another route
import { mcpViewHistory, navigateMcpView } from "./mcpViewHistory"
import { callMcpViewTool, openMcpViewLink, toMcpViewSiteUrl } from "./mcpViewHost"

// where a hop moves: the tool it calls with its arguments, the route that shows the result, and the same page on the
// site
type McpViewHop = { toolName: string; toolArguments: Record<string, unknown>; path: string; href: string }

// the newest hop, so that a slower read never replaces the destination of a later press
let latestHopId = 0

/**
 * Takes the one hop: calls the tool and shows its result on the route. A press after the MCP view has moved, and a
 * tool that will not read, open the page on the site.
 */
export async function moveMcpViewOneHop({ toolName, toolArguments, path, href }: McpViewHop): Promise<void> {
	const absoluteUrl = toMcpViewSiteUrl(href)
	if (mcpViewHistory.canGoBack()) {
		await openMcpViewLink(absoluteUrl)
		return
	}

	// read through the host, and drop a read that a later press replaced
	latestHopId += 1
	const hopId = latestHopId
	const toolResult = await callMcpViewTool(toolName, toolArguments).catch(() => null)
	if (hopId !== latestHopId) {
		return
	}

	// open the page on the site if the read failed
	if (!toolResult || toolResult.isError) {
		await openMcpViewLink(absoluteUrl)
		return
	}
	navigateMcpView(path, { toolResult, toolArguments })
}
