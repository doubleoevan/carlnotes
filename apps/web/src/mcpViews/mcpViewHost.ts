// the host an MCP view runs in: the connected app, and the data the last tool result gave the MCP view beside its
// structured result. an MCP view makes no request of its own, so its links, its tool calls, and its reads go through here
import { MCP_VIEW_META_KEY, type McpViewData } from "@carlnotes/contracts/mcpViews"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toStoreListeners } from "@carlnotes/core/stores/storeListeners"
import type { App } from "@modelcontextprotocol/ext-apps"

// the connected app, null until the host connects, and the MCP view data the last tool result gave the MCP view
let mcpViewApp: App | null = null
let mcpViewData: McpViewData = { session: null, podcastEpisodes: [] }

// the publish call and hook that re-render an MCP view when its data changes
const { publish: publishMcpViewData, useStoreVersion: useMcpViewDataVersion } = toStoreListeners()

/**
 * Keeps the connected app, which the MCP view's links and tool calls go through.
 */
export function setMcpViewApp(app: App | null): void {
	mcpViewApp = app
}

/**
 * Keeps the MCP view data a tool result gave the MCP view, or an empty one for a result with none.
 */
export function setMcpViewData(toolResultMeta: Record<string, unknown> | undefined): void {
	mcpViewData = (toolResultMeta?.[MCP_VIEW_META_KEY] as McpViewData | undefined) ?? {
		session: null,
		podcastEpisodes: [],
	}
	publishMcpViewData()
}

/**
 * Returns the MCP view data the last tool result gave the MCP view, re-rendering when it changes.
 */
export function useMcpViewData(): McpViewData {
	useMcpViewDataVersion()
	return mcpViewData
}

/**
 * Returns a podcast episode the MCP view data holds, in the player's shape, or null for one it does not.
 */
export function findMcpViewPodcastEpisode(podcastEpisodeId: string): PodcastEpisode | null {
	return mcpViewData.podcastEpisodes.find((podcastEpisode) => podcastEpisode.id === podcastEpisodeId) ?? null
}

/**
 * Asks the host to open a url, such as a page on the site.
 */
export async function openHostLink(url: string): Promise<void> {
	if (!mcpViewApp) {
		throw new Error("The view is not connected to its host")
	}
	const result = await mcpViewApp.openLink({ url })
	if (result.isError) {
		throw new Error("The host declined to open the link")
	}
}

/**
 * Calls a tool through the host, which sends it over the same connection, with the same authorization, as any call.
 */
export async function callMcpViewTool(
	toolName: string,
	toolArguments: Record<string, unknown>,
): Promise<Awaited<ReturnType<App["callServerTool"]>>> {
	if (!mcpViewApp) {
		throw new Error("the view is not connected to its host")
	}
	return mcpViewApp.callServerTool({ name: toolName, arguments: toolArguments })
}
