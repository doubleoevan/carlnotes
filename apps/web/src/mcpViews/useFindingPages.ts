// the pages of a findings tool's result. each next page calls the same tool with the result's cursor, and each previous
// page calls it with the cursor of the page before
import { useState } from "react"
import { mcpViewHistory, toMcpViewToolCall } from "./mcpViewHistory"
import { callMcpViewTool, type McpViewToolResult, setMcpViewData } from "./mcpViewHost"

// the tools behind a Topic's findings, the search tool if the arguments hold a query
export const FINDINGS_FEED_TOOL = "read_topic_feed"
const FINDINGS_SEARCH_TOOL = "search_topic_findings"

// what the findings table's paging controls read and call
type FindingPages = {
	hasNextPage: boolean
	hasPreviousPage: boolean
	hasPageFailed: boolean
	isLoading: boolean
	openNextPage: () => void
	openPreviousPage: () => void
}

/**
 * Returns the paging of a Topic's findings, which keeps the cursor of every page up to the one shown.
 */
export function useFindingPages(topicId: string | undefined): FindingPages {
	// the tool call that opened the route, which every page repeats with its own cursor
	const mcpViewToolCall = toMcpViewToolCall(mcpViewHistory.location.state)
	const [pageCursors, setPageCursors] = useState<(string | undefined)[]>([undefined])
	const [nextCursor, setNextCursor] = useState(toNextCursor(mcpViewToolCall?.toolResult))
	const [isLoading, setIsLoading] = useState(false)
	const [hasPageFailed, setHasPageFailed] = useState(false)

	// call the tool for the last of these cursors, and show its page once it returns
	const openPage = async (nextPageCursors: (string | undefined)[]): Promise<void> => {
		const toolArguments = { ...mcpViewToolCall?.toolArguments, topic_id: topicId, cursor: nextPageCursors.at(-1) }
		setIsLoading(true)
		setHasPageFailed(false)
		const toolName = "query" in toolArguments ? FINDINGS_SEARCH_TOOL : FINDINGS_FEED_TOOL
		const toolResult = await callMcpViewTool(toolName, toolArguments).catch(() => null)
		setIsLoading(false)

		// a failed call leaves the shown page in place
		if (!toolResult || toolResult.isError) {
			setHasPageFailed(true)
			return
		}

		// show the returned page
		setMcpViewData(toolResult._meta)
		setPageCursors(nextPageCursors)
		setNextCursor(toNextCursor(toolResult))
	}
	return {
		hasNextPage: nextCursor !== null,
		hasPreviousPage: pageCursors.length > 1,
		hasPageFailed,
		isLoading,
		openNextPage: () => {
			if (nextCursor) {
				void openPage([...pageCursors, nextCursor])
			}
		},
		openPreviousPage: () => void openPage(pageCursors.slice(0, -1)),
	}
}

// the cursor past a tool result's page, or null for the last page
function toNextCursor(toolResult: McpViewToolResult | undefined): string | null {
	const structuredContent = toolResult?.structuredContent as { nextCursor?: string | null } | undefined
	return structuredContent?.nextCursor ?? null
}
