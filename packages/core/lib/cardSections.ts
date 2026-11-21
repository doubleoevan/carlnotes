// a section of cards as both apps head it, what each kind of card section counts and keys by, and the server's pages
// of a team's and a topic's Topic Post cards

import { fetchTeamTopicPostsPage } from "@carlnotes/client/teamClient"
import { fetchTopicPostsPage } from "@carlnotes/client/topicPostClient"
import type { PodcastEpisodeCard, TopicCard } from "@carlnotes/contracts/home"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import type { TopicPostCard } from "@carlnotes/contracts/topicPosts"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { CardsPageRows, ServerCardPages } from "../hooks/useServerPagedCards"

// a card section: its accordion value, its title, the noun its count counts, and each row's key. a section the server
// pages names its page in the web's url under its page search key
export type CardSection<Row> = {
	value: string
	title: string
	noun: string
	toRowKey: (row: Row) => string
	pageSearchKey?: string
}

// what a section of topic cards counts and keys by
export const TOPIC_CARD_SECTION = { noun: "topic", toRowKey: (topic: TopicCard) => topic.id }

// what a section of podcast episode cards counts and keys by
export const PODCAST_EPISODE_CARD_SECTION = {
	noun: "episode",
	toRowKey: (podcastEpisodeCard: PodcastEpisodeCard) => podcastEpisodeCard.podcastEpisode.id,
}

// what a section of film cards counts and keys by
export const TOPIC_VIDEO_CARD_SECTION = { ...PODCAST_EPISODE_CARD_SECTION, noun: "film" }

// what a section of Topic Post cards counts and keys by
export const TOPIC_POST_CARD_SECTION = { noun: "post", toRowKey: (topicPost: TopicPostCard) => topicPost.id }

// the url search key that names the page of a topic's, a profile's, or a team's Topic Posts, which the server pages
export const TOPIC_POSTS_PAGE_SEARCH_KEY = "posts"

// the titles of the four card sections a profile and a team share
export const FEATURED_TOPICS_TITLE = "Featured Topics"
export const FEATURED_FILMS_TITLE = "Featured Films"
export const FEATURED_PODCASTS_TITLE = "Featured Podcasts"
export const FEATURED_POSTS_TITLE = "Featured Posts"

// a team's topics as cards, and the films, right before the podcast episodes, and the Topic Posts of those topics as
// cards
export const TEAM_SECTIONS = {
	topicCards: { value: "team-topic-cards", title: FEATURED_TOPICS_TITLE, ...TOPIC_CARD_SECTION },
	topicPodcastEpisodeVideoCards: {
		value: "team-topic-video-cards",
		title: FEATURED_FILMS_TITLE,
		...TOPIC_VIDEO_CARD_SECTION,
	},
	podcastEpisodeCards: {
		value: "team-podcast-episode-cards",
		title: FEATURED_PODCASTS_TITLE,
		...PODCAST_EPISODE_CARD_SECTION,
	},
	topicPostCards: {
		value: "team-topic-post-cards",
		title: FEATURED_POSTS_TITLE,
		pageSearchKey: TOPIC_POSTS_PAGE_SEARCH_KEY,
		...TOPIC_POST_CARD_SECTION,
	},
}

// the values of the team's card sections, which start open
export const TEAM_SECTION_VALUES = Object.values(TEAM_SECTIONS).map((teamSection) => teamSection.value)

// the values of the team page's sections, which start open: the card sections, then the members, topics, and notes
export const TEAM_PAGE_SECTION_VALUES = [...TEAM_SECTION_VALUES, "members", "topics", "notes"]

// the tooltip over the team page's topics table
export const TEAM_TOPICS_TOOLTIP = "Topics on this team"

// a fetched page that holds its cards under the list key, and how many cards the whole section holds
type CardsListPage<ListKey extends string, Row> = Record<ListKey, Row[]> & { totalCount: number }

/**
 * Returns a function that turns a fetched page, which holds its cards under the list key, into a section's rows and
 * total count.
 */
export function toCardsPageRows<ListKey extends string>(
	listKey: ListKey,
): <Row>(cardsListPage: CardsListPage<ListKey, Row>) => CardsPageRows<Row> {
	return (cardsListPage) => ({ rows: cardsListPage[listKey], totalCount: cardsListPage.totalCount })
}

/**
 * Returns the pages of a team's Topic Post cards if its read asked for pages, or undefined for a read that holds them
 * whole.
 */
export function toTeamTopicPostCardPages(teamPage: TeamPageResponse): ServerCardPages<TopicPostCard> | undefined {
	const { teamId, topicPostCards, topicPostCardsPage } = teamPage
	if (!topicPostCardsPage) {
		return undefined
	}
	return {
		queryKey: ["team-topic-posts", teamId],
		loadedPage: { rows: topicPostCards, ...topicPostCardsPage },
		fetchPage: (page) => fetchTeamTopicPostsPage(teamId, page).then(toCardsPageRows("topicPosts")),
	}
}

/**
 * Returns the server's pages of a topic's Topic Posts, or undefined if the topic page holds them whole.
 */
export function toTopicTopicPostCardPages(topicPage: TopicResponse): ServerCardPages<TopicPostCard> | undefined {
	const { id: topicId, topicPosts, topicPostsPage } = topicPage
	if (!topicPosts || !topicPostsPage) {
		return undefined
	}
	return {
		queryKey: ["topic-topic-posts", topicId],
		loadedPage: { rows: topicPosts.topicPosts, ...topicPostsPage },
		fetchPage: (page) =>
			fetchTopicPostsPage(topicId, page).then(({ topicPosts: pageTopicPosts, totalCount }) => ({
				rows: pageTopicPosts,
				totalCount: totalCount ?? pageTopicPosts.length,
			})),
	}
}

/**
 * Returns the options of a topic, profile, or team read that pages its Topic Posts, at the page from 1 that a url names.
 */
export function toTopicPostsPageOptions(pageNumber?: number): { isPaged: true; topicPostsPage: number } {
	return { isPaged: true, topicPostsPage: toZeroBasedPage(pageNumber) }
}

/**
 * Returns the zero-based page that a page number from 1 names, the first page if it names none.
 */
export function toZeroBasedPage(pageNumber: number | undefined): number {
	return pageNumber ? pageNumber - 1 : 0
}
