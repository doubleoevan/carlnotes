// the directory contract shared by offline registration tests and live mcp smoke checks

// each advertised tool's safety hints. new tools require an explicit classification
const EXPECTED_TOOL_ANNOTATIONS = {
	list_topics: { readOnlyHint: true },
	read_topic_feed: { readOnlyHint: true },
	search_topic_findings: { readOnlyHint: true },
	search: { readOnlyHint: true },
	mark_finding_consumed: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	rate_finding: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	bookmark_finding: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	follow_topic: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	edit_topic: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	suggest_sources: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
	create_topic: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	set_topic_image: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
	add_topic_attachment: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
	read_notes: { readOnlyHint: true, destructiveHint: false },
	save_note: { readOnlyHint: false, destructiveHint: true, idempotentHint: false },
	delete_note: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
	list_teams: { readOnlyHint: true, destructiveHint: false },
	read_team: { readOnlyHint: true, destructiveHint: false },
	request_to_join_team: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	send_invite: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	respond_to_invite: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	post_to_team_room: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	read_profile: { readOnlyHint: true, destructiveHint: false },
	read_activity: { readOnlyHint: true, destructiveHint: false },
	read_account: { readOnlyHint: true, destructiveHint: false },
	report_content: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	block_user: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	send_to_topic: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	suggest_topics: { readOnlyHint: true, destructiveHint: false },
	read_updates: { readOnlyHint: false, destructiveHint: false },
	start_scan: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
	read_scan_status: { readOnlyHint: true },
	stop_scan: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	read_topic_context: { readOnlyHint: true },
	send_finding_feedback: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	save_reaction: { readOnlyHint: false, destructiveHint: false, idempotentHint: true },
	read_hot_takes: { readOnlyHint: true },
	post_hot_take: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
	delete_hot_take: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
	read_news: { readOnlyHint: true },
	read_topic_posts: { readOnlyHint: true },
	read_topic_post: { readOnlyHint: true },
	read_dashboard: { readOnlyHint: true },
}

// the writes that delete or overwrite what the caller cannot get back, which the host confirms. every other write is
// additive or can be undone, and is never destructive
const IRREVERSIBLE_TOOL_NAMES = new Set(["save_note", "delete_note", "delete_hot_take", "set_topic_image"])

// each advertised tool's phrases, which its description lists so a model finds the tool from the user's words
const EXPECTED_TOOL_PHRASES: Record<string, readonly string[]> = {
	list_topics: [
		"list my topics",
		"what topics do I follow",
		"what is popular",
		"topics like this one",
		"what does Carl cover",
	],
	read_topic_feed: ["show this topic", "what did Carl find", "read my feed"],
	search_topic_findings: ["search this topic", "what does Carl have on"],
	search: ["search CarlNotes", "find a topic", "look up a podcast episode"],
	mark_finding_consumed: ["mark this read", "I read this"],
	rate_finding: ["thumbs up", "thumbs down", "more like this"],
	bookmark_finding: ["bookmark this", "keep this finding"],
	follow_topic: ["follow this topic", "unfollow this topic"],
	edit_topic: [
		"edit this topic",
		"change the prompt",
		"add a source",
		"change the schedule",
		"add this topic to my team",
	],
	suggest_sources: ["suggest sources", "find sources for this topic"],
	create_topic: ["create a topic", "start a topic", "have Carl track this"],
	set_topic_image: ["change the topic image", "regenerate the image", "use this picture"],
	add_topic_attachment: ["attach this page", "attach this to the topic", "save this text to the topic"],
	read_notes: ["read my notes", "open a note", "show the tasting notes"],
	save_note: ["write a note", "add a tasting note", "edit my note"],
	delete_note: ["delete my note", "remove this note"],
	list_teams: ["list my teams", "which teams am I on"],
	read_team: ["my team", "read a team", "team chat"],
	request_to_join_team: ["join this team", "ask to join a team"],
	send_invite: ["invite someone", "invite a friend to my team", "share this topic with a person"],
	respond_to_invite: ["accept an invite", "decline an invite"],
	post_to_team_room: ["post in the team chat", "tell my team", "reply in the team chat"],
	read_profile: ["show my Café", "open someone's profile", "what is on this profile"],
	read_activity: ["my activity", "my invites", "what topics do I follow"],
	read_account: ["my plan", "my usage", "how much budget is left"],
	report_content: ["report this", "flag this", "report this person"],
	block_user: ["block this person", "unblock someone", "stop seeing someone"],
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
	delete_hot_take: ["delete my hot take", "remove this comment", "take down a reply on my topic"],
	read_news: ["Brews News", "what happened this week", "who mentioned me"],
	read_topic_posts: ["Open Mic", "a topic's posts"],
	read_topic_post: ["Open Mic", "a topic's posts"],
	read_dashboard: ["Specials", "how are my topics doing", "how is my podcast doing"],
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

	// a write is destructive exactly if it is irreversible
	const isWrite = tool.annotations?.readOnlyHint === false
	const isIrreversible = IRREVERSIBLE_TOOL_NAMES.has(tool.name)
	if (isWrite && tool.annotations?.destructiveHint !== isIrreversible) {
		issues.push(
			`${tool.name}: destructiveHint must be ${isIrreversible} for a write that is ${isIrreversible ? "irreversible" : "additive"}`,
		)
	}

	// check optional hints even when the matrix does not prescribe their values
	for (const hint of ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]) {
		if (tool.annotations?.[hint] !== undefined && typeof tool.annotations[hint] !== "boolean") {
			issues.push(`${tool.name}: ${hint} must be boolean`)
		}
	}
	return issues
}
