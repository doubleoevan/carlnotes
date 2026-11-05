// tool registration tests: the tool list and its annotations, what every mcp client and its model read in the tool
// descriptions, and the follow tool's calls
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { MCP_VIEW_META_KEY } from "@carlnotes/contracts/mcpViews"
import { searchRequestPayload } from "@carlnotes/contracts/search"
import type { CallToolResult } from "@modelcontextprotocol/server"
import * as subscriptions from "../topic/subscriptions"
import { toMcpToolContractIssues } from "./mcpContractTestFixtures"
import * as mcpViewDataModule from "./mcpViewData"
import * as results from "./results"
import { CONNECT_ACCOUNT_TEXT } from "./results"
import * as searchResults from "./searchResults"
import type { ToolCaller } from "./toolCaller"
import { registerTools } from "./tools"

// a registered tool's title, description, and annotations, and its handler
type RegisteredToolConfig = {
	title?: string
	description?: string
	annotations?: { readOnlyHint?: boolean; destructiveHint?: boolean }
}
type RegisteredToolHandler = (toolArguments: Record<string, unknown>) => Promise<CallToolResult>

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

// the tools a caller gets, by name, each with its config and handler
function toRegisteredTools(
	toolCaller: ToolCaller,
): Map<string, { config: RegisteredToolConfig; handler: RegisteredToolHandler }> {
	// a fake server that keeps each registered tool by its name
	const registeredTools = new Map<string, { config: RegisteredToolConfig; handler: RegisteredToolHandler }>()
	const fakeMcpServer = {
		registerTool: (toolName: string, config: RegisteredToolConfig, handler: RegisteredToolHandler) => {
			registeredTools.set(toolName, { config, handler })
			return {}
		},
		registerResource: () => ({}),
	}
	registerTools({
		mcpServer: fakeMcpServer as unknown as Parameters<typeof registerTools>[0]["mcpServer"],
		toolCaller,
		routeTopicId: null,
		clientAddress: null,
	})
	return registeredTools
}

// a visitor, and a user connected through an app
const VISITOR: ToolCaller = { kind: "visitor", clientName: "test-app" }
const USER: ToolCaller = {
	kind: "user",
	userId: "user-1",
	plan: "free",
	clientName: "test-app",
	clientId: "test-client",
}

test.each([VISITOR, USER])("every tool has its directory title and safety hints for $kind", (toolCaller) => {
	const tools = [...toRegisteredTools(toolCaller)].map(([name, { config }]) => ({ name, ...config }))
	expect(toMcpToolContractIssues(tools)).toEqual([])
})

test.each([
	{ title: "" },
	{ title: undefined },
	{ annotations: { readOnlyHint: true, destructiveHint: true } },
	{ annotations: { readOnlyHint: false, destructiveHint: false } },
	{ annotations: { readOnlyHint: false, destructiveHint: "true" } },
])("the directory check rejects a broken write annotation %j", (brokenConfig) => {
	// corrupt an actual registration while retaining the other tools
	const tools = [...toRegisteredTools(VISITOR)].map(([name, { config }]) => ({
		name,
		...config,
		...(name === "edit_topic" ? brokenConfig : {}),
	}))
	expect(toMcpToolContractIssues(tools).some((issue) => issue.startsWith("edit_topic:"))).toBe(true)
})

test("the directory check rejects unexpected tools", () => {
	// a newly advertised tool must receive an intentional classification
	const tools = [...toRegisteredTools(VISITOR)].map(([name, { config }]) => ({ name, ...config }))
	tools.push({ name: "unclassified_tool", title: "Unclassified", annotations: { readOnlyHint: true } })
	expect(toMcpToolContractIssues(tools).join("\n")).toContain("unclassified_tool")
})

// every tool description speaks to the client, and none names an internal identifier
test("the tool descriptions address the client and name no internal identifier", () => {
	const registeredTools = toRegisteredTools(VISITOR)
	expect(registeredTools.get("list_topics")?.config.description).toStartWith("The topics you may read")
	const toolsNamingAnIdentifier = [...registeredTools]
		.filter(([, { config }]) => /toolCaller|is_following|topicEdit|subscri/.test(config.description ?? ""))
		.map(([toolName]) => toolName)
	expect(toolsNamingAnIdentifier).toEqual([])
})

test("following a topic calls the page's subscribe write with the mcp source", async () => {
	const setTopicSubscriptionSpy = spyOn(subscriptions, "setTopicSubscription").mockResolvedValue(true)
	const subscriptionTool = toRegisteredTools(USER).get("follow_topic")?.handler as RegisteredToolHandler

	// follow, then unfollow
	const subscriptionResult = await subscriptionTool({ topic_id: "topic-1", is_following: true })
	expect(subscriptionResult.structuredContent).toEqual({ topicId: "topic-1", isFollowing: true })
	await subscriptionTool({ topic_id: "topic-1", is_following: false })
	expect(
		setTopicSubscriptionSpy.mock.calls.map(([options]) => [options.isSubscribed, options.subscriptionSource]),
	).toEqual([
		[true, "mcp"],
		[false, "mcp"],
	])
})

