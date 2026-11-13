// the topic list reads shared Sources alone, a visitor reads the popular section of the topics page in its order, and
// a topic's similar topics are the ones its page shows the caller
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as feeds from "../topic/feeds"
import * as relatedTopics from "../topic/relatedTopics"
import * as results from "./results"
import { USER, VISITOR } from "./toolTestFixtures"
import { listSimilarTopics, listTopicSectionTopics, listTopics } from "./topicResults"

// put the connection pool and the spies back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// a topic's row as the list reads it, and no sources for any topic
function stubTopicRows(topicIds: string[]): void {
	stubConnectionPool((query) =>
		query.text.includes('from "sources"')
			? []
			: topicIds.map((topicId) => [topicId, `Topic ${topicId}`, "Prompt", "public", "daily", 3, null]),
	)
}

test("a listed topic's Sources leave out personal Sources", async () => {
	// one public topic, and the shared Source that the filtered read returns
	const sentQueries = stubConnectionPool((query) => {
		if (query.text.includes('from "sources"')) {
			return [["source-1", "topic-1", "rss", { url: "https://example.test/feed" }]]
		}
		return [["topic-1", "Topic", "Prompt", "public", "daily", 3]]
	})
	const page = await listTopics({ kind: "visitor", clientName: "test" }, null, null)

	// the read names both personal kinds in its filter, for every caller
	const sourcesQuery = sentQueries.find((query) => query.text.includes('from "sources"'))
	expect(sourcesQuery?.text).toContain('"sources"."kind" not in')
	expect(sourcesQuery?.values).toEqual(expect.arrayContaining(["ai_agent", "email"]))
	expect(page.items[0]?.sources.map((source) => source.sourceId)).toEqual(["source-1"])
})

test("a visitor reads the popular section of the topics page in its order", async () => {
	// the popular section holds two topics, read back in the other order
	const loadTopicSectionIds = spyOn(feeds, "loadTopicSectionIds").mockResolvedValue(["topic-2", "topic-1"])
	stubTopicRows(["topic-1", "topic-2"])
	const page = await listTopicSectionTopics(VISITOR, "popular", null)

	// the section's topics in the section's order, read with no user
	expect(loadTopicSectionIds).toHaveBeenCalledWith(null, "popular")
	expect(page.items.map((mcpTopic) => mcpTopic.topicId)).toEqual(["topic-2", "topic-1"])
})

test("a topic's similar topics are the ones its page shows the caller, and a topic the caller may not open lists none", async () => {
	// the topic the caller opens, and its related topics for that caller
	spyOn(results, "loadVisibleTopic").mockResolvedValue({ id: "topic-1", name: "Espresso" } as never)
	const loadRelatedTopics = spyOn(relatedTopics, "loadRelatedTopics").mockResolvedValue([
		{ id: "topic-3", name: "Topic topic-3", latestPodcastEpisode: null },
	])
	stubTopicRows(["topic-3"])
	const similarTopics = await listSimilarTopics(USER, "topic-1", null)
	expect(loadRelatedTopics).toHaveBeenCalledWith({ id: "topic-1", name: "Espresso" }, "user-1")
	expect(similarTopics?.mcpPage.items.map((mcpTopic) => mcpTopic.topicId)).toEqual(["topic-3"])

	// the topic's name and its related topics, as its page shows them
	expect(similarTopics?.topicName).toBe("Espresso")
	expect(similarTopics?.relatedTopics.map((relatedTopic) => relatedTopic.id)).toEqual(["topic-3"])

	// a topic the caller may not open
	spyOn(results, "loadVisibleTopic").mockResolvedValue(null)
	expect(await listSimilarTopics(VISITOR, "private-topic", null)).toBeNull()
})
