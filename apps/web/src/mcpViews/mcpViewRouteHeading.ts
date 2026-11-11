// what the fullscreen brand bar names for a route: its title, and the same page on the site
import type { McpSearchPage, McpViewData } from "@carlnotes/contracts/mcpViews"
import { NEWS_TITLE } from "@carlnotes/contracts/news"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { UPDATES_TITLE } from "@carlnotes/contracts/updates"
import { toTopicPostTitle } from "@carlnotes/core/lib/topicPosts"
import {
	FINDINGS_ROUTE_PREFIX,
	NEWS_ROUTE_PATH,
	TOPIC_POST_ROUTE_PREFIX,
	TOPIC_POSTS_ROUTE_PREFIX,
} from "./mcpViewHistory"
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
	// a route about one Topic or one Topic Post
	const topicRouteHeading = toTopicRouteHeading(pathname, mcpViewData)
	if (topicRouteHeading) {
		return topicRouteHeading
	}

	// link the news route to the home, which shows the user's news
	if (pathname === NEWS_ROUTE_PATH) {
		return mcpViewData.news ? { title: NEWS_TITLE, href: "/" } : null
	}
	// link the search route to its search url and the updates route to the updates page
	if (pathname === "/search") {
		const searchUrl = (toolResult?.structuredContent as McpSearchPage | undefined)?.searchUrl
		return searchUrl ? { title: "Search", href: searchUrl } : null
	}
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

// the heading of a route about one Topic or one Topic Post, or null for any other route: a Topic's findings and its
// Topic Posts name the Topic and its page, and a Topic Post names itself and its own page
function toTopicRouteHeading(pathname: string, mcpViewData: McpViewData): McpViewRouteHeading | null {
	// a Topic's findings and its Topic Posts
	const isTopicRoute = pathname.startsWith(FINDINGS_ROUTE_PREFIX) || pathname.startsWith(TOPIC_POSTS_ROUTE_PREFIX)
	if (isTopicRoute && mcpViewData.topic) {
		return { title: mcpViewData.topic.name, href: toTopicPath(mcpViewData.topic) }
	}

	// one Topic Post
	if (pathname.startsWith(TOPIC_POST_ROUTE_PREFIX) && mcpViewData.topicPost) {
		return { title: toTopicPostTitle(mcpViewData.topicPost), href: mcpViewData.topicPost.path }
	}
	return null
}
