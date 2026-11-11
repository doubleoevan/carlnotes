// a section of cards as both apps head it, on the home, on a profile, and on a team, and what a section of topic
// cards, of podcast episode cards, of film cards, and of Topic Post cards count and key by

import type { PodcastEpisodeCard, TopicCard } from "@carlnotes/contracts/home"
import type { TopicPostCard } from "@carlnotes/contracts/topicPosts"

// a card section: its accordion value, its title, the noun its count counts, and each row's key
export type CardSection<Row> = { value: string; title: string; noun: string; toRowKey: (row: Row) => string }

// what a section of topic cards counts and keys by
export const TOPIC_CARD_SECTION = { noun: "topic", toRowKey: (topic: TopicCard) => topic.id }

// what a section of podcast episode cards counts and keys by
export const PODCAST_EPISODE_CARD_SECTION = {
	noun: "episode",
	toRowKey: (podcastEpisodeCard: PodcastEpisodeCard) => podcastEpisodeCard.podcastEpisode.id,
}

// what a section of film cards counts and keys by
export const TOPIC_PODCAST_EPISODE_VIDEO_CARD_SECTION = { ...PODCAST_EPISODE_CARD_SECTION, noun: "film" }

// what a section of Topic Post cards counts and keys by
export const TOPIC_POST_CARD_SECTION = { noun: "post", toRowKey: (topicPost: TopicPostCard) => topicPost.id }

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
		value: "team-topic-podcast-episode-video-cards",
		title: FEATURED_FILMS_TITLE,
		...TOPIC_PODCAST_EPISODE_VIDEO_CARD_SECTION,
	},
	podcastEpisodeCards: {
		value: "team-podcast-episode-cards",
		title: FEATURED_PODCASTS_TITLE,
		...PODCAST_EPISODE_CARD_SECTION,
	},
	topicPostCards: { value: "team-topic-post-cards", title: FEATURED_POSTS_TITLE, ...TOPIC_POST_CARD_SECTION },
}

// the values of the team's card sections, which start open
export const TEAM_SECTION_VALUES = Object.values(TEAM_SECTIONS).map((teamSection) => teamSection.value)
