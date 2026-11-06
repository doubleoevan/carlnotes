// what the fullscreen brand bar names for a route: its title, and the same page on the site
import type { McpSearchPage, McpViewData } from "@carlnotes/contracts/mcpViews"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { UPDATES_TITLE } from "@carlnotes/contracts/updates"
import { FINDINGS_ROUTE_PREFIX } from "./mcpViewHistory"
import type { McpViewToolResult } from "./mcpViewHost"

// a route's title and its page on the site
type McpViewRouteHeading = { title: string; href: string }

/**
 * Returns a route's heading, or null for a route that shows a result with no page of its own on the site.
 */
export function toMcpViewRouteHeading({
	pathname,
	toolResult,
	mcpViewData,
}: {
	pathname: string
	toolResult: McpViewToolResult | undefined
	mcpViewData: McpViewData
}): McpViewRouteHeading | null {
	if (pathname.startsWith(FINDINGS_ROUTE_PREFIX) && mcpViewData.topic) {
		return { title: mcpViewData.topic.name, href: toTopicPath(mcpViewData.topic) }
	}
	// link the search route to its search url
	if (pathname === "/search") {
		const searchUrl = (toolResult?.structuredContent as McpSearchPage | undefined)?.searchUrl
		return searchUrl ? { title: "Search", href: searchUrl } : null
	}
	// link the updates route to the page of its more link
	if (pathname === "/updates") {
		const { updates } = mcpViewData
		return updates ? { title: UPDATES_TITLE, href: updates.morePath } : null
	}
	// link a Scan's route to its Topic's page
	if (pathname.startsWith("/brew/")) {
		const { scanStatus } = mcpViewData
		return scanStatus ? { title: scanStatus.topicName, href: scanStatus.topicPath } : null
	}
	return null
}
