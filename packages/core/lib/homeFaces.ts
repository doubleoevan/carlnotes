// the home page's two faces, as both apps word them: the card sections, the three steps a visitor reads, and the
// visit event a home topic, film, podcast, or post card's open reports

import type { HomeResponse, PodcastEpisodeCard, TopicCard } from "@carlnotes/contracts/home"
import type { TopicPostCard } from "@carlnotes/contracts/topicPosts"
import {
	type CardSection,
	PODCAST_EPISODE_CARD_SECTION,
	TOPIC_CARD_SECTION,
	TOPIC_PODCAST_EPISODE_VIDEO_CARD_SECTION,
	TOPIC_POST_CARD_SECTION,
} from "./cardSections"

// the card sections in the order both homes show them, under the home payload's field names. the films come right
// before the podcasts, the posts right after them, and each week's new cards right after their home cards
export const HOME_SECTIONS = {
	homeTopics: { value: "home-topics", title: "Featured topics", ...TOPIC_CARD_SECTION },
	homeTopicPodcastEpisodeVideos: {
		value: "home-topic-podcast-episode-videos",
		title: "Featured films",
		...TOPIC_PODCAST_EPISODE_VIDEO_CARD_SECTION,
	},
	newestTopicPodcastEpisodeVideos: {
		value: "newest-topic-podcast-episode-videos",
		title: "New films this week",
		...TOPIC_PODCAST_EPISODE_VIDEO_CARD_SECTION,
	},
	homePodcastEpisodes: {
		value: "home-podcast-episodes",
		title: "Featured podcasts",
		...PODCAST_EPISODE_CARD_SECTION,
	},
	newestPodcastEpisodes: {
		value: "newest-podcast-episodes",
		title: "New podcasts this week",
		...PODCAST_EPISODE_CARD_SECTION,
	},
	homeTopicPosts: { value: "home-topic-posts", title: "Featured posts", ...TOPIC_POST_CARD_SECTION },
	newestTopicPosts: { value: "newest-topic-posts", title: "New posts this week", ...TOPIC_POST_CARD_SECTION },
	yourTopics: { value: "your-topics", title: "Your topics", ...TOPIC_CARD_SECTION },
} satisfies Record<
	keyof HomeResponse,
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
		text: "Ranked topic findings with summaries, a video and a podcast with Carl and Vienna, and a chat that did all the research.",
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
