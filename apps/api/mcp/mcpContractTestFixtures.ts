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
	send_to_topic: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	suggest_topics: { readOnlyHint: true, destructiveHint: false },
	read_updates: { readOnlyHint: false, destructiveHint: false },
	start_scan: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
	read_scan_status: { readOnlyHint: true },
	stop_scan: { readOnlyHint: false, destructiveHint: true },
	read_topic_context: { readOnlyHint: true },
	send_finding_feedback: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	save_reaction: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
	read_hot_takes: { readOnlyHint: true },
	post_hot_take: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
}

// each advertised tool's phrases, which its description lists so a model finds the tool from the user's words
const EXPECTED_TOOL_PHRASES: Record<string, readonly string[]> = {
	list_topics: ["list my topics", "what topics do I follow", "what does Carl cover"],
	read_topic_feed: ["show this topic", "what did Carl find", "read my feed"],
	search_topic_findings: ["search this topic", "what does Carl have on"],
	search: ["search CarlNotes", "find a topic", "look up a podcast episode"],
	mark_finding_consumed: ["mark this read", "I read this"],
	rate_finding: ["thumbs up", "thumbs down", "more like this"],
	bookmark_finding: ["bookmark this", "keep this finding"],
	follow_topic: ["follow this topic", "unfollow this topic"],
	edit_topic: ["edit this topic", "change the prompt", "add a source", "change the schedule"],
	suggest_sources: ["suggest sources", "find sources for this topic"],
	create_topic: ["create a topic", "start a topic", "have Carl track this"],
	send_to_topic: [
		"send this to Carl",
		"save this to CarlNotes",
		"add this to my topic",
		"share this with Carl",
		"forward this to Carl",
	],
	suggest_topics: ["send this to Carl", "save this to my topics"],
	read_updates: ["what's new", "catch me up", "update me", "what's new on a topic"],
	start_scan: ["brew this topic now", "run this topic now"],
	read_scan_status: ["how is the brew going", "is Carl done", "show the latest brew"],
	stop_scan: ["stop the brew", "cancel this brew"],
	read_topic_context: ["ask Carl about this topic", "what does Carl know about", "what's the latest on"],
	send_finding_feedback: ["tell Carl why", "give Carl feedback"],
	save_reaction: ["react to this", "like this finding"],
	read_hot_takes: ["what are people saying", "read the hot takes", "read the conversation"],
	post_hot_take: ["leave a hot take", "post a comment", "reply to the conversation"],
}

// wording that asks a model to act unprompted. a sentence that opens with Never forbids it instead
const AUTONOMOUS_INITIATION_PATTERN =
	/proactively|on your own initiative|unprompted|without being asked|automatically call|at the start of (every|each)/i

// unknown field values let the checks reject malformed hints as well as missing ones
type ListedTool = { name: string; title?: unknown; description?: unknown; annotations?: Record<string, unknown> }

/** Names every tool whose title, description, safety hints, or inventory position violates the directory contract. */
export function toMcpToolContractIssues(tools: readonly ListedTool[]): string[] {
	// compare the entire inventory, including order, duplicates, and unexpected tools
	const issues: string[] = []
	const expectedNames = Object.keys(EXPECTED_TOOL_ANNOTATIONS)
	const toolNames = tools.map((tool) => tool.name)
	if (JSON.stringify(toolNames) !== JSON.stringify(expectedNames)) {
		issues.push(`tool inventory: ${toolNames.join(", ")}`)
	}

	return [...issues, ...tools.flatMap(toToolIssues), ...tools.flatMap(toDescriptionIssues)]
}

// require both names and every phrase in a description, and reject one that asks a model to act unprompted
function toDescriptionIssues(tool: ListedTool): string[] {
	const description = typeof tool.description === "string" ? tool.description : ""
	const missingNames = ["Carl", "CarlNotes"].filter((name) => !new RegExp(`\\b${name}\\b`).test(description))
	const missingPhrases = (EXPECTED_TOOL_PHRASES[tool.name] ?? []).filter(
		(phrase) => !description.toLowerCase().includes(phrase.toLowerCase()),
	)
	const issues = [...missingNames, ...missingPhrases].map(
		(missingWords) => `${tool.name}: description must name "${missingWords}"`,
	)

	// read only the sentences that do not forbid the wording
	const permittingText = description
		.split(/(?<=[.!?])\s+/)
		.filter((sentence) => !sentence.startsWith("Never"))
		.join(" ")
	// flag a permitting sentence that asks for autonomous initiation
	if (AUTONOMOUS_INITIATION_PATTERN.test(permittingText)) {
		issues.push(`${tool.name}: description must not ask for autonomous initiation`)
	}
	return issues
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
