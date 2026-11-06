import type { TopicFinding } from "@carlnotes/contracts/findings"
import { useEffect, useState } from "react"
import type { TopicFeedHandlers } from "@/providers/TopicFeedProvider"
import { toMcpViewFindingHandlers } from "./mcpViewFindingHandlers"

/**
 * Returns an MCP view's findings as the last call left them, and the row handlers, each a tool call whose change shows
 * on its row once it saves. New findings from the host replace the rows.
 */
export function useMcpViewFindings<Finding extends TopicFinding>(
	mcpViewFindings: Finding[],
): { findings: Finding[]; topicFeedHandlers: TopicFeedHandlers } {
	const [findings, setFindings] = useState(mcpViewFindings)
	useEffect(() => setFindings(mcpViewFindings), [mcpViewFindings])
	const topicFeedHandlers = toMcpViewFindingHandlers(({ findingId, topicFindingChange }) =>
		setFindings((previousFindings) =>
			previousFindings.map((finding) =>
				finding.findingId === findingId ? { ...finding, ...topicFindingChange } : finding,
			),
		),
	)
	return { findings, topicFeedHandlers }
}
