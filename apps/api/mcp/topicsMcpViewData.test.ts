// the topics MCP view's data: list_topics declares the view, a page of topics goes to it as the home's topic cards
// and a topic's similar topics as its page shows them, and the structured result stays the page
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { TopicCard } from "@carlnotes/contracts/home"
import { MCP_VIEW_META_KEY } from "@carlnotes/contracts/mcpViews"
import type { PodcastEpisodeSummary } from "@carlnotes/contracts/podcast"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import * as topicCards from "../home/topicCards"
import * as mcpViewData from "./mcpViewData"
import { toRegisteredTools, USER, VISITOR } from "./toolTestFixtures"
import * as topicResults from "./topicResults"
import { loadTopicsMcpViewData } from "./topicsMcpViewData"

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

// a topic's latest podcast episode, which the play buttons play
const LATEST_PODCAST_EPISODE = { id: "podcast-episode-1" } as PodcastEpisodeSummary

// two topics as list_topics returns them, with a page after them
const MCP_PAGE = {
	items: [{ topicId: "topic-2" }, { topicId: "topic-1" }] as topicResults.McpTopic[],
	nextCursor: "next-cursor",
}

// the two topics' cards, the second with a podcast episode
const TOPIC_CARDS = [
	{ id: "topic-2", latestPodcastEpisode: null },
	{ id: "topic-1", latestPodcastEpisode: LATEST_PODCAST_EPISODE },
] as TopicCard[]

// a topic's similar topic, with a podcast episode
const RELATED_TOPICS: TopicResponse["relatedTopics"] = [
	{ id: "topic-3", name: "Pour over", latestPodcastEpisode: LATEST_PODCAST_EPISODE },
]

// the caller, the cards, and the podcast episodes the view data reads
function spyOnMcpViewReads(): {
	loadTopicCards: ReturnType<typeof spyOn<typeof topicCards, "loadTopicCards">>
	loadMcpViewPodcastEpisodes: ReturnType<typeof spyOn<typeof mcpViewData, "loadMcpViewPodcastEpisodes">>
} {
	spyOn(mcpViewData, "loadMcpViewSession").mockResolvedValue(null)
	return {
		loadTopicCards: spyOn(topicCards, "loadTopicCards").mockResolvedValue(TOPIC_CARDS),
		loadMcpViewPodcastEpisodes: spyOn(mcpViewData, "loadMcpViewPodcastEpisodes").mockResolvedValue([]),
	}
}

test("a section's page goes to the MCP view as the home's topic cards in the page's order", async () => {
	const { loadTopicCards, loadMcpViewPodcastEpisodes } = spyOnMcpViewReads()
	const data = await loadTopicsMcpViewData(USER, MCP_PAGE, { kind: "section", sectionKey: "popular" })

	// the cards of the page's topics for the user, and the podcast episode the card plays
	expect(loadTopicCards).toHaveBeenCalledWith(["topic-2", "topic-1"], "user-1")
	expect(loadMcpViewPodcastEpisodes).toHaveBeenCalledWith(USER, ["podcast-episode-1"])
	expect(data.topics).toEqual({
		kind: "section",
		sectionKey: "popular",
		topicCards: TOPIC_CARDS,
		hasMoreTopics: true,
	})
})

test("a topic's similar topics go to the MCP view as its page shows them", async () => {
	const { loadTopicCards, loadMcpViewPodcastEpisodes } = spyOnMcpViewReads()
	const topicsRead = { kind: "similarTopics" as const, topicName: "Espresso", relatedTopics: RELATED_TOPICS }
	const data = await loadTopicsMcpViewData(VISITOR, MCP_PAGE, topicsRead)

	// no cards, and the similar topic's podcast episode
	expect(loadTopicCards).not.toHaveBeenCalled()
	expect(loadMcpViewPodcastEpisodes).toHaveBeenCalledWith(VISITOR, ["podcast-episode-1"])
	expect(data.topics).toEqual(topicsRead)
})

test("list_topics declares the topics MCP view and returns its page with the view's data in _meta", async () => {
	spyOnMcpViewReads()
	spyOn(topicResults, "listTopicSectionTopics").mockResolvedValue(MCP_PAGE)
	spyOn(topicResults, "listTopics").mockResolvedValue({ ...MCP_PAGE, nextCursor: null })
	const listTopicsTool = toRegisteredTools(VISITOR).get("list_topics")
	expect(listTopicsTool?.config).toMatchObject({
		_meta: { ui: { resourceUri: expect.stringContaining("topics") } },
	})

	// a section's read: the page as the structured result, and the section's cards beside it
	const sectionResult = await listTopicsTool?.handler({ section: "featured" })
	expect(sectionResult?.structuredContent).toEqual(MCP_PAGE)
	expect(sectionResult?._meta?.[MCP_VIEW_META_KEY]).toMatchObject({ topics: { sectionKey: "home" } })

	// the whole list's read has no section
	const listResult = await listTopicsTool?.handler({})
	expect(listResult?._meta?.[MCP_VIEW_META_KEY]).toMatchObject({
		topics: { sectionKey: null, hasMoreTopics: false },
	})
})

test("list_topics returns a topic's similar topics with the topic's name, and no view data for a topic it may not open", async () => {
	spyOnMcpViewReads()
	const listSimilarTopics = spyOn(topicResults, "listSimilarTopics").mockResolvedValue({
		topicName: "Espresso",
		relatedTopics: RELATED_TOPICS,
		mcpPage: MCP_PAGE,
	})
	const listTopicsTool = toRegisteredTools(USER).get("list_topics")

	// the similar topics' page, and the related topics beside it
	const similarResult = await listTopicsTool?.handler({ similar_to_topic_id: "topic-1" })
	expect(similarResult?.structuredContent).toEqual(MCP_PAGE)
	expect(similarResult?._meta?.[MCP_VIEW_META_KEY]).toMatchObject({
		topics: { kind: "similarTopics", topicName: "Espresso", relatedTopics: RELATED_TOPICS },
	})

	// a topic the caller may not open is an error with no view data
	listSimilarTopics.mockResolvedValue(null)
	const hiddenResult = await listTopicsTool?.handler({ similar_to_topic_id: "private-topic" })
	expect(hiddenResult?.isError).toBe(true)
	expect(hiddenResult?._meta).toBeUndefined()
})
