// the MCP view routes, one for each MCP view, in a memory router. a user never sees these paths, and /brew/$topicId is
// the scan MCP view

import type { McpSearchPage, McpView, McpViewTopicResult } from "@carlnotes/contracts/mcpViews"
import { personalSourcesSendResult } from "@carlnotes/contracts/personalSources"
import type { TopicSuggestionsResult } from "@carlnotes/contracts/topicSuggestions"
import { createRootRoute, createRoute, createRouter, useLocation } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { FindingsMcpView } from "./FindingsMcpView"
import { McpViewShell } from "./McpViewShell"
import { FINDINGS_ROUTE_PREFIX, type McpViewToolCall, mcpViewHistory, toMcpViewToolCall } from "./mcpViewHistory"
import { toMcpViewData } from "./mcpViewHost"
import { ScanMcpView } from "./ScanMcpView"
import { SearchMcpView } from "./SearchMcpView"
import { TopicMcpView } from "./TopicMcpView"
import { TopicSuggestionsMcpView } from "./TopicSuggestionsMcpView"
import { UpdatesMcpView } from "./UpdatesMcpView"

// the id of a Topic route whose tool result names no Topic, which shows the tool's rejection
const NO_TOPIC_ID = "none"

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
])

/**
 * The MCP view's router.
 */
export const mcpViewRouter = createRouter({ routeTree, history: mcpViewHistory })

/**
 * Returns the route an MCP view opens on: the MCP view the html names, with the Topic of its tool result.
 */
export function toMcpViewOpeningPath(mcpView: McpView, { toolResult }: McpViewToolCall): string {
	const mcpViewData = toMcpViewData(toolResult._meta)
	const openingPaths: Record<McpView, string> = {
		search: "/search",
		topic: "/topic",
		findings: `${FINDINGS_ROUTE_PREFIX}${mcpViewData.topic?.id ?? NO_TOPIC_ID}`,
		"suggest-topics": "/send",
		updates: "/updates",
		scan: `/brew/${mcpViewData.scanStatus?.topicId ?? NO_TOPIC_ID}`,
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
