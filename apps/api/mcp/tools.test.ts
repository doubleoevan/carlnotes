// tool registration tests: the tool list and its annotations, what every mcp client and its model read in the tool
// descriptions, and the follow tool's calls
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { MCP_CARD_META_KEY } from "@carlnotes/contracts/mcpCards"
import { searchRequestPayload } from "@carlnotes/contracts/search"
import type { CallToolResult } from "@modelcontextprotocol/server"
import * as subscriptions from "../topic/subscriptions"
import * as cardDataModule from "./cardData"
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
const USER: ToolCaller = { kind: "user", userId: "user-1", plan: "free", clientName: "test-app" }

test("the tool list is the reads, the per-user writes, and the topic tools", () => {
	expect([...toRegisteredTools(VISITOR).keys()]).toEqual([
		"list_topics",
		"read_topic_feed",
		"search_topic_findings",
		"search",
		"mark_finding_consumed",
		"rate_finding",
		"bookmark_finding",
		"follow_topic",
		"edit_topic",
		"suggest_sources",
		"create_topic",
	])
})

test("the reads are read-only and the topic edits destructive", () => {
	// the reads have the read-only hint
	const registeredTools = toRegisteredTools(VISITOR)
	for (const readToolName of ["list_topics", "read_topic_feed", "search_topic_findings", "search"]) {
		expect(registeredTools.get(readToolName)?.config.annotations?.readOnlyHint).toBe(true)
	}

	// the topic edits are destructive, and a follow is not
	for (const editToolName of ["edit_topic", "create_topic"]) {
		expect(registeredTools.get(editToolName)?.config.annotations?.destructiveHint).toBe(true)
	}
	expect(registeredTools.get("follow_topic")?.config.annotations?.destructiveHint).toBe(false)
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

// a client that renders no card reads the same structured result and text, and the card's data goes separately in _meta
test("each card tool returns its structured result and text, with or without the card's data", async () => {
	// a search page, a feed page, and the card data each may have
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
	const cardData = { session: null, podcastEpisodes: [] }
	spyOn(searchResults, "searchForTool").mockResolvedValue(searchPage)
	spyOn(results, "readTopicFeed").mockResolvedValue(feedPage)
	const loadSearchCardDataSpy = spyOn(cardDataModule, "loadSearchCardData").mockResolvedValue(cardData)
	const loadFindingsCardDataSpy = spyOn(cardDataModule, "loadFindingsCardData").mockResolvedValue(cardData)

	// the search and the feed read, with the card's data
	const registeredTools = toRegisteredTools(VISITOR)
	const searchResult = await registeredTools.get("search")?.handler({ q: "orbit", kinds: ["teams"] })
	const feedResult = await registeredTools.get("read_topic_feed")?.handler({ topic_id: "topic-1" })
	expect(searchResult?.structuredContent).toEqual(searchPage)
	expect(searchResult?._meta).toEqual({ [MCP_CARD_META_KEY]: cardData })
	expect(feedResult?.structuredContent).toEqual(feedPage)

	// the feed read with no card data returns the same structured result and text
	loadFindingsCardDataSpy.mockResolvedValue(null)
	const feedResultWithoutCard = await registeredTools.get("read_topic_feed")?.handler({ topic_id: "topic-1" })
	expect(feedResultWithoutCard?.structuredContent).toEqual(feedResult?.structuredContent)
	expect(feedResultWithoutCard?.content).toEqual(feedResult?.content)
	expect(feedResultWithoutCard?._meta).toBeUndefined()
	expect(loadSearchCardDataSpy).toHaveBeenCalledTimes(1)
})

test("every tool that names a card names one of the three", () => {
	const cardToolNames = [...toRegisteredTools(VISITOR)]
		.filter(([, { config }]) => (config as { _meta?: { ui?: { resourceUri?: string } } })._meta?.ui?.resourceUri)
		.map(([toolName, { config }]) => [
			toolName,
			(config as { _meta: { ui: { resourceUri: string } } })._meta.ui.resourceUri,
		])
	expect(cardToolNames).toEqual([
		["read_topic_feed", "ui://carlnotes/findings.html"],
		["search_topic_findings", "ui://carlnotes/findings.html"],
		["search", "ui://carlnotes/search.html"],
		["edit_topic", "ui://carlnotes/topic.html"],
		["create_topic", "ui://carlnotes/topic.html"],
	])
})
