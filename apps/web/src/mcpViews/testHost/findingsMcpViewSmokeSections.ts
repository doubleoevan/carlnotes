// the findings MCP view through the test host: its rows, their controls, paging, and a visitor's table

import { expect, test } from "bun:test"
import { toTestReactionSummary } from "@carlnotes/contracts/socialTestFixtures"
import { toTestTopicFinding } from "@carlnotes/contracts/topicFeedTestFixtures"
import { EMPTY_FILTERED_FINDINGS } from "@carlnotes/core/lib/topicFeedLabels"
import {
	FINDINGS_MCP_VIEW_DATA,
	FINDINGS_TOPIC,
	LONG_FINDINGS_MCP_VIEW_DATA,
	PERSONAL_ANNOTATION,
	TOPIC_FINDINGS,
	toMcpViewToolResult,
	USER_MCP_VIEW_DATA,
	VISITOR_FINDINGS_TOPIC,
	VISITOR_MCP_VIEW_DATA,
} from "./mcpViewFixtures"
import { expectOneOpenRow, NARROW_FRAME_WIDTH, waitForRecord, withMcpView } from "./mcpViewTestHarness"
import type { OpenMcpViewOptions, ToolCallResponder } from "./mcpViewTestHost"

test("an open row's thumbs, bookmark, and read toggle call their tools and show the change", async () => {
	await withMcpView({ mcpView: "findings" }, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toMcpViewToolResult({ mcpViewData: FINDINGS_MCP_VIEW_DATA }))
		const findingRow = frame.getByRole("row").filter({ hasText: "Agents that read the docs" })

		// a closed row holds the expand button and no finding controls
		expect(await frame.getByRole("button", { name: "Thumbs up" }).count()).toBe(0)
		await findingRow.getByRole("button", { name: "Show Carl's notes" }).click()
		const detailsRow = frame.getByRole("row").filter({ hasText: "Carl's take:" })

		// a rating saves through its tool and presses the thumb
		await detailsRow.getByRole("button", { name: "Thumbs up" }).click()
		await detailsRow.locator('button[aria-label^="Thumbs up"][aria-pressed="true"]').waitFor()

		// a bookmark saves through its tool and flips its label
		await detailsRow.getByRole("button", { name: "Bookmark", exact: true }).click()
		await detailsRow.getByRole("button", { name: "Remove bookmark" }).waitFor()

		// the read toggle saves through its tool, and an MCP view never marks a finding unread
		await detailsRow.getByRole("button", { name: "Mark read" }).click()
		await detailsRow.getByRole("button", { name: "Mark unread" }).and(frame.locator("button:disabled")).waitFor()
		expect(toolCalls).toEqual([
			{ name: "rate_finding", arguments: { finding_id: "finding-1", rating: "up" } },
			{ name: "bookmark_finding", arguments: { finding_id: "finding-1", is_bookmarked: true } },
			{ name: "mark_finding_consumed", arguments: { finding_id: "finding-1" } },
		])
	})
})

test("a finding's row expands to Carl's notes and the sender's note, and its feedback goes to its tool", async () => {
	await withMcpView({ mcpView: "findings" }, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toMcpViewToolResult({ mcpViewData: FINDINGS_MCP_VIEW_DATA }))
		const findingRow = frame.getByRole("row").filter({ hasText: "Agents that read the docs" })

		// the row holds neither note until it expands
		expect(await frame.getByText(PERSONAL_ANNOTATION).count()).toBe(0)
		await findingRow.getByRole("button", { name: "Show Carl's notes" }).click()
		await frame.getByText("Carl's take:").waitFor()
		await frame.getByText(PERSONAL_ANNOTATION).waitFor()

		// the thumb beside the box sends its words, and one line of thanks replaces the box
		const detailsRow = frame.getByRole("row").filter({ hasText: "Carl's take:" })
		await detailsRow.getByRole("textbox", { name: "Feedback for Carl" }).fill("Too basic for me")
		await detailsRow.getByRole("button", { name: "Thumbs down" }).click()
		await detailsRow.getByText("Noted. Carl reads these later.").waitFor()
		expect(toolCalls).toEqual([
			{ name: "rate_finding", arguments: { finding_id: "finding-1", rating: "down" } },
			{ name: "send_finding_feedback", arguments: { finding_id: "finding-1", feedback: "Too basic for me" } },
		])

		// a second click closes the row
		await findingRow.getByRole("button", { name: "Hide Carl's notes" }).click()
		await frame.getByText(PERSONAL_ANNOTATION).waitFor({ state: "detached" })
	})
})

