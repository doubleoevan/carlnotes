// the home page's client: the home topics and podcast episodes, a user's topics, and the later pages of the week's new
// sections as cards
import {
	type HomeQuery,
	type HomeResponse,
	homeResponse,
	type PodcastEpisodeCardsPage,
	podcastEpisodeCardsPage,
	type YourTopicsPage,
	yourTopicsPage,
} from "@carlnotes/contracts/home"
import { type TopicPostCardsPage, topicPostCardsPage } from "@carlnotes/contracts/topicPosts"
import { apiClient, readPageResponse } from "./apiClient"
import { toPageQuery } from "./cardPagesQuery"

// the zero-based page of each of the week's new sections that the home read holds
type FetchHomeOptions = Pick<HomeQuery, "newestFilmsPage" | "newestPodcastEpisodesPage" | "newestTopicPostsPage">

/**
 * Fetches the home payload, rejecting a failed read. The read holds one page of each of the week's new sections.
 */
export async function fetchHome({
	newestFilmsPage,
	newestPodcastEpisodesPage,
	newestTopicPostsPage,
}: FetchHomeOptions = {}): Promise<HomeResponse> {
	// the pages the read names, each left out if it is the first
	const query = {
		paged: "1" as const,
		newestFilmsPage: toPageQuery(newestFilmsPage),
		newestPodcastEpisodesPage: toPageQuery(newestPodcastEpisodesPage),
		newestTopicPostsPage: toPageQuery(newestTopicPostsPage),
	}
	return readPageResponse(homeResponse, apiClient().api.home.$get({ query }), "home")
}

/**
 * Fetches one zero-based page of the signed-in user's own and followed topics, rejecting a failed read.
 */
export async function fetchYourTopicsPage(page: number): Promise<YourTopicsPage> {
	return readPageResponse(
		yourTopicsPage,
		apiClient().api.home["your-topics"].$get({ query: { page: String(page) } }),
		"your topics",
	)
}

/**
 * Fetches one zero-based page of the week's new films, rejecting a failed read.
 */
export async function fetchNewestFilmsPage(page: number): Promise<PodcastEpisodeCardsPage> {
	return readPageResponse(
		podcastEpisodeCardsPage,
		apiClient().api.home["newest-films"].$get({ query: { page: String(page) } }),
		"newest films",
	)
}

/**
 * Fetches one zero-based page of the week's new podcast episodes, rejecting a failed read.
 */
export async function fetchNewestPodcastEpisodesPage(page: number): Promise<PodcastEpisodeCardsPage> {
	return readPageResponse(
		podcastEpisodeCardsPage,
		apiClient().api.home["newest-podcast-episodes"].$get({ query: { page: String(page) } }),
		"newest podcast episodes",
	)
}

/**
 * Fetches one zero-based page of the week's new Topic Posts, rejecting a failed read.
 */
export async function fetchNewestTopicPostsPage(page: number): Promise<TopicPostCardsPage> {
	return readPageResponse(
		topicPostCardsPage,
		apiClient().api.home["newest-topic-posts"].$get({ query: { page: String(page) } }),
		"newest topic posts",
	)
}