test("a visitor cannot follow, and an owner's unfollow says the owner always follows", async () => {
	// a visitor is told what an account enables, and nothing is written
	const setTopicSubscriptionSpy = spyOn(subscriptions, "setTopicSubscription").mockResolvedValue(false)
	const visitorSubscriptionTool = toRegisteredTools(VISITOR).get("follow_topic")?.handler as RegisteredToolHandler
	const visitorResult = await visitorSubscriptionTool({ topic_id: "topic-1", is_following: true })
	expect(visitorResult.content).toEqual([{ type: "text", text: CONNECT_ACCOUNT_TEXT }])
	expect(setTopicSubscriptionSpy).not.toHaveBeenCalled()

	// an owner's unfollow is rejected by the write, and the result says why
	const userSubscriptionTool = toRegisteredTools(USER).get("follow_topic")?.handler as RegisteredToolHandler
	const ownerResult = await userSubscriptionTool({ topic_id: "topic-1", is_following: false })
	expect(ownerResult.isError).toBe(true)
	expect(JSON.stringify(ownerResult.content)).toContain("An owner always follows their own topic.")
})

// a client that renders no MCP view reads the same structured result and text, and the MCP view's data goes separately in _meta
test("each MCP view tool returns its structured result and text, with or without the MCP view's data", async () => {
	// a search page, a feed page, and the MCP view data each may have
	const searchPage = {
		rows: [],
		rowCount: 0,
		page: 1,
		pageCount: 1,
		pageSize: 10,
		podcastEpisodes: [],
		searchRequest: searchRequestPayload.parse({ q: "orbit", kinds: ["teams"] }),
		searchUrl: "https://carlnotes.test/search?q=orbit",
	}
	const feedPage = { items: [], nextCursor: null }
	const mcpViewData = { session: null, podcastEpisodes: [] }
	spyOn(searchResults, "searchForTool").mockResolvedValue(searchPage)
	spyOn(results, "readTopicFeed").mockResolvedValue(feedPage)
	const loadSearchMcpViewDataSpy = spyOn(mcpViewDataModule, "loadSearchMcpViewData").mockResolvedValue(mcpViewData)
	const loadFindingsMcpViewDataSpy = spyOn(mcpViewDataModule, "loadFindingsMcpViewData").mockResolvedValue(mcpViewData)

	// the search and the feed read, with the MCP view's data
	const registeredTools = toRegisteredTools(VISITOR)
	const searchResult = await registeredTools.get("search")?.handler({ q: "orbit", kinds: ["teams"] })
	const feedResult = await registeredTools.get("read_topic_feed")?.handler({ topic_id: "topic-1" })
	expect(searchResult?.structuredContent).toEqual(searchPage)
	expect(searchResult?._meta).toEqual({ [MCP_VIEW_META_KEY]: mcpViewData })
	expect(feedResult?.structuredContent).toEqual(feedPage)

	// the feed read with no MCP view data returns the same structured result and text
	loadFindingsMcpViewDataSpy.mockResolvedValue(null)
	const feedResultWithoutMcpView = await registeredTools.get("read_topic_feed")?.handler({ topic_id: "topic-1" })
	expect(feedResultWithoutMcpView?.structuredContent).toEqual(feedResult?.structuredContent)
	expect(feedResultWithoutMcpView?.content).toEqual(feedResult?.content)
	expect(feedResultWithoutMcpView?._meta).toBeUndefined()
	expect(loadSearchMcpViewDataSpy).toHaveBeenCalledTimes(1)
})

test("every tool that names an MCP view names one of the four", () => {
	const mcpViewToolNames = [...toRegisteredTools(VISITOR)]
		.filter(([, { config }]) => (config as { _meta?: { ui?: { resourceUri?: string } } })._meta?.ui?.resourceUri)
		.map(([toolName, { config }]) => [
			toolName,
			(config as { _meta: { ui: { resourceUri: string } } })._meta.ui.resourceUri,
		])
	expect(mcpViewToolNames).toEqual([
		["read_topic_feed", "ui://carlnotes/findings.html?v=9"],
		["search_topic_findings", "ui://carlnotes/findings.html?v=9"],
		["search", "ui://carlnotes/search.html?v=9"],
		["edit_topic", "ui://carlnotes/topic.html?v=9"],
		["create_topic", "ui://carlnotes/topic.html?v=9"],
		["send_to_topic", "ui://carlnotes/topic.html?v=9"],
		["suggest_topics", "ui://carlnotes/suggest-topics.html?v=9"],
	])
})
