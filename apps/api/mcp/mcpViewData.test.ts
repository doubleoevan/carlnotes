// the private annotations in an MCP view's data: only the sender's MCP view holds them, and the model never reads them
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { MCP_VIEW_META_KEY, type McpSearchPage } from "@carlnotes/contracts/mcpViews"
import { searchRequestPayload } from "@carlnotes/contracts/search"
import { toTestTopicFinding } from "@carlnotes/contracts/topicFeedTestFixtures"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as findingPersonalAnnotations from "@carlnotes/db/findingPersonalAnnotations"
import type { CallToolResult } from "@modelcontextprotocol/server"
import * as podcastEpisodeShapes from "../podcast/podcastEpisodeShapes"
import * as accessibleFindings from "../topic/accessibleFindings"
import * as findingPermissions from "../topic/findingPermissions"
import * as permissions from "../topic/permissions"
import * as results from "./results"
import * as searchResults from "./searchResults"
import type { ToolCaller } from "./toolCaller"
import { toRegisteredTools, USER, VISITOR } from "./toolTestFixtures"

// the sender's private annotation, which no other caller may ever receive
const PRIVATE_CANARY = "private-canary-a-note-only-the-sender-reads"
const SENDER_USER_ID = "user-1"
const OTHER_USER: ToolCaller = {
	kind: "user",
	userId: "user-2",
	plan: "free",
	clientName: "test-app",
	clientId: "test-client",
}

// a Topic and one Finding that the sender wrote an annotation on
const TOPIC = {
	id: "topic-1",
	name: "LLM tooling",
	prompt: "Releases of the tools that run language models.",
	visibility: "public",
}
const TOPIC_FINDING = toTestTopicFinding({ findingId: "finding-1" })

// a search page with that Finding
const SEARCH_PAGE = {
	rows: [
		{
			kind: "finding",
			id: TOPIC_FINDING.findingId,
			name: "A better cup",
			path: "/topics/topic-1",
			date: null,
			count: null,
			finding: TOPIC_FINDING,
			topic: { ...TOPIC, canRate: true, canBookmark: true },
			url: "https://carlnotes.test/topics/topic-1",
		},
	],
	rowCount: 1,
	page: 1,
	pageCount: 1,
	pageSize: 10,
	podcastEpisodes: [],
	searchRequest: searchRequestPayload.parse({ q: "cup" }),
	searchUrl: "https://carlnotes.test/search?q=cup",
} as McpSearchPage

// put the spies and the connection pool back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

// the reads behind both tools, with a store that holds the sender's annotation alone
function stubMcpViewReads(): void {
	stubConnectionPool(() => [])
	spyOn(findingPersonalAnnotations, "loadFindingPersonalAnnotations").mockImplementation(
		async ({ userId, findingIds }) =>
			new Map(userId === SENDER_USER_ID ? findingIds.map((findingId) => [findingId, PRIVATE_CANARY]) : []),
	)
	spyOn(results, "loadVisibleTopic").mockResolvedValue(TOPIC as never)
	spyOn(results, "readTopicFeed").mockResolvedValue({
		items: [{ findingId: TOPIC_FINDING.findingId }],
		nextCursor: null,
	} as never)
	spyOn(accessibleFindings, "loadTopicAccessAndFindings").mockResolvedValue({ topicFindings: [TOPIC_FINDING] } as never)
	spyOn(podcastEpisodeShapes, "loadLatestPodcastEpisodeSummaries").mockResolvedValue(new Map())
	spyOn(permissions, "hasSubscription").mockResolvedValue(false)
	spyOn(findingPermissions, "canRateTopic").mockResolvedValue(true)
	spyOn(findingPermissions, "canBookmarkTopic").mockResolvedValue(true)
	spyOn(searchResults, "searchForTool").mockResolvedValue(SEARCH_PAGE)
}

// call the tool that opens one of the two tables for a caller
async function toToolResult(toolName: "read_topic_feed" | "search", toolCaller: ToolCaller): Promise<CallToolResult> {
	const toolArguments = toolName === "search" ? { q: "cup" } : { topic_id: TOPIC.id }
	const toolResult = await toRegisteredTools(toolCaller).get(toolName)?.handler(toolArguments)
	if (!toolResult) {
		throw new Error(`The ${toolName} tool is not registered`)
	}
	return toolResult
}

test.each(["read_topic_feed", "search"] as const)(
	"only the sender's %s MCP view holds their note",
	async (toolName) => {
		stubMcpViewReads()

		// the sender's MCP view holds the note, and what the model reads does not
		const senderResult = await toToolResult(toolName, USER)
		expect(senderResult._meta?.[MCP_VIEW_META_KEY]).toMatchObject({
			personalAnnotations: { [TOPIC_FINDING.findingId]: PRIVATE_CANARY },
		})
		expect(JSON.stringify(senderResult.content)).not.toContain(PRIVATE_CANARY)
		expect(JSON.stringify(senderResult.structuredContent)).not.toContain(PRIVATE_CANARY)

		// no other caller's result holds it anywhere
		const otherResults = [await toToolResult(toolName, OTHER_USER), await toToolResult(toolName, VISITOR)]
		expect(JSON.stringify(otherResults)).not.toContain(PRIVATE_CANARY)
	},
)

test.each(["read_topic_feed", "search"] as const)("a visitor's %s reads no private note", async (toolName) => {
	stubMcpViewReads()
	const loadFindingPersonalAnnotationsSpy = spyOn(findingPersonalAnnotations, "loadFindingPersonalAnnotations")
	await toToolResult(toolName, VISITOR)
	expect(loadFindingPersonalAnnotationsSpy).not.toHaveBeenCalled()
})
