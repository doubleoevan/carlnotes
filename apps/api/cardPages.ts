// one later page of a card section the server pages, cut from the whole list a page read holds

import { toCardsPage } from "@carlnotes/contracts/cardPages"
import type { PodcastEpisodeCard, PodcastEpisodeCardsPage } from "@carlnotes/contracts/home"
import type { TopicPostCard, TopicPostCardsPage } from "@carlnotes/contracts/topicPosts"

/**
 * Returns one zero-based page of Topic Post cards with how many the whole list holds.
 */
export function toTopicPostCardsPage(topicPostCards: TopicPostCard[], page: number): TopicPostCardsPage {
	const { rows, position } = toCardsPage(topicPostCards, page)
	return { topicPosts: rows, totalCount: position.totalCount }
}

/**
 * Returns one zero-based page of podcast episode or film cards with how many the whole list holds.
 */
export function toPodcastEpisodeCardsPage(
	podcastEpisodeCards: PodcastEpisodeCard[],
	page: number,
): PodcastEpisodeCardsPage {
	const { rows, position } = toCardsPage(podcastEpisodeCards, page)
	return { podcastEpisodes: rows, totalCount: position.totalCount }
}
