// the topic MCP view through the test host: a saved preview and a send's confirmation

import { expect, test } from "bun:test"
import type { PersonalSourcesSendResult } from "@carlnotes/contracts/personalSources"
import { TOPIC_EDIT_PREVIEW, toMcpViewToolResult, USER_MCP_VIEW_DATA } from "./mcpViewFixtures"
import { toFrameText, waitForRecord, withMcpView } from "./mcpViewTestHarness"
import type { ToolCallResponder } from "./mcpViewTestHost"
import { TEST_SITE_URL } from "./mcpViewTestHost"

test("the topic MCP view saves a preview with its confirmation, and shows what stopped a save", async () => {
	// the first save is rejected and the second goes through
	const savedResult = { status: "saved", topicId: "topic-1", afterTopicDraft: TOPIC_EDIT_PREVIEW.afterTopicDraft }
	const toolResults = [
		{ content: [{ type: "text" as const, text: "This edit needs another look." }], isError: true },
		toMcpViewToolResult({ structuredContent: savedResult, mcpViewData: USER_MCP_VIEW_DATA }),
	]
	const respondToToolCall: ToolCallResponder = () => toolResults.shift() ?? { content: [] }
	await withMcpView(
		{ mcpView: "topic", respondToToolCall },
		async ({ frame, sendToolInput, sendToolResult, toolCalls }) => {
			await sendToolInput({ topic_id: "topic-1", visibility: "public" })
			await sendToolResult(
				toMcpViewToolResult({ structuredContent: TOPIC_EDIT_PREVIEW, mcpViewData: USER_MCP_VIEW_DATA }),
			)
			await frame.getByText("Save makes the topic public, so anyone can read it.").waitFor()
			await frame.getByText("Home espresso").first().waitFor()

			// the rejected save shows its reason and keeps the button
			await frame.getByRole("button", { name: "Save" }).click()
			await frame.getByRole("alert").getByText("This edit needs another look.").waitFor()

			// the saved topic has no button left
			await frame.getByRole("button", { name: "Save" }).click()
			await waitForRecord(toolCalls, 2)
			expect(toolCalls.at(-1)).toEqual({
				name: "edit_topic",
				arguments: { topic_id: "topic-1", visibility: "public", confirmation: "1.a" },
			})
			await frame.getByRole("button", { name: "Save" }).waitFor({ state: "detached" })
		},
	)
})

test.each([
	{
		status: "accepted",
		topic: { id: "topic", name: "<script>private</script>".repeat(8), url: `${TEST_SITE_URL}/topics/topic` },
		entryId: "entry",
		title: "☕".repeat(200),
		queuedLinkCount: 2,
	},
	{ status: "quota", resetAt: "2026-11-03T00:00:00.000Z" },
	{ status: "disconnected" },
	{ status: "unavailable", reason: "disabled" },
	{ status: "conflict", reason: "removed" },
] satisfies PersonalSourcesSendResult[])("send outcomes render safely with no resend control: %s", async (result) => {
	await withMcpView({ mcpView: "topic" }, async ({ frame, sendToolInput, sendToolResult }) => {
		await sendToolInput({ summary: "private-canary", chat_url: "https://claude.ai/chat/private" })
		await sendToolResult(toMcpViewToolResult({ structuredContent: result, mcpViewData: USER_MCP_VIEW_DATA }))
		await frame.getByRole("status").waitFor()

		// the arguments and a name's markup stay out of the page, and nothing offers a second send
		const frameHtml = await frame.locator("#root").innerHTML()
		expect(frameHtml).toContain("break-words")
		expect(frameHtml).not.toContain("private-canary")
		expect(frameHtml).not.toContain("/chat/private")
		expect(frameHtml).not.toContain("<script>")
		expect(await frame.getByRole("button").count()).toBe(0)
	})
})

test("multi-Topic confirmations show one bold title and flush numbered links per Topic", async () => {
	const confirmations = ["humidity", "ventilation"].map((id) => ({
		topic: { id, name: `Moss terrarium ${id}`, url: `${TEST_SITE_URL}/topics/${id}` },
		entryId: `entry-${id}`,
		queuedLinkCount: 2,
	}))
	const firstConfirmation = confirmations[0]
	if (!firstConfirmation) {
		throw new Error("Missing confirmation fixture")
	}
	const sendConfirmationLinks = confirmations.map((confirmation) => ({
		entryId: confirmation.entryId,
		links: [
			{ url: "https://en.wikipedia.org/wiki/Terrarium", title: "Terrarium - Wikipedia" },
			{ url: "https://example.com/humidity" },
		],
	}))
	await withMcpView({ mcpView: "topic" }, async ({ frame, sendToolResult }) => {
		await sendToolResult(
			toMcpViewToolResult({
				structuredContent: { status: "accepted", title: "Humidity sensors", ...firstConfirmation, confirmations },
				mcpViewData: { ...USER_MCP_VIEW_DATA, sendConfirmationLinks },
			}),
		)
		await frame.getByRole("status").waitFor()
		const frameText = await toFrameText(frame)
		expect(frameText).toContain("to 2 topics.")
		expect(frameText.match(/Links for next brew/g)).toHaveLength(2)
		expect(frameText).toContain("Terrarium - Wikipedia")
		// one bold title and one numbered list per Topic
		expect(await frame.locator("strong").textContent()).toBe("Humidity sensors")
		expect(await frame.locator("ol").count()).toBe(2)
	})
})
