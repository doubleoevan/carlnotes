// the news MCP view through the test host: the mentions and the rows, a Topic Post row's info popup, a window change,
// and a page past the tool result
import { expect, test } from "bun:test"
import { toEmptyNewsText } from "@carlnotes/contracts/news"
import {
	NEWS_NEXT_CURSOR,
	NEWS_RESULT,
	QUIET_DAY_NEWS_RESULT,
	SECOND_NEWS_RESULT,
	toNewsToolResult,
	toTopicPostToolResult,
} from "./mcpViewFixtures"
import { waitForRecord, withMcpView } from "./mcpViewTestHarness"
import { type OpenMcpViewOptions, TEST_SITE_URL, type ToolCallResponder } from "./mcpViewTestHost"

// the week's first mention, and the Topic Post's row of its first page with the row's title
const [COMMENT_MENTION] = NEWS_RESULT.commentMentions
const TOPIC_POST_NEWS_EVENT = NEWS_RESULT.newsPage.newsEvents.find((newsEvent) => newsEvent.kind === "topicPost")
const TOPIC_POST_ROW_NAME = "Evan posted Why I weigh every shot"

// the day's news, and the week's second tool result from its cursor
const respondToNewsToolCall: ToolCallResponder = ({ arguments: toolArguments }) =>
	toNewsToolResult(toolArguments?.window === "day" ? QUIET_DAY_NEWS_RESULT : SECOND_NEWS_RESULT)

test("the news MCP view shows the mentions, then the rows, and calls no tool on load", async () => {
	await withMcpView({ mcpView: "news" }, async ({ frame, links, toolCalls, sendToolResult }) => {
		await sendToolResult(toNewsToolResult())

		// the mentions lead, with no action that marks them seen
		await frame.getByRole("heading", { name: "Mentions" }).waitFor()
		await frame.getByText(COMMENT_MENTION?.text ?? "").waitFor()
		expect(await frame.getByRole("button", { name: "Mark all seen" }).count()).toBe(0)

		// the week's first five rows under the picker, with no Topic note to read
		await frame.getByRole("link", { name: TOPIC_POST_ROW_NAME }).waitFor()
		await frame.locator('button[aria-pressed="true"]').getByText("Week").waitFor()
		expect(await frame.getByRole("button", { name: "Topic details" }).count()).toBe(0)
		expect(toolCalls).toEqual([])

		// a mention and a row open their pages on the site through the host
		await frame.getByRole("link", { name: COMMENT_MENTION?.text ?? "" }).click()
		await frame.getByRole("link", { name: TOPIC_POST_ROW_NAME }).click()
		await waitForRecord(links, 2)
		expect(links).toEqual([
			`${TEST_SITE_URL}${COMMENT_MENTION?.path}`,
			`${TEST_SITE_URL}${TOPIC_POST_NEWS_EVENT?.path}`,
		])
		expect(toolCalls).toEqual([])
	})
})

test("a Topic Post row's info popup reads the post through read_topic_post", async () => {
	const options: OpenMcpViewOptions = { mcpView: "news", respondToToolCall: () => toTopicPostToolResult() }
	await withMcpView(options, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toNewsToolResult())
		await frame.getByRole("button", { name: "About this post" }).click()
		await frame.getByText("Carl's Notes").waitFor()
		expect(toolCalls).toEqual([
			{ name: "read_topic_post", arguments: { topic_post_id: TOPIC_POST_NEWS_EVENT?.topicPostId } },
		])
	})
})

test("a window change calls read_news with the window and shows that result", async () => {
	const options: OpenMcpViewOptions = { mcpView: "news", respondToToolCall: respondToNewsToolCall }
	await withMcpView(options, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toNewsToolResult())
		await frame.getByRole("link", { name: TOPIC_POST_ROW_NAME }).waitFor()

		// the day reads through the tool, and shows what it returned
		await frame.getByRole("button", { name: "Day" }).click()
		await frame.getByText(toEmptyNewsText("day")).waitFor()
		expect(toolCalls).toEqual([{ name: "read_news", arguments: { window: "day" } }])

		// the week shows again from the result the view opened on, with no tool call
		await frame.getByRole("button", { name: "Week" }).click()
		await frame.getByRole("link", { name: TOPIC_POST_ROW_NAME }).waitFor()
		expect(toolCalls).toHaveLength(1)
	})
})

test("a page inside the tool result calls no tool, and a page past it reads the next cursor", async () => {
	const options: OpenMcpViewOptions = { mcpView: "news", respondToToolCall: respondToNewsToolCall }
	await withMcpView(options, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toNewsToolResult())
		const newsPages = frame.getByRole("navigation", { name: "Brews News pages" })

		// the second page is the result's own rows
		await newsPages.getByRole("button", { name: "2", exact: true }).click()
		await newsPages.locator('button[aria-current="page"]').getByText("2").waitFor()
		await frame.getByRole("link", { name: TOPIC_POST_ROW_NAME }).waitFor()
		expect(toolCalls).toEqual([])

		// the last page is past the result's twenty rows
		await newsPages.getByRole("button", { name: "7", exact: true }).click()
		await newsPages.locator('button[aria-current="page"]').getByText("7").waitFor()
		await frame.getByRole("link", { name: "Grinders, scales, and the pour", exact: true }).waitFor()
		expect(toolCalls).toEqual([{ name: "read_news", arguments: { window: "week", cursor: NEWS_NEXT_CURSOR } }])
	})
})

test("a visitor's news MCP view shows the tool's own words", async () => {
	await withMcpView({ mcpView: "news" }, async ({ frame, sendToolResult }) => {
		await sendToolResult({ content: [{ type: "text", text: "Connect your CarlNotes account." }] })
		await frame.getByText("Connect your CarlNotes account.").waitFor()
	})
})