test("an open row shows the finding's reactions, and a press on a type saves through its tool", async () => {
	// the first finding came with two types chosen, and the save returns one more Like as the user's
	const reactionSummary = toTestReactionSummary()
	const savedSummary = toTestReactionSummary({
		counts: [
			{ reactionType: "like", count: 5, users: [] },
			{ reactionType: "insightful", count: 2, users: [] },
		],
		ownReactionType: "like",
	})
	const respondToToolCall: ToolCallResponder = () =>
		toMcpViewToolResult({ mcpViewData: { ...USER_MCP_VIEW_DATA, reactionSummary: savedSummary } })
	const mcpViewData = {
		...FINDINGS_MCP_VIEW_DATA,
		topicFindings: [
			toTestTopicFinding({ findingId: "finding-1", title: "Agents that read the docs", reactions: reactionSummary }),
		],
	}
	await withMcpView({ mcpView: "findings", respondToToolCall }, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toMcpViewToolResult({ mcpViewData }))
		await frame.getByRole("button", { name: "Show Carl's notes" }).click()

		// the counts show
		const detailsRow = frame.getByRole("row").filter({ hasText: "Carl's take:" })
		await detailsRow.getByRole("button", { name: "Like, 4" }).waitFor()

		// the press calls the tool with the finding and the type, and the row shows the summary the tool returned
		await detailsRow.getByRole("button", { name: "Like, 4" }).click()
		await detailsRow.getByRole("button", { name: "Like, 5, your reaction" }).waitFor()
		expect(toolCalls).toEqual([
			{
				name: "save_reaction",
				arguments: { target_kind: "finding", target_id: "finding-1", reaction_type: "like" },
			},
		])
	})
})

test("a failed feedback send keeps the words in the box to send again", async () => {
	const respondToToolCall: ToolCallResponder = ({ name }) => ({
		content: [],
		isError: name === "send_finding_feedback",
	})
	await withMcpView({ mcpView: "findings", respondToToolCall }, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toMcpViewToolResult({ mcpViewData: FINDINGS_MCP_VIEW_DATA }))
		const findingRow = frame.getByRole("row").filter({ hasText: "Agents that read the docs" })
		await findingRow.getByRole("button", { name: "Show Carl's notes" }).click()

		// the thumb sends the box's words
		const detailsRow = frame.getByRole("row").filter({ hasText: "Carl's take:" })
		const feedbackBox = detailsRow.getByRole("textbox", { name: "Feedback for Carl" })
		await feedbackBox.fill("Too basic for me")
		await detailsRow.getByRole("button", { name: "Thumbs down" }).click()
		await waitForRecord(toolCalls, 2)

		// the box keeps its words, and no thanks replaces it
		await detailsRow.getByRole("button", { name: "Thumbs down" }).waitFor()
		expect(await feedbackBox.inputValue()).toBe("Too basic for me")
		expect(await detailsRow.getByText("Noted. Carl reads these later.").count()).toBe(0)
	})
})

test("sent feedback goes once, and a later thumb changes only the rating", async () => {
	await withMcpView({ mcpView: "findings" }, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toMcpViewToolResult({ mcpViewData: FINDINGS_MCP_VIEW_DATA }))
		const findingRow = frame.getByRole("row").filter({ hasText: "Agents that read the docs" })
		await findingRow.getByRole("button", { name: "Show Carl's notes" }).click()

		// the first thumb sends the box's words and the thanks replaces the box
		const detailsRow = frame.getByRole("row").filter({ hasText: "Carl's take:" })
		await detailsRow.getByRole("textbox", { name: "Feedback for Carl" }).fill("Too basic for me")
		await detailsRow.getByRole("button", { name: "Thumbs down" }).click()
		await detailsRow.getByText("Noted. Carl reads these later.").waitFor()

		// the second thumb saves its rating and sends no words
		await detailsRow.getByRole("button", { name: "Thumbs up" }).click()
		await waitForRecord(toolCalls, 3)
		expect(toolCalls.filter(({ name }) => name === "send_finding_feedback")).toHaveLength(1)
	})
})

