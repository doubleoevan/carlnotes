// the host an MCP view runs in: the connected app, and the data the last tool result gave the MCP view beside its
// structured result. an MCP view makes no request of its own, so its links, its tool calls, and its reads go through here
import { MCP_VIEW_META_KEY, type McpViewData } from "@carlnotes/contracts/mcpViews"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { SITE_URL } from "@carlnotes/contracts/site"
import { toStoreListeners } from "@carlnotes/core/stores/storeListeners"
import type { App, McpUiDisplayMode } from "@modelcontextprotocol/ext-apps"

// a tool's result, from the host's notification or from a tool call
export type McpViewToolResult = Awaited<ReturnType<App["callServerTool"]>>

// the mode a host shows an MCP view in, and the modes it lists
type McpViewDisplayModes = { displayMode: McpUiDisplayMode; availableDisplayModes: string[] }

// what shows if the host rejects a link
const LINK_ERROR_TEXT =
	"Your app could not open this link. Use its link menu to copy the address and open it in your browser."

// what shows if a page of results did not load
export const PAGE_FAILED_TEXT = "That page didn't load. Carl suggests trying again."

// the MCP view data of a tool result that holds none
const EMPTY_MCP_VIEW_DATA: McpViewData = { session: null, podcastEpisodes: [] }

// the connected app, null until the host connects, and the MCP view data the last tool result gave the MCP view
let mcpViewApp: App | null = null
let mcpViewData = EMPTY_MCP_VIEW_DATA

// the host's rejection of the last link
let linkError: string | null = null

// the mode the host shows the MCP view in, and the modes it lists
let mcpViewDisplayModes: McpViewDisplayModes = { displayMode: "inline", availableDisplayModes: [] }

// the publish calls and hooks that re-render an MCP view when its data, link error, or display mode changes
const { publish: publishMcpViewData, useStoreVersion: useMcpViewDataVersion } = toStoreListeners()
const { publish: publishLinkError, useStoreVersion: useLinkErrorVersion } = toStoreListeners()
const { publish: publishDisplayModes, useStoreVersion: useDisplayModesVersion } = toStoreListeners()

/**
 * Returns a path's absolute url on the site that served the MCP view.
 */
export function toMcpViewSiteUrl(path: string): string {
	return new URL(path, document.body.dataset.siteUrl ?? SITE_URL).toString()
}

/**
 * Keeps the connected app, which the MCP view's links and tool calls go through.
 */
export function setMcpViewApp(app: App | null): void {
	mcpViewApp = app
}

/**
 * Returns the MCP view data a tool result holds, or an empty one for a result with none.
 */
export function toMcpViewData(toolResultMeta: Record<string, unknown> | undefined): McpViewData {
	return (toolResultMeta?.[MCP_VIEW_META_KEY] as McpViewData | undefined) ?? EMPTY_MCP_VIEW_DATA
}

/**
 * Keeps the MCP view data a tool result gave the MCP view.
 */
export function setMcpViewData(toolResultMeta: Record<string, unknown> | undefined): void {
	mcpViewData = toMcpViewData(toolResultMeta)
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
 * Opens a url through the host, showing what to do if the host rejects it. An MCP view never navigates its own frame.
 */
export async function openMcpViewLink(url: string): Promise<void> {
	linkError = null
	publishLinkError()
	// open the url and show the error text if the host rejects the url or is not connected
	const openLinkResult = await mcpViewApp?.openLink({ url }).catch(() => null)
	if (!openLinkResult || openLinkResult.isError) {
		linkError = LINK_ERROR_TEXT
		publishLinkError()
	}
}

/**
 * Returns what shows for the last link the host rejected, re-rendering when it changes.
 */
export function useMcpViewLinkError(): string | null {
	useLinkErrorVersion()
	return linkError
}

/**
 * Keeps what the host says about display modes, which a change to its context may leave out.
 */
export function setMcpViewDisplayModes(displayModes: Partial<McpViewDisplayModes>): void {
	mcpViewDisplayModes = {
		displayMode: displayModes.displayMode ?? mcpViewDisplayModes.displayMode,
		availableDisplayModes: displayModes.availableDisplayModes ?? mcpViewDisplayModes.availableDisplayModes,
	}
	publishDisplayModes()
}

/**
 * Returns the mode the host shows the MCP view in and the modes it lists, re-rendering when either changes.
 */
export function useMcpViewDisplayModes(): McpViewDisplayModes {
	useDisplayModesVersion()
	return mcpViewDisplayModes
}

/**
 * Asks the host for a display mode, and follows the mode it returns.
 */
export async function requestMcpViewDisplayMode(displayMode: McpUiDisplayMode): Promise<void> {
	if (!mcpViewApp) {
		throw new Error("The view is not connected to its host")
	}
	const requestDisplayModeResult = await mcpViewApp.requestDisplayMode({ mode: displayMode })
	setMcpViewDisplayModes({ displayMode: requestDisplayModeResult.mode })
}

/**
 * Returns a tool result's text, joined.
 */
export function toToolResultText(content: McpViewToolResult["content"]): string {
	return content.map((contentBlock) => ("text" in contentBlock ? contentBlock.text : "")).join(" ")
}

/**
 * Calls a tool through the host, which sends it over the same connection, with the same authorization, as any call.
 */
export async function callMcpViewTool(
	toolName: string,
	toolArguments: Record<string, unknown>,
): Promise<McpViewToolResult> {
	if (!mcpViewApp) {
		throw new Error("the view is not connected to its host")
	}
	return mcpViewApp.callServerTool({ name: toolName, arguments: toolArguments })
}
