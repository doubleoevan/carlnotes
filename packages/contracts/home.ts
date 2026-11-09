// the home page's payload: the featured topics and podcast episodes and a user's own topics as cards, and the card
// shapes both apps draw
import { z } from "zod"
import { podcastEpisodeSummary } from "./podcast"
import { profileIdentity } from "./profiles"
import type { ReactionSummary } from "./social"
import { teamIdentity } from "./teams"
import { topicImageUrls } from "./topicImages"

// how many featured topics and podcast episodes the home shows, and how many days back its new podcast episodes reach
export const FEATURED_TOPIC_COUNT = 12
export const FEATURED_PODCAST_EPISODE_COUNT = 12
export const NEW_PODCAST_EPISODE_DAYS = 7

// a topic as a card draws it: its page, its image, its byline, its tags, how many reactions it has, and the podcast
// episode its play control plays
const topicCard = z.object({
	id: z.string(),
	name: z.string(),
	path: z.string(),
	image: topicImageUrls.nullable(),
	tags: z.array(z.string()),
	owner: profileIdentity.nullable(),
	teamLink: teamIdentity.nullable(),
	reactionCount: z.number().int().nonnegative(),
	latestPodcastEpisode: podcastEpisodeSummary.nullable(),
})

export type TopicCard = z.infer<typeof topicCard>

// a podcast episode as a card draws it, with its topic's name, page, and image
const podcastEpisodeCard = z.object({
	podcastEpisode: podcastEpisodeSummary,
	topic: z.object({ id: z.string(), name: z.string(), path: z.string(), image: topicImageUrls.nullable() }),
})

export type PodcastEpisodeCard = z.infer<typeof podcastEpisodeCard>

// how many cards one page of a home card section holds, and the last page of Your topics a request may ask for
export const HOME_CARDS_PAGE_SIZE = 6
const YOUR_TOPICS_PAGE_MAX = 10_000

// one page of a user's own and followed topics as cards, and how many topics all the pages hold
export const yourTopicsPage = z.object({ topics: z.array(topicCard), totalCount: z.number().int().nonnegative() })

export type YourTopicsPage = z.infer<typeof yourTopicsPage>

// the query that asks for one page of a user's topics, zero-based
export const yourTopicsQuery = z.object({ page: z.coerce.number().int().min(0).max(YOUR_TOPICS_PAGE_MAX) })

// the home payload. a visitor's holds the featured topics and podcast episodes and the newest podcast episodes, and a
// user's adds the first page of their own and followed topics
export const homeResponse = z.object({
	featuredTopics: z.array(topicCard),
	featuredPodcastEpisodes: z.array(podcastEpisodeCard),
	newestPodcastEpisodes: z.array(podcastEpisodeCard),
	yourTopics: yourTopicsPage.nullable(),
})

export type HomeResponse = z.infer<typeof homeResponse>

/**
 * Returns how many reactions a summary holds across its types.
 */
export function toReactionCount(summary: Pick<ReactionSummary, "counts">): number {
	return summary.counts.reduce((total, { count }) => total + count, 0)
}