test("a page that did not load keeps the shown page, and the next try clears the failure line", async () => {
	// the first page has a next page, and the first call for that next page fails
	const firstPageResult = toMcpViewToolResult({
		structuredContent: { items: [], nextCursor: "cursor-2" },
		mcpViewData: { ...FINDINGS_MCP_VIEW_DATA, topicFindings: TOPIC_FINDINGS.slice(0, 1) },
	})
	const secondPageResult = toMcpViewToolResult({
		structuredContent: { items: [], nextCursor: null },
		mcpViewData: { ...FINDINGS_MCP_VIEW_DATA, topicFindings: TOPIC_FINDINGS.slice(1) },
	})
	const toolResults = [{ content: [], isError: true }, secondPageResult]
	const respondToToolCall: ToolCallResponder = () => toolResults.shift() ?? secondPageResult
	await withMcpView({ mcpView: "findings", respondToToolCall }, async ({ frame, sendToolResult }) => {
		await sendToolResult(firstPageResult)
		await frame.getByRole("button", { name: "Next" }).click()
		await frame.getByRole("alert").getByText("That page didn't load.").waitFor()
		await frame.getByText("Agents that read the docs").waitFor()

		// a second click returns the page and clears the line
		await frame.getByRole("button", { name: "Next" }).click()
		await frame.getByText("Replay sets for evals").waitFor()
		expect(await frame.getByText("That page didn't load.").count()).toBe(0)
	})
})

test("opening a finding's row closes the open row", async () => {
	await withMcpView({ mcpView: "findings" }, async ({ frame, sendToolResult }) => {
		await sendToolResult(toMcpViewToolResult({ mcpViewData: FINDINGS_MCP_VIEW_DATA }))
		await expectOneOpenRow(frame)
	})
})

test("a finding's title opens its own page through the host", async () => {
	await withMcpView({ mcpView: "findings" }, async ({ frame, links, sendToolResult }) => {
		await sendToolResult(toMcpViewToolResult({ mcpViewData: FINDINGS_MCP_VIEW_DATA }))
		await frame.getByRole("link", { name: "Agents that read the docs" }).click()
		await waitForRecord(links)
		expect(links).toEqual(TOPIC_FINDINGS.slice(0, 1).map((topicFinding) => topicFinding.url))
	})
})

test.each([
	{ toolName: "read_topic_feed", toolArguments: { topic_id: FINDINGS_TOPIC.id } },
	{ toolName: "search_topic_findings", toolArguments: { topic_id: FINDINGS_TOPIC.id, query: "replay" } },
])("the findings table pages through $toolName, forward and back", async ({ toolName, toolArguments }) => {
	// a tool that returns each cursor's own page, and the first page's result
	const firstPageData = { ...FINDINGS_MCP_VIEW_DATA, topicFindings: TOPIC_FINDINGS.slice(0, 1) }
	const secondPageData = { ...FINDINGS_MCP_VIEW_DATA, topicFindings: TOPIC_FINDINGS.slice(1) }
	const firstPageResult = toMcpViewToolResult({
		structuredContent: { items: [], nextCursor: "cursor-2" },
		mcpViewData: firstPageData,
	})
	const secondPageResult = toMcpViewToolResult({
		structuredContent: { items: [], nextCursor: null },
		mcpViewData: secondPageData,
	})
	const options: OpenMcpViewOptions = {
		mcpView: "findings",
		respondToToolCall: (toolCall) => (toolCall.arguments?.cursor ? secondPageResult : firstPageResult),
	}
	await withMcpView(options, async ({ frame, toolCalls, sendToolInput, sendToolResult }) => {
		await sendToolInput(toolArguments)
		await sendToolResult(firstPageResult)

		// the next page calls the same tool with the result's cursor, and the last page has no next
		await frame.getByRole("button", { name: "Next" }).click()
		await frame.getByText("Replay sets for evals").waitFor()
		await frame.getByRole("button", { name: "Next" }).and(frame.locator("button:disabled")).waitFor()
		expect(toolCalls).toEqual([{ name: toolName, arguments: { ...toolArguments, cursor: "cursor-2" } }])

		// the previous page calls it with the cursor of the page before, and the first page has no previous
		await frame.getByRole("button", { name: "Previous" }).click()
		await frame.getByText("Agents that read the docs").waitFor()
		await frame.getByRole("button", { name: "Previous" }).and(frame.locator("button:disabled")).waitFor()
		expect(toolCalls.at(-1)).toEqual({ name: toolName, arguments: toolArguments })
	})
})

