// the search MCP view through the test host: its table, its rows, and Follow

import { expect, test } from "bun:test"
import {
	FINDING_SEARCH_PAGE,
	FINDINGS_MCP_VIEW_DATA,
	FINDINGS_TOPIC,
	PERSONAL_ANNOTATION,
	TOPIC_POST_SEARCH_PAGE,
	TOPIC_SEARCH_PAGE,
	toMcpViewToolResult,
	USER_MCP_VIEW_DATA,
	VISITOR_MCP_VIEW_DATA,
} from "./mcpViewFixtures"
import { expectOneOpenRow, waitForRecord, withMcpView } from "./mcpViewTestHarness"
import type { OpenMcpViewOptions, ToolCallResponder } from "./mcpViewTestHost"

test("opening a search row closes the open row, and each row of one Finding opens alone", async () => {
	await withMcpView({ mcpView: "search" }, async ({ frame, sendToolResult }) => {
		const rows = FINDING_SEARCH_PAGE.rows.flatMap((row) => [row, { ...row, id: "finding-1-repeated" }])
		await sendToolResult(
			toMcpViewToolResult({ structuredContent: { ...FINDING_SEARCH_PAGE, rows }, mcpViewData: USER_MCP_VIEW_DATA }),
		)
		await expectOneOpenRow(frame)
	})
})

test("the search table opens a page and a sort through the search tool", async () => {
	const searchRequest = FINDING_SEARCH_PAGE.searchRequest
	const options: OpenMcpViewOptions = {
		mcpView: "search",
		respondToToolCall: (toolCall) =>
			toMcpViewToolResult({
				structuredContent: {
					...FINDING_SEARCH_PAGE,
					page: Number(toolCall.arguments?.page),
					rows: TOPIC_SEARCH_PAGE.rows,
				},
				mcpViewData: USER_MCP_VIEW_DATA,
			}),
	}
	await withMcpView(options, async ({ frame, toolCalls, sendToolResult }) => {
		const mcpViewData = USER_MCP_VIEW_DATA
		await sendToolResult(toMcpViewToolResult({ structuredContent: FINDING_SEARCH_PAGE, mcpViewData }))

		// a numbered page calls the search tool with that page, and shows what it returns
		await frame.getByRole("button", { name: "2", exact: true }).click()
		await frame.getByRole("button", { name: "Follow" }).waitFor()
		expect(toolCalls).toEqual([{ name: "search", arguments: { ...searchRequest, page: 2 } }])

		// a sort searches again from the first page
		await frame.getByRole("button", { name: "Sort" }).click()
		await frame.getByText("Newest").click()
		await waitForRecord(toolCalls, 2)
		expect(toolCalls.at(-1)).toEqual({
			name: "search",
			arguments: { ...searchRequest, page: 1, sort: "newest" },
		})
	})
})

test("a finding in the search table saves, expands, and names its Topic", async () => {
	const mcpViewData = { ...FINDINGS_MCP_VIEW_DATA, topic: undefined, topicFindings: undefined }
	await withMcpView({ mcpView: "search" }, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toMcpViewToolResult({ structuredContent: FINDING_SEARCH_PAGE, mcpViewData }))
		const findingRow = frame.getByRole("row").filter({ hasText: "Agents that read the docs" })

		// the row names its Topic, and expands to Carl's notes and the sender's private annotation
		await findingRow.getByRole("link", { name: FINDINGS_TOPIC.name }).waitFor()
		await findingRow.getByRole("button", { name: "Show Carl's notes" }).click()
		await frame.getByText(PERSONAL_ANNOTATION).waitFor()

		// the open row's thumbs save through their tool
		await frame.getByRole("button", { name: "Thumbs down" }).click()
		await waitForRecord(toolCalls)
		expect(toolCalls).toEqual([{ name: "rate_finding", arguments: { finding_id: "finding-1", rating: "down" } }])
	})
})

test("a Topic Post in the search table links to its page and names its Topic", async () => {
	await withMcpView({ mcpView: "search" }, async ({ frame, sendToolResult }) => {
		await sendToolResult(
			toMcpViewToolResult({ structuredContent: TOPIC_POST_SEARCH_PAGE, mcpViewData: VISITOR_MCP_VIEW_DATA }),
		)
		const topicPostRow = frame.getByRole("row").filter({ hasText: "What the evals missed" })

		// the title is the link, and the line names the kind and the Topic
		await topicPostRow.getByRole("link", { name: "What the evals missed" }).waitFor()
		await topicPostRow.getByRole("link", { name: "LLM tooling" }).waitFor()
		expect(await topicPostRow.getByText("Post", { exact: true }).count()).toBe(1)
	})
})

test("Follow calls the tool and flips the button, and a failed Follow keeps its state", async () => {
	// the first call fails and the second saves
	const toolResults = [{ content: [], isError: true }, { content: [] }]
	const respondToToolCall: ToolCallResponder = () => toolResults.shift() ?? { content: [] }
	await withMcpView({ mcpView: "search", respondToToolCall }, async ({ frame, sendToolResult, toolCalls }) => {
		await sendToolResult(toMcpViewToolResult({ structuredContent: TOPIC_SEARCH_PAGE, mcpViewData: USER_MCP_VIEW_DATA }))
		const followButton = frame.getByRole("button", { name: "Follow" })
		await followButton.click()
		await frame.getByText("Following could not be updated.").waitFor()
		expect(await followButton.getAttribute("aria-pressed")).toBe("false")

		// the second click saves
		await followButton.click()
		await frame.getByRole("button", { name: "Following" }).waitFor()
		expect(toolCalls.at(-1)).toEqual({
			name: "follow_topic",
			arguments: { topic_id: "topic-1", is_following: true },
		})
	})
})

test("a visitor's search shows no Follow", async () => {
	await withMcpView({ mcpView: "search" }, async ({ frame, sendToolResult }) => {
		const visitorRows = TOPIC_SEARCH_PAGE.rows.map((row) => ({ ...row, isSubscribed: null }))
		await sendToolResult(
			toMcpViewToolResult({
				structuredContent: { ...TOPIC_SEARCH_PAGE, rows: visitorRows },
				mcpViewData: VISITOR_MCP_VIEW_DATA,
			}),
		)
		await frame.getByText("LLM tooling").first().waitFor()
		expect(await frame.getByRole("button", { name: "Follow" }).count()).toBe(0)
	})
})
