// the home page's two faces, as both apps word them: the card sections, the three steps a visitor reads, and the
// visit event a home topic or podcast card's open reports

import type { HomeResponse, PodcastEpisodeCard, TopicCard } from "@carlnotes/contracts/home"

// a card section as both homes head it: its accordion value, its title, the noun its count counts, and each row's key
export type HomeCardSection<Row> = { value: string; title: string; noun: string; toRowKey: (row: Row) => string }

// what a section of topic cards and a section of podcast episode cards count and key by
const TOPIC_SECTION = { noun: "topic", toRowKey: (topic: TopicCard) => topic.id }
const PODCAST_EPISODE_SECTION = {
	noun: "episode",
	toRowKey: (podcastEpisodeCard: PodcastEpisodeCard) => podcastEpisodeCard.podcastEpisode.id,
}

// the card sections in the order both homes show them, under the home payload's field names
export const HOME_SECTIONS = {
	homeTopics: { value: "home-topics", title: "Home topics", ...TOPIC_SECTION },
	homePodcastEpisodes: {
		value: "home-podcast-episodes",
		title: "Home podcasts",
		...PODCAST_EPISODE_SECTION,
	},
	newestPodcastEpisodes: {
		value: "newest-podcast-episodes",
		title: "New podcasts this week",
		...PODCAST_EPISODE_SECTION,
	},
	yourTopics: { value: "your-topics", title: "Your topics", ...TOPIC_SECTION },
} satisfies Record<keyof HomeResponse, HomeCardSection<TopicCard> | HomeCardSection<PodcastEpisodeCard>>

// the title over the three steps
export const HOW_IT_WORKS_TITLE = "How it works"

// the three steps a visitor reads, in Carl's voice
export const HOW_IT_WORKS_STEPS = [
	{ title: "Give Carl a topic.", text: "Name it, add a few sources, and pick how often he scans." },
	{ title: "Carl reads everything.", text: "Every night he scans what's new and keeps what's worth your time." },
	{
		title: "You get the notes.",
		text: "Ranked topic findings with summaries, a podcast with Carl and Vienna, and a chat that already did the research.",
	},
] as const

// an empty payload, shown while a user's loads and after a failed read
export const EMPTY_HOME: HomeResponse = {
	homeTopics: [],
	homePodcastEpisodes: [],
	newestPodcastEpisodes: [],
	yourTopics: null,
}
