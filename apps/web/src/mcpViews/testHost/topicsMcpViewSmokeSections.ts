// the topics MCP view through the test host: a section's cards, a card's one hop to its Topic's findings, a topic's
// similar topics and their hop, and an empty section
import { expect, test } from "bun:test"
import type { TopicCard } from "@carlnotes/contracts/home"
import type { McpViewTopics } from "@carlnotes/contracts/mcpViews"
import { EMPTY_TOPIC_SECTION } from "@carlnotes/core/lib/topicFeedLabels"
import { NO_SIMILAR_TOPICS_TEXT } from "../TopicsMcpView"
import { FINDINGS_MCP_VIEW_DATA, FINDINGS_TOPIC, toMcpViewToolResult, VISITOR_MCP_VIEW_DATA } from "./mcpViewFixtures"
import { waitForRecord, withMcpView } from "./mcpViewTestHarness"
import { type McpViewToolResult, type OpenMcpViewOptions, TEST_SITE_URL } from "./mcpViewTestHost"

// the findings Topic's card, and a team's card beside it, each with no image to load
const SECTION_TOPIC_CARDS: TopicCard[] = [
	// the findings Topic's card
	{
		id: FINDINGS_TOPIC.id,
		name: FINDINGS_TOPIC.name,
		path: `/topics/${FINDINGS_TOPIC.id}/llm-tooling`,
		image: null,
		// its tags, its owner, and its reactions
		tags: ["agents", "evals"],
		owner: { userId: "user-carl", username: "carl", avatarSource: null, avatarVersion: null },
		teamLink: null,
		reactionCount: 3,
		latestPodcastEpisode: null,
	},
	// a team's card, whose name wraps
	{
		id: "topic-2",
		name: "Model routers with an unusually long name that wraps",
		path: "/topics/topic-2/model-routers",
		image: null,
		// no tags, and the team in its byline
		tags: [],
		owner: { userId: "user-carl", username: "carl", avatarSource: null, avatarVersion: null },
		teamLink: { teamId: "team-1", name: "Coffee's for Closers", avatarVersion: null },
		reactionCount: 0,
		latestPodcastEpisode: null,
	},
]

// the popular section a visitor reads, with a page after it
const POPULAR_SECTION: McpViewTopics = {
	kind: "section",
	sectionKey: "popular",
	topicCards: SECTION_TOPIC_CARDS,
	hasMoreTopics: true,
}

// the similar topics of a topic, the findings Topic among them
const SIMILAR_TOPICS_LIST: McpViewTopics = {
	kind: "similarTopics",
	topicName: "Agent frameworks",
	relatedTopics: [{ id: FINDINGS_TOPIC.id, name: FINDINGS_TOPIC.name, latestPodcastEpisode: null }],
}

/**
 * Returns a list_topics result with the topics MCP view's data.
 */
export function toTopicsToolResult(topics: McpViewTopics = POPULAR_SECTION): McpViewToolResult {
	return toMcpViewToolResult({
		structuredContent: { items: [], nextCursor: null },
		mcpViewData: { ...VISITOR_MCP_VIEW_DATA, topics },
	})
}

// a read_topic_feed result for the findings Topic
const FINDINGS_RESPONDER: OpenMcpViewOptions["respondToToolCall"] = () =>
	toMcpViewToolResult({ mcpViewData: FINDINGS_MCP_VIEW_DATA })

// the name of the findings Topic's card link
const TOPIC_CARD_LINK_NAME = `Open ${FINDINGS_TOPIC.name}`

test("the topics MCP view shows a section's cards under its title and calls no tool on load", async () => {
	await withMcpView({ mcpView: "topics" }, async ({ frame, links, toolCalls, sendToolResult }) => {
		await sendToolResult(toTopicsToolResult())
		await frame.getByRole("button", { name: /Popular topics/ }).waitFor()
		await frame.getByRole("link", { name: TOPIC_CARD_LINK_NAME }).waitFor()
		expect(toolCalls).toEqual([])

		// a result with a page after it links to the rest on the topics page
		await frame.getByRole("link", { name: "See all on CarlNotes" }).click()
		await waitForRecord(links)
		expect(links[0]).toBe(`${TEST_SITE_URL}/topics`)
	})
})

test("a card's press calls read_topic_feed and shows its findings, and back returns to the cards with no tool call", async () => {
	const options: OpenMcpViewOptions = { mcpView: "topics", respondToToolCall: FINDINGS_RESPONDER }
	await withMcpView(options, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toTopicsToolResult())
		await frame.getByRole("link", { name: TOPIC_CARD_LINK_NAME }).click()
		await frame.getByText("Agents that read the docs").waitFor()
		expect(toolCalls).toEqual([{ name: "read_topic_feed", arguments: { topic_id: FINDINGS_TOPIC.id } }])

		// back shows the cards it kept
		await frame.getByRole("button", { name: "Back" }).click()
		await frame.getByRole("link", { name: TOPIC_CARD_LINK_NAME }).waitFor()
		expect(toolCalls).toHaveLength(1)
	})
})

test("a similar topic's name calls read_topic_feed and shows its findings", async () => {
	const options: OpenMcpViewOptions = { mcpView: "topics", respondToToolCall: FINDINGS_RESPONDER }
	await withMcpView(options, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toTopicsToolResult(SIMILAR_TOPICS_LIST))
		await frame.getByText("Agent frameworks").waitFor()

		// the similar topic's name moves one hop to its findings
		await frame.getByRole("link", { name: FINDINGS_TOPIC.name }).click()
		await frame.getByText("Agents that read the docs").waitFor()
		expect(toolCalls).toEqual([{ name: "read_topic_feed", arguments: { topic_id: FINDINGS_TOPIC.id } }])
	})
})

test("an empty section shows its empty line, and a topic with no similar topic shows its own", async () => {
	await withMcpView({ mcpView: "topics" }, async ({ frame, sendToolResult }) => {
		// a section with no topic, and no page after it
		await sendToolResult(toTopicsToolResult({ ...POPULAR_SECTION, topicCards: [], hasMoreTopics: false }))
		await frame.getByText(EMPTY_TOPIC_SECTION).waitFor()
		expect(await frame.getByRole("link", { name: "See all on CarlNotes" }).count()).toBe(0)

		// a topic with no similar topic
		await sendToolResult(toTopicsToolResult({ ...SIMILAR_TOPICS_LIST, relatedTopics: [] }))
		await frame.getByText(NO_SIMILAR_TOPICS_TEXT).waitFor()
	})
})
