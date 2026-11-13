// the topics MCP view's data: a list_topics page as the home's topic cards, or a topic's similar topics, with the
// caller and the podcast episodes the cards' and rows' play buttons play

import type { McpViewData, McpViewTopics } from "@carlnotes/contracts/mcpViews"
import type { TopicResponse, TopicSectionKey } from "@carlnotes/contracts/topics"
import { loadTopicCards } from "../home/topicCards"
import { loadMcpViewPodcastEpisodes, loadMcpViewSession } from "./mcpViewData"
import type { McpPage } from "./results"
import { type ToolCaller, toToolCallerUserId } from "./toolCaller"
import type { McpTopic } from "./topicResults"

// what a list_topics call read beside its page: a section of the topics page, null for the whole list, or a topic's
// similar topics
export type TopicsRead =
	| { kind: "section"; sectionKey: TopicSectionKey | null }
	| { kind: "similarTopics"; topicName: string; relatedTopics: TopicResponse["relatedTopics"] }

/**
 * Loads the topics MCP view's data: the page's topics as topic cards or the similar topics, the caller, and the
 * latest podcast episode of each topic.
 */
export async function loadTopicsMcpViewData(
	toolCaller: ToolCaller,
	mcpPage: McpPage<McpTopic>,
	topicsRead: TopicsRead,
): Promise<McpViewData> {
	// the cards of the page's topics in the page's order, or the similar topics as the topic's page shows them
	const topics = await toMcpViewTopics(toolCaller, mcpPage, topicsRead)
	const listedTopics = topics.kind === "section" ? topics.topicCards : topics.relatedTopics
	const podcastEpisodeIds = listedTopics.flatMap(({ latestPodcastEpisode }) =>
		latestPodcastEpisode ? [latestPodcastEpisode.id] : [],
	)

	// the caller, and the podcast episodes the play buttons play
	const [session, podcastEpisodes] = await Promise.all([
		loadMcpViewSession(toolCaller),
		loadMcpViewPodcastEpisodes(toolCaller, podcastEpisodeIds),
	])
	return { session, podcastEpisodes, topics }
}

// the topics the MCP view shows of what the call read
async function toMcpViewTopics(
	toolCaller: ToolCaller,
	mcpPage: McpPage<McpTopic>,
	topicsRead: TopicsRead,
): Promise<McpViewTopics> {
	if (topicsRead.kind === "similarTopics") {
		return topicsRead
	}

	// the page's topics as the home's cards
	const topicIds = mcpPage.items.map((mcpTopic) => mcpTopic.topicId)
	const topicCards = await loadTopicCards(topicIds, toToolCallerUserId(toolCaller))
	return {
		kind: "section",
		sectionKey: topicsRead.sectionKey,
		topicCards,
		hasMoreTopics: mcpPage.nextCursor !== null,
	}
}
