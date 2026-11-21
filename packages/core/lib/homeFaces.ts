// the home page's two faces as both apps word them: the card sections, the server's pages of the week's new sections
// and of your topics, and the three steps a visitor reads

import {
	type fetchHome,
	fetchNewestFilmsPage,
	fetchNewestPodcastEpisodesPage,
	fetchNewestTopicPostsPage,
	fetchYourTopicsPage,
} from "@carlnotes/client/homeClient"
import type { HomeResponse, PodcastEpisodeCard, TopicCard, YourTopicsPage } from "@carlnotes/contracts/home"
import type { TopicPostCard } from "@carlnotes/contracts/topicPosts"
import type { ServerCardPages } from "../hooks/useServerPagedCards"
import {
	type CardSection,
	PODCAST_EPISODE_CARD_SECTION,
	TOPIC_CARD_SECTION,
	TOPIC_POST_CARD_SECTION,
	TOPIC_VIDEO_CARD_SECTION,
	toCardsPageRows,
	toZeroBasedPage,
} from "./cardSections"

// the url search keys that name the page of each of the week's new sections on the web
export const HOME_NEWEST_PAGE_SEARCH_KEYS = {
	films: "newFilms",
	podcastEpisodes: "newPodcasts",
	topicPosts: "newPosts",
} as const

// the card sections in the order both homes show them, under the home payload's field names. the films come right
// before the podcasts, the posts right after them, and each week's new cards right after their home cards. the server
// pages each week's new section, and the web names its page in the url under the section's page search key
export const HOME_SECTIONS = {
	homeTopics: { value: "home-topics", title: "Featured topics", ...TOPIC_CARD_SECTION },
	homeTopicPodcastEpisodeVideos: {
		value: "home-topic-videos",
		title: "Featured films",
		...TOPIC_VIDEO_CARD_SECTION,
	},
	newestTopicPodcastEpisodeVideos: {
		value: "newest-topic-videos",
		title: "New films this week",
		pageSearchKey: HOME_NEWEST_PAGE_SEARCH_KEYS.films,
		...TOPIC_VIDEO_CARD_SECTION,
	},
	homePodcastEpisodes: {
		value: "home-podcast-episodes",
		title: "Featured podcasts",
		...PODCAST_EPISODE_CARD_SECTION,
	},
	newestPodcastEpisodes: {
		value: "newest-podcast-episodes",
		title: "New podcasts this week",
		pageSearchKey: HOME_NEWEST_PAGE_SEARCH_KEYS.podcastEpisodes,
		...PODCAST_EPISODE_CARD_SECTION,
	},
	homeTopicPosts: { value: "home-topic-posts", title: "Featured posts", ...TOPIC_POST_CARD_SECTION },
	newestTopicPosts: {
		value: "newest-topic-posts",
		title: "New posts this week",
		pageSearchKey: HOME_NEWEST_PAGE_SEARCH_KEYS.topicPosts,
		...TOPIC_POST_CARD_SECTION,
	},
	yourTopics: { value: "your-topics", title: "Your topics", ...TOPIC_CARD_SECTION },
} satisfies Record<
	Exclude<keyof HomeResponse, "news" | "newestPages">,
	CardSection<TopicCard> | CardSection<PodcastEpisodeCard> | CardSection<TopicPostCard>
>

// the title over the three steps
export const HOW_IT_WORKS_TITLE = "How it works"

// the three steps a visitor reads, in Carl's voice
export const HOW_IT_WORKS_STEPS = [
	{ title: "Give Carl a topic.", text: "Name it, add a few sources, and pick how often he scans." },
	{ title: "Carl reads everything.", text: "Every night he scans what's new and keeps what's worth your time." },
	{
		title: "You get the notes.",
		text: "Ranked topic findings with summaries, films and a podcast with Carl and Vienna, and a chat that did all the research.",
	},
] as const

// an empty payload, shown while a user's loads and after a failed read
export const EMPTY_HOME: HomeResponse = {
	homeTopics: [],
	homeTopicPodcastEpisodeVideos: [],
	newestTopicPodcastEpisodeVideos: [],
	homePodcastEpisodes: [],
	newestPodcastEpisodes: [],
	homeTopicPosts: [],
	newestTopicPosts: [],
	yourTopics: null,
}

// the page from 1 of each of the week's new sections that the web's url names. a section it leaves out shows its
// first page
type HomeNewestPageNumbers = Partial<
	Record<(typeof HOME_NEWEST_PAGE_SEARCH_KEYS)[keyof typeof HOME_NEWEST_PAGE_SEARCH_KEYS], number>
>

/**
 * Returns the options of a home read at the pages of the week's new sections that a url names.
 */
export function toHomePageOptions(pageNumbers: HomeNewestPageNumbers = {}): Parameters<typeof fetchHome>[0] {
	return {
		newestFilmsPage: toZeroBasedPage(pageNumbers.newFilms),
		newestPodcastEpisodesPage: toZeroBasedPage(pageNumbers.newPodcasts),
		newestTopicPostsPage: toZeroBasedPage(pageNumbers.newPosts),
	}
}

// the week's new sections the server pages, each with the page the home holds and the read of any other page
type HomeNewestCardPages = {
	films: ServerCardPages<PodcastEpisodeCard>
	podcastEpisodes: ServerCardPages<PodcastEpisodeCard>
	topicPosts: ServerCardPages<TopicPostCard>
}

// the rows of a section the home read leaves out, one array so the paged cards see the same page on every render
const NO_CARDS: never[] = []

/**
 * Returns the pages of the week's new sections of a home read that asked for pages, or null for a home read whole.
 */
export function toHomeNewestCardPages(home: HomeResponse): HomeNewestCardPages | null {
	const { newestPages } = home
	if (!newestPages) {
		return null
	}
	return {
		films: {
			queryKey: ["newest-films"],
			loadedPage: { rows: home.newestTopicPodcastEpisodeVideos ?? NO_CARDS, ...newestPages.films },
			fetchPage: (page) => fetchNewestFilmsPage(page).then(toCardsPageRows("podcastEpisodes")),
		},
		podcastEpisodes: {
			queryKey: ["newest-podcast-episodes"],
			loadedPage: { rows: home.newestPodcastEpisodes, ...newestPages.podcastEpisodes },
			fetchPage: (page) => fetchNewestPodcastEpisodesPage(page).then(toCardsPageRows("podcastEpisodes")),
		},
		topicPosts: {
			queryKey: ["newest-topic-posts"],
			loadedPage: { rows: home.newestTopicPosts ?? NO_CARDS, ...newestPages.topicPosts },
			fetchPage: (page) => fetchNewestTopicPostsPage(page).then(toCardsPageRows("topicPosts")),
		},
	}
}

/**
 * Returns the pages of a user's own and followed topics: the first, which the home holds, and the read of any other.
 */
export function toYourTopicsCardPages(yourTopics: YourTopicsPage): ServerCardPages<TopicCard> {
	return {
		queryKey: ["your-topics"],
		loadedPage: { rows: yourTopics.topics, page: 0, totalCount: yourTopics.totalCount },
		fetchPage: (page) => fetchYourTopicsPage(page).then(toCardsPageRows("topics")),
	}
}
