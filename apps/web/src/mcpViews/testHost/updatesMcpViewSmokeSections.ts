// the updates MCP view through the test host: the updates list, its one hop, and its rows
import { expect, test } from "bun:test"
import { EMPTY_UPDATES_TEXT } from "@carlnotes/contracts/updates"
import {
	FINDINGS_MCP_VIEW_DATA,
	FINDINGS_TOPIC,
	toMcpViewToolResult,
	toUpdatesToolResult,
	UPDATES_MCP_VIEW_DATA,
	UPDATES_RESULT,
} from "./mcpViewFixtures"
import { waitForRecord, withMcpView } from "./mcpViewTestHarness"
import { type OpenMcpViewOptions, TEST_SITE_URL } from "./mcpViewTestHost"

test("the updates MCP view shows the list and calls no tool on load", async () => {
	const toolResult = toUpdatesToolResult()
	await withMcpView({ mcpView: "updates" }, async ({ frame, links, toolCalls, sendToolResult }) => {
		await sendToolResult(toolResult)
		await frame.getByText("Three things moved while you were out.").waitFor()
		await frame.getByRole("link", { name: "A model router ships" }).waitFor()
		await frame.getByText("4 min").waitFor()
		expect(toolCalls).toEqual([])

		// the more link opens on the site
		await frame.getByRole("link", { name: "and 2 more" }).click()
		await waitForRecord(links)
		expect(links).toEqual([`${TEST_SITE_URL}/topics`])
	})
})

test("a list with no opener starts at its first Finding, and an empty list shows the empty state", async () => {
	await withMcpView({ mcpView: "updates" }, async ({ frame, sendToolResult }) => {
		await sendToolResult(toUpdatesToolResult({ ...UPDATES_RESULT, opener: null }))
		await frame.getByRole("link", { name: "A model router ships" }).waitFor()
		expect(await frame.getByText("Three things moved while you were out.").count()).toBe(0)

		await sendToolResult(toUpdatesToolResult({ ...UPDATES_RESULT, findings: [], moreCount: 0 }))
		await frame.getByText(EMPTY_UPDATES_TEXT).waitFor()
	})
})

test("a list's Topic moves one hop to its findings, and back returns to the list with no tool call", async () => {
	const options: OpenMcpViewOptions = {
		mcpView: "updates",
		respondToToolCall: () => toMcpViewToolResult({ mcpViewData: FINDINGS_MCP_VIEW_DATA }),
	}
	await withMcpView(options, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toUpdatesToolResult())
		await frame.getByRole("link", { name: FINDINGS_TOPIC.name }).click()
		await frame.getByText("Agents that read the docs").waitFor()
		expect(toolCalls).toEqual([{ name: "read_topic_feed", arguments: { topic_id: FINDINGS_TOPIC.id } }])

		// back shows the updates list it kept
		await frame.getByRole("button", { name: "Back" }).click()
		await frame.getByText("Three things moved while you were out.").waitFor()
		await frame.getByRole("link", { name: "A model router ships" }).waitFor()
		expect(toolCalls).toHaveLength(1)
	})
})

test("a list's row calls its tools through the host and shows each change", async () => {
	const options: OpenMcpViewOptions = {
		mcpView: "updates",
		respondToToolCall: () => toMcpViewToolResult({ mcpViewData: UPDATES_MCP_VIEW_DATA }),
	}
	await withMcpView(options, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toUpdatesToolResult())
		const findingRow = frame.getByRole("row").filter({ hasText: "A model router ships" })
		await findingRow.getByRole("button", { name: "Show Carl's notes" }).click()

		// a rating saves through its tool and presses the thumb
		await frame.getByRole("button", { name: "Thumbs up" }).click()
		await frame.locator('button[aria-label^="Thumbs up"][aria-pressed="true"]').waitFor()

		// the read toggle saves through its tool, and the row keeps its place
		await frame.getByRole("button", { name: "Mark read" }).click()
		await frame.getByRole("button", { name: "Mark unread" }).and(frame.locator("button:disabled")).waitFor()
		expect(toolCalls).toEqual([
			{ name: "rate_finding", arguments: { finding_id: "finding-4", rating: "up" } },
			{ name: "mark_finding_consumed", arguments: { finding_id: "finding-4" } },
		])
	})
})

test("a visitor's updates MCP view shows the tool's own words", async () => {
	await withMcpView({ mcpView: "updates" }, async ({ frame, sendToolResult }) => {
		await sendToolResult({ content: [{ type: "text", text: "Connect your CarlNotes account." }] })
		await frame.getByText("Connect your CarlNotes account.").waitFor()
	})
})
