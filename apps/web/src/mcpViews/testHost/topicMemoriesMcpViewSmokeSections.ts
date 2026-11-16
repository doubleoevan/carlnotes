import { expect, test } from "bun:test"
import { TOPIC_MEMORY_STORY_TEXT } from "@carlnotes/core/lib/topicMemoryStories"
import { toMcpViewToolResult } from "./mcpViewFixtures"
import { withMcpView } from "./mcpViewTestHarness"

test("the TopicMemories MCP view keeps the same read-only list and skeleton while it pages", async () => {
	// hold the second page to check the loading state against the first page's dimensions
	const pageGate = Promise.withResolvers<void>()
	const firstText = Array.from({ length: 5 }, () => TOPIC_MEMORY_STORY_TEXT).join(" ")
	const firstPage = { topicId: "coffee-journal", pageNumber: 1, pageCount: 2, items: [{ id: "one", text: firstText }] }
	const secondText = "A lighter roast works well in a slow pour-over."
	const secondPage = { ...firstPage, pageNumber: 2, items: [{ id: "six", text: secondText }] }
	await withMcpView(
		{
			mcpView: "topic-memories",
			respondToToolCall: async () => {
				await pageGate.promise
				return toMcpViewToolResult({ mcpViewData: { session: null, podcastEpisodes: [], topicMemories: secondPage } })
			},
		},
		async ({ frame, sendToolResult, toolCalls }) => {
			await sendToolResult(
				toMcpViewToolResult({ mcpViewData: { session: null, podcastEpisodes: [], topicMemories: firstPage } }),
			)
			await frame.getByRole("heading", { name: "Topic Takeaways 🧠" }).waitFor()
			const list = frame.locator("ul[aria-busy]")
			await list.getByText(firstText).waitFor()
			const initialHeight = await list.evaluate((element) => element.getBoundingClientRect().height)
			expect(await list.getByRole("textbox").count()).toBe(0)

			// retain the prior height while the host reads the next page
			try {
				await frame.getByRole("button", { name: "Next page" }).click()
				await frame.locator('ul[aria-busy="true"]').waitFor()
				expect(await list.evaluate((element) => element.getBoundingClientRect().height)).toBe(initialHeight)
				expect(await list.locator('[style*="repeating-linear-gradient"]').count()).toBe(1)
			} finally {
				pageGate.resolve()
			}
			// display the returned page through the same tool, with its number offset
			await list.getByText(secondText).waitFor()
			await list.getByText("6", { exact: true }).waitFor()
			expect(toolCalls).toEqual([{ name: "read_topic_memories", arguments: { topic_id: firstPage.topicId, page: 2 } }])
		},
	)
})

test("the TopicMemories MCP view recovers when the requested page is gone", async () => {
	// page two disappears after the initial read
	const topicId = "coffee-journal"
	const toResult = (pageNumber: number, pageCount: number, items: { id: string; text: string }[]) =>
		toMcpViewToolResult({
			mcpViewData: { session: null, podcastEpisodes: [], topicMemories: { topicId, pageNumber, pageCount, items } },
		})
	await withMcpView(
		{
			mcpView: "topic-memories",
			respondToToolCall: () => toResult(1, 1, [{ id: "two", text: "The last topic memory." }]),
		},
		async ({ frame, sendToolResult, toolCalls }) => {
			await sendToolResult(toResult(1, 2, [{ id: "one", text: "The first topic memory." }]))
			await frame.getByRole("button", { name: "Next page" }).click()
			await frame.getByText("The last topic memory.").waitFor()
			await frame.getByText("1", { exact: true }).waitFor()
			expect(toolCalls.map(({ arguments: args }) => args?.page)).toEqual([2])
		},
	)
})
