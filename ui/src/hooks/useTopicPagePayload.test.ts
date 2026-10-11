// a poll reload keeps the page's related topics, which the reload leaves out
import { expect, test } from "bun:test"
import type { TopicResponse } from "@shared/contracts/topics"
import { toPolledTopicPage } from "./useTopicPagePayload"

// a topic page with the given id and the related topic it shows, if any
function toTopicPage(id: string, relatedTopicName: string | null): TopicResponse {
	const relatedTopics = relatedTopicName
		? [{ id: "related-1", name: relatedTopicName, latestPodcastEpisode: null }]
		: []
	return { id, relatedTopics } as unknown as TopicResponse
}

test("a poll reload of the same topic keeps the page's related topics", () => {
	const polledTopicPage = toPolledTopicPage(toTopicPage("topic-1", "Robot vacuums"), toTopicPage("topic-1", null))
	expect(polledTopicPage?.relatedTopics.map((relatedTopic) => relatedTopic.name)).toEqual(["Robot vacuums"])
})

test("a poll reload of another topic, or of a topic gone missing, keeps the reload's own", () => {
	expect(
		toPolledTopicPage(toTopicPage("topic-1", "Robot vacuums"), toTopicPage("topic-2", null))?.relatedTopics,
	).toEqual([])
	expect(toPolledTopicPage(undefined, toTopicPage("topic-2", "Espresso"))?.relatedTopics).toHaveLength(1)
	expect(toPolledTopicPage(toTopicPage("topic-1", "Robot vacuums"), null)).toBeNull()
})
