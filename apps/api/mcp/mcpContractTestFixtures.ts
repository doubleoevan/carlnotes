// the directory contract shared by offline registration tests and live mcp smoke checks

// each advertised tool's safety hints. new tools require an explicit classification
const EXPECTED_TOOL_ANNOTATIONS = {
	list_topics: { readOnlyHint: true },
	read_topic_feed: { readOnlyHint: true },
	search_topic_findings: { readOnlyHint: true },
	search: { readOnlyHint: true },
	mark_finding_consumed: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
	rate_finding: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
	bookmark_finding: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
	follow_topic: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
	edit_topic: { readOnlyHint: false, destructiveHint: true },
	suggest_sources: { readOnlyHint: false, destructiveHint: true, openWorldHint: true },
	create_topic: { readOnlyHint: false, destructiveHint: true },
}

// unknown field values let the checks reject malformed hints as well as missing ones
type ListedTool = { name: string; title?: unknown; annotations?: Record<string, unknown> }

/** Names every tool whose title, safety hints, or inventory position violates the directory contract. */
export function toMcpToolContractIssues(tools: readonly ListedTool[]): string[] {
	// compare the entire inventory, including order, duplicates, and unexpected tools
	const issues: string[] = []
	const expectedNames = Object.keys(EXPECTED_TOOL_ANNOTATIONS)
	const toolNames = tools.map((tool) => tool.name)
	if (JSON.stringify(toolNames) !== JSON.stringify(expectedNames)) {
		issues.push(`tool inventory: ${toolNames.join(", ")}`)
	}

	return [...issues, ...tools.flatMap(toToolIssues)]
}

// require each title and each classified boolean, with a diagnostic naming the tool
function toToolIssues(tool: ListedTool): string[] {
	const issues: string[] = []
	if (typeof tool.title !== "string" || !tool.title.trim()) {
		issues.push(`${tool.name}: missing title`)
	}

	// compare required hints with their exact values, then reject any optional non-boolean hint
	const expectedHints = Object.entries(EXPECTED_TOOL_ANNOTATIONS).find(([name]) => name === tool.name)?.[1]
	for (const [hint, expectedValue] of Object.entries(expectedHints ?? {})) {
		if (tool.annotations?.[hint] !== expectedValue) {
			issues.push(`${tool.name}: ${hint} must be ${expectedValue}`)
		}
	}

	// check optional hints even when the matrix does not prescribe their values
	for (const hint of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]) {
		if (tool.annotations?.[hint] !== undefined && typeof tool.annotations[hint] !== "boolean") {
			issues.push(`${tool.name}: ${hint} must be boolean`)
		}
	}
	return issues
}
