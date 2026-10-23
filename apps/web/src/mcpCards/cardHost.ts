// the host an mcp card runs in: the connected app, and the data the last tool result gave the card beside its
// structured result. a card makes no request of its own, so its links, its tool calls, and its reads go through here
import { MCP_CARD_META_KEY, type McpCardData } from "@carlnotes/contracts/mcpCards"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toStoreListeners } from "@carlnotes/core/stores/storeListeners"
import type { App } from "@modelcontextprotocol/ext-apps"

// the connected app, null until the host connects, and the card data the last tool result gave the card
let cardApp: App | null = null
let cardData: McpCardData = { session: null, podcastEpisodes: [] }

// the publish call and hook that re-render a card when its data changes
const { publish: publishCardData, useStoreVersion: useCardDataVersion } = toStoreListeners()

/**
 * Keeps the connected app, which the card's links and tool calls go through.
 */
export function setCardApp(app: App | null): void {
	cardApp = app
}

/**
 * Keeps the card data a tool result gave the card, or an empty one for a result with none.
 */
export function setCardData(toolResultMeta: Record<string, unknown> | undefined): void {
	cardData = (toolResultMeta?.[MCP_CARD_META_KEY] as McpCardData | undefined) ?? { session: null, podcastEpisodes: [] }
	publishCardData()
}

/**
 * Returns the card data the last tool result gave the card, re-rendering when it changes.
 */
export function useCardData(): McpCardData {
	useCardDataVersion()
	return cardData
}

/**
 * Returns a podcast episode the card data holds, in the player's shape, or null for one it does not.
 */
export function findCardPodcastEpisode(podcastEpisodeId: string): PodcastEpisode | null {
	return cardData.podcastEpisodes.find((podcastEpisode) => podcastEpisode.id === podcastEpisodeId) ?? null
}

/**
 * Asks the host to open a url, such as a page on the site.
 */
export function openHostLink(url: string): void {
	void cardApp?.openLink({ url })
}

/**
 * Calls a tool through the host, which sends it over the same connection, with the same authorization, as any call.
 */
export async function callCardTool(
	toolName: string,
	toolArguments: Record<string, unknown>,
): Promise<Awaited<ReturnType<App["callServerTool"]>>> {
	if (!cardApp) {
		throw new Error("the card is not connected to its host")
	}
	return cardApp.callServerTool({ name: toolName, arguments: toolArguments })
}
