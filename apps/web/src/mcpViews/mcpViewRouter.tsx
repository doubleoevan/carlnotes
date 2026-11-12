// the MCP view routes, one for each MCP view, in a memory router. a user never sees these paths, /brew/$topicId is
// the scan MCP view, /posts/$topicId a Topic's Topic Posts, /post/$topicPostId one Topic Post, and /specials one
// Dashboard

import type { McpSearchPage, McpView, McpViewTopicResult } from "@carlnotes/contracts/mcpViews"
import { personalSourcesSendResult } from "@carlnotes/contracts/personalSources"
import type { TopicSuggestionsResult } from "@carlnotes/contracts/topicSuggestions"
import { createRootRoute, createRoute, createRouter, useLocation } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { DashboardMcpView } from "./DashboardMcpView"
import { FindingsMcpView } from "./FindingsMcpView"
import { McpViewShell } from "./McpViewShell"
import {
	FINDINGS_ROUTE_PREFIX,
	type McpViewToolCall,
	mcpViewHistory,
	NEWS_ROUTE_PATH,
	TOPIC_POST_ROUTE_PREFIX,
	TOPIC_POSTS_ROUTE_PREFIX,
	toMcpViewToolCall,
} from "./mcpViewHistory"
import { toMcpViewData } from "./mcpViewHost"
import { NewsMcpView } from "./NewsMcpView"
import { ScanMcpView } from "./ScanMcpView"
import { SearchMcpView } from "./SearchMcpView"
import { TopicMcpView } from "./TopicMcpView"
import { TopicPostMcpView } from "./TopicPostMcpView"
import { TopicPostsMcpView } from "./TopicPostsMcpView"
import { TopicSuggestionsMcpView } from "./TopicSuggestionsMcpView"
import { UpdatesMcpView } from "./UpdatesMcpView"

// the id of a route whose tool result names no Topic or Topic Post, which shows the tool's rejection
const NO_ROUTE_ID = "none"

// the root and its routes, which read the tool call in their history entry
const rootRoute = createRootRoute({ component: McpViewShell })
const routeTree = rootRoute.addChildren([
	createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <CoffeeLoading /> }),
	createRoute({ getParentRoute: () => rootRoute, path: "/search", component: SearchRoute }),
	createRoute({ getParentRoute: () => rootRoute, path: "/topic", component: TopicRoute }),
	createRoute({ getParentRoute: () => rootRoute, path: "/findings/$topicId", component: FindingsMcpView }),
	createRoute({ getParentRoute: () => rootRoute, path: "/send", component: SendRoute }),
	createRoute({ getParentRoute: () => rootRoute, path: "/updates", component: UpdatesRoute }),
	createRoute({ getParentRoute: () => rootRoute, path: "/brew/$topicId", component: ScanRoute }),
	createRoute({ getParentRoute: () => rootRoute, path: NEWS_ROUTE_PATH, component: NewsRoute }),
	createRoute({
		getParentRoute: () => rootRoute,
		path: `${TOPIC_POSTS_ROUTE_PREFIX}$topicId`,
		component: TopicPostsRoute,
	}),
	createRoute({
		getParentRoute: () => rootRoute,
		path: `${TOPIC_POST_ROUTE_PREFIX}$topicPostId`,
		component: TopicPostRoute,
	}),
	createRoute({ getParentRoute: () => rootRoute, path: "/specials", component: DashboardRoute }),
])

/**
 * The MCP view's router.
 */
export const mcpViewRouter = createRouter({ routeTree, history: mcpViewHistory })

/**
 * Returns the route an MCP view opens on: the MCP view the html names, with the Topic or the Topic Post of its tool
 * result.
 */
export function toMcpViewOpeningPath(mcpView: McpView, { toolResult }: McpViewToolCall): string {
	const mcpViewData = toMcpViewData(toolResult._meta)
	const openingPaths: Record<McpView, string> = {
		search: "/search",
		topic: "/topic",
		findings: `${FINDINGS_ROUTE_PREFIX}${mcpViewData.topic?.id ?? NO_ROUTE_ID}`,
		"suggest-topics": "/send",
		updates: "/updates",
		scan: `/brew/${mcpViewData.scanStatus?.topicId ?? NO_ROUTE_ID}`,
		news: NEWS_ROUTE_PATH,
		"topic-posts": `${TOPIC_POSTS_ROUTE_PREFIX}${mcpViewData.topic?.id ?? NO_ROUTE_ID}`,
		"topic-post": `${TOPIC_POST_ROUTE_PREFIX}${mcpViewData.topicPost?.id ?? NO_ROUTE_ID}`,
		dashboard: "/specials",
	}
	return openingPaths[mcpView]
}

