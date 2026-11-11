// the topic posts MCP view through the test host: a Topic's cards, the one hop to a post, a card's info popup, and a
// Topic with no post
import { expect, test } from "bun:test"
import { TOPIC_POST_LABELS } from "@carlnotes/core/lib/topicPosts"
import {
	FINDINGS_TOPIC,
	TOPIC_POST,
	TOPIC_POST_CARD,
	toTopicPostsToolResult,
	toTopicPostToolResult,
} from "./mcpViewFixtures"
import { waitForRecord, withMcpView } from "./mcpViewTestHarness"
import { type OpenMcpViewOptions, TEST_SITE_URL } from "./mcpViewTestHost"

// the name of a card's link
const TOPIC_POST_LINK_NAME = `Open ${TOPIC_POST_CARD.title}`

test("the topic posts MCP view shows the cards under the Topic's header and calls no tool on load", async () => {
	await withMcpView({ mcpView: "topic-posts" }, async ({ frame, links, toolCalls, sendToolResult }) => {
		await sendToolResult(toTopicPostsToolResult([TOPIC_POST_CARD], "next-cursor"))
		await frame.getByRole("link", { name: FINDINGS_TOPIC.name }).waitFor()
		await frame.getByRole("link", { name: TOPIC_POST_LINK_NAME }).first().waitFor()
		await frame.getByText("Open Mic").waitFor()

		// no button starts a draft, and no tool reads anything yet
		expect(await frame.getByRole("button", { name: TOPIC_POST_LABELS.newPost, exact: true }).count()).toBe(0)
		expect(toolCalls).toEqual([])

		// a result with a page after it links to the rest on the Topic's page
		await frame.getByRole("link", { name: "See all on CarlNotes" }).click()
		await waitForRecord(links)
		expect(links[0]).toStartWith(`${TEST_SITE_URL}/topics/${FINDINGS_TOPIC.id}`)
	})
})

test("a card's press calls read_topic_post and shows that post, and back returns to the cards with no tool call", async () => {
	const options: OpenMcpViewOptions = { mcpView: "topic-posts", respondToToolCall: () => toTopicPostToolResult() }
	await withMcpView(options, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toTopicPostsToolResult())
		await frame.getByRole("link", { name: TOPIC_POST_LINK_NAME }).click()

		// the post shows in the topic post MCP view, read through its tool
		await frame.getByRole("heading", { level: 1, name: TOPIC_POST_CARD.title }).waitFor()
		await frame.getByText("Coffee Break Discussion").waitFor()
		expect(toolCalls).toEqual([{ name: "read_topic_post", arguments: { topic_post_id: TOPIC_POST_CARD.id } }])

		// back shows the cards it kept
		await frame.getByRole("button", { name: "Back" }).click()
		await frame.getByRole("link", { name: TOPIC_POST_LINK_NAME }).first().waitFor()
		expect(toolCalls).toHaveLength(1)
	})
})

test("a card's info popup reads its post through read_topic_post and stays on the cards", async () => {
	const options: OpenMcpViewOptions = { mcpView: "topic-posts", respondToToolCall: () => toTopicPostToolResult() }
	await withMcpView(options, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toTopicPostsToolResult())
		await frame.getByRole("button", { name: "About this post" }).click()

		// the popup shows the post the tool returned, with its discussion and its summary
		await frame.getByText(TOPIC_POST.summary ?? "").waitFor()
		await frame.getByText("Coffee Break Discussion").waitFor()
		expect(toolCalls).toEqual([{ name: "read_topic_post", arguments: { topic_post_id: TOPIC_POST_CARD.id } }])
		await frame.getByRole("link", { name: TOPIC_POST_LINK_NAME }).first().waitFor()
	})
})

test("a Topic with no post shows the empty state and no publish button", async () => {
	await withMcpView({ mcpView: "topic-posts" }, async ({ frame, sendToolResult }) => {
		await sendToolResult(toTopicPostsToolResult([]))
		await frame.getByText(TOPIC_POST_LABELS.empty).waitFor()
		expect(await frame.getByRole("button", { name: TOPIC_POST_LABELS.newPost, exact: true }).count()).toBe(0)
		expect(await frame.getByRole("link", { name: "See all on CarlNotes" }).count()).toBe(0)
	})
})