test("the findings table has no paging controls on a single page", async () => {
	await withMcpView({ mcpView: "findings" }, async ({ frame, sendToolResult }) => {
		const structuredContent = { items: [], nextCursor: null }
		await sendToolResult(toMcpViewToolResult({ structuredContent, mcpViewData: FINDINGS_MCP_VIEW_DATA }))
		await frame.getByText("Agents that read the docs").waitFor()
		// the Next and Previous buttons do not show
		expect(await frame.getByRole("button", { name: "Next" }).count()).toBe(0)
		expect(await frame.getByRole("button", { name: "Previous" }).count()).toBe(0)
	})
})

test("a visitor's findings table shows Carl's notes, with no controls and no feedback", async () => {
	const mcpViewData = { ...VISITOR_MCP_VIEW_DATA, topic: VISITOR_FINDINGS_TOPIC, topicFindings: TOPIC_FINDINGS }
	await withMcpView({ mcpView: "findings" }, async ({ frame, sendToolResult }) => {
		await sendToolResult(toMcpViewToolResult({ mcpViewData }))
		const findingRow = frame.getByRole("row").filter({ hasText: "Agents that read the docs" })
		await findingRow.getByRole("button", { name: "Show Carl's notes" }).click()
		await frame.getByText("Carl's take:").waitFor()
		// a visitor gets no controls and no feedback
		for (const controlName of ["Thumbs up", "Thumbs down", "Bookmark", "Mark read"]) {
			expect(await frame.getByRole("button", { name: controlName }).count()).toBe(0)
		}
		expect(await frame.getByRole("textbox", { name: "Feedback for Carl" }).count()).toBe(0)
	})
})

test("a findings table with no findings shows the empty line", async () => {
	const mcpViewData = { ...USER_MCP_VIEW_DATA, topic: FINDINGS_TOPIC, topicFindings: [] }
	await withMcpView({ mcpView: "findings" }, async ({ frame, sendToolResult }) => {
		await sendToolResult(toMcpViewToolResult({ mcpViewData }))
		await frame.getByText(EMPTY_FILTERED_FINDINGS).waitFor()
		expect(await frame.getByRole("table").count()).toBe(0)
	})
})

test("long text wraps in a table, with a row open, at 320 pixels", async () => {
	await withMcpView({ mcpView: "findings", width: NARROW_FRAME_WIDTH }, async ({ frame, sendToolResult }) => {
		await sendToolResult(toMcpViewToolResult({ mcpViewData: LONG_FINDINGS_MCP_VIEW_DATA }))
		await frame.getByRole("button", { name: "Show Carl's notes" }).click()
		await frame.getByRole("textbox", { name: "Feedback for Carl" }).waitFor()
		// the page is no wider than the frame
		const { scrollWidth, clientWidth } = await frame
			.locator("html")
			.evaluate((html) => ({ scrollWidth: html.scrollWidth, clientWidth: html.clientWidth }))
		expect(scrollWidth).toBeLessThanOrEqual(clientWidth)
	})
})

test("the findings MCP view heads its rows with the topic and Follow for a user", async () => {
	await withMcpView({ mcpView: "findings" }, async ({ frame, sendToolResult }) => {
		await sendToolResult(
			toMcpViewToolResult({
				mcpViewData: { ...USER_MCP_VIEW_DATA, topic: FINDINGS_TOPIC, topicFindings: TOPIC_FINDINGS },
			}),
		)
		await frame.getByText("LLM tooling").waitFor()
		await frame.getByText("Agents that read the docs").waitFor()
		await frame.getByRole("button", { name: "Follow" }).waitFor()
	})
})

test("the findings MCP view shows a visitor the rows with no Follow", async () => {
	await withMcpView({ mcpView: "findings" }, async ({ frame, sendToolResult }) => {
		await sendToolResult(
			toMcpViewToolResult({
				mcpViewData: { ...VISITOR_MCP_VIEW_DATA, topic: VISITOR_FINDINGS_TOPIC, topicFindings: TOPIC_FINDINGS },
			}),
		)
		await frame.getByText("Agents that read the docs").waitFor()
		expect(await frame.getByRole("button", { name: "Follow" }).count()).toBe(0)
	})
})