// the tool call a route shows
function useMcpViewToolCall(): McpViewToolCall | null {
	return toMcpViewToolCall(useLocation().state)
}

// an updates list, which the tool built before the MCP view opened
function UpdatesRoute(): ReactNode {
	const { updates } = toMcpViewData(useMcpViewToolCall()?.toolResult._meta)
	return updates ? <UpdatesMcpView updates={updates} /> : null
}

// the news, which the tool read before the MCP view opened
function NewsRoute(): ReactNode {
	const { news } = toMcpViewData(useMcpViewToolCall()?.toolResult._meta)
	return news ? <NewsMcpView news={news} /> : null
}

// one page of a Topic's Topic Posts, and whether the tool result has a page after it
function TopicPostsRoute(): ReactNode {
	const toolResult = useMcpViewToolCall()?.toolResult
	const { topic, topicPosts } = toMcpViewData(toolResult?._meta)
	const { nextCursor } = (toolResult?.structuredContent ?? {}) as { nextCursor?: string | null }
	return topic && topicPosts ? (
		<TopicPostsMcpView topic={topic} topicPosts={topicPosts} hasMoreTopicPosts={Boolean(nextCursor)} />
	) : null
}

// one Topic Post, as its page shows it
function TopicPostRoute(): ReactNode {
	const { topicPost } = toMcpViewData(useMcpViewToolCall()?.toolResult._meta)
	return topicPost ? <TopicPostMcpView topicPost={topicPost} /> : null
}

// one Dashboard's read, which the tool read before the MCP view opened. only the dashboard MCP view's own bundle draws
// it, and the bundle every other MCP view shares draws nothing here
function DashboardRoute(): ReactNode {
	const { dashboard } = toMcpViewData(useMcpViewToolCall()?.toolResult._meta)
	return dashboard ? <DashboardMcpView mcpViewDashboard={dashboard} /> : null
}

// a Topic's running Scan or its latest recap
function ScanRoute(): ReactNode {
	const { scanStatus } = toMcpViewData(useMcpViewToolCall()?.toolResult._meta)
	return scanStatus ? <ScanMcpView firstScanStatus={scanStatus} /> : null
}

// the search tool's page
function SearchRoute(): ReactNode {
	const mcpSearchPage = useMcpViewToolCall()?.toolResult.structuredContent as McpSearchPage | undefined
	return mcpSearchPage ? <SearchMcpView mcpSearchPage={mcpSearchPage} /> : null
}

// an edit or a send's result, with the arguments Save sends again
function TopicRoute(): ReactNode {
	const mcpViewToolCall = useMcpViewToolCall()
	const mcpViewTopicResult = mcpViewToolCall?.toolResult.structuredContent as McpViewTopicResult | undefined
	return mcpViewTopicResult ? (
		<TopicMcpView mcpViewTopicResult={mcpViewTopicResult} editTopicArguments={mcpViewToolCall?.toolArguments ?? null} />
	) : null
}

// the suggestion checklist, or the confirmation of its send
function SendRoute(): ReactNode {
	const mcpViewToolCall = useMcpViewToolCall()
	const structuredContent = mcpViewToolCall?.toolResult.structuredContent
	if (!mcpViewToolCall || !structuredContent) {
		return null
	}
	const parsedSendResult = personalSourcesSendResult.safeParse(structuredContent)
	return parsedSendResult.success ? (
		<TopicMcpView mcpViewTopicResult={parsedSendResult.data} editTopicArguments={null} />
	) : (
		<TopicSuggestionsMcpView
			suggestions={structuredContent as TopicSuggestionsResult}
			toolArguments={mcpViewToolCall.toolArguments}
		/>
	)
}
