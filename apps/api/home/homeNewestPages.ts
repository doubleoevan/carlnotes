// the week's new sections of the home a page at a time: a home payload cut to the pages its read asks for

import { toCardsPage } from "@carlnotes/contracts/cardPages"
import type { HomeQuery, HomeResponse } from "@carlnotes/contracts/home"

/**
 * Returns the home with each of the week's new lists cut to the zero-based page its query names, the first if it names
 * none, and where each page sits. A query that asks for no pages returns the home whole, as a released app reads it.
 */
export function toPagedHome(home: HomeResponse, query: Omit<HomeQuery, "newsWindow">): HomeResponse {
	if (query.paged !== "1") {
		return home
	}

	// each new list's page, and where it sits
	const films = toCardsPage(home.newestTopicPodcastEpisodeVideos ?? [], query.newestFilmsPage ?? 0)
	const podcastEpisodes = toCardsPage(home.newestPodcastEpisodes, query.newestPodcastEpisodesPage ?? 0)
	const topicPosts = toCardsPage(home.newestTopicPosts ?? [], query.newestTopicPostsPage ?? 0)
	return {
		...home,
		newestTopicPodcastEpisodeVideos: films.rows,
		newestPodcastEpisodes: podcastEpisodes.rows,
		newestTopicPosts: topicPosts.rows,
		newestPages: {
			films: films.position,
			podcastEpisodes: podcastEpisodes.position,
			topicPosts: topicPosts.position,
		},
	}
}
