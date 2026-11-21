// the home page's payload: the home topics, films, podcast episodes, and Topic Posts and a user's own topics as
// cards, and the card shapes both apps draw
import { z } from "zod"
import { cardsPagePosition, optionalCardsPageNumber, pagedQuery } from "./cardPages"
import { newsResponse, newsWindows } from "./news"
import { podcastEpisodeSummary } from "./podcast"
import { profileIdentity } from "./profiles"
import type { ReactionSummary } from "./social"
import { teamIdentity } from "./teamIdentity"
import { topicImageUrls } from "./topicImages"
import { topicPostCard } from "./topicPosts"

// how many home topics, podcast episodes, and Topic Posts the home shows, and how many days back its new podcast
// episodes and its new Topic Posts reach
export const HOME_TOPIC_COUNT = 12
export const HOME_PODCAST_EPISODE_COUNT = 12
export const HOME_TOPIC_POST_COUNT = 12
export const NEW_PODCAST_EPISODE_DAYS = 7
export const NEW_TOPIC_POST_DAYS = 7

// a topic as a card draws it: its page, its image, its byline, its tags, how many reactions it has, and the podcast
// episode its play control plays
export const topicCard = z.object({
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

// a podcast episode as a card draws it, with its topic's name, page, and image, and how many reactions it has
export const podcastEpisodeCard = z.object({
	podcastEpisode: podcastEpisodeSummary,
	topic: z.object({ id: z.string(), name: z.string(), path: z.string(), image: topicImageUrls.nullable() }),
	reactionCount: z.number().int().nonnegative(),
})

export type PodcastEpisodeCard = z.infer<typeof podcastEpisodeCard>

// one page of a user's own and followed topics as cards, and how many topics all the pages hold
export const yourTopicsPage = z.object({ topics: z.array(topicCard), totalCount: z.number().int().nonnegative() })

export type YourTopicsPage = z.infer<typeof yourTopicsPage>

// one page of the week's new films or new podcast episodes as cards, and how many the whole week holds
export const podcastEpisodeCardsPage = z.object({
	podcastEpisodes: z.array(podcastEpisodeCard),
	totalCount: z.number().int().nonnegative(),
})

export type PodcastEpisodeCardsPage = z.infer<typeof podcastEpisodeCardsPage>

// the home read's query: the window of the first news page a signed-in home asks for in the same read, and whether
// the read pages the week's new sections, with the zero-based page of each it holds
export const homeQuery = z.object({
	newsWindow: z.enum(newsWindows).optional(),
	...pagedQuery.shape,
	newestFilmsPage: optionalCardsPageNumber,
	newestPodcastEpisodesPage: optionalCardsPageNumber,
	newestTopicPostsPage: optionalCardsPageNumber,
})

export type HomeQuery = z.infer<typeof homeQuery>

// the home payload. a visitor's holds the home topics, the home and newest films, the home and newest podcast
// episodes, and the home and newest Topic Posts, and a user's adds the first page of their own and followed topics.
// the films and the newest Topic Posts are optional, so a released app reads a payload without them
// the two film fields' names must not change, because the frozen api contract reads them
export const homeResponse = z.object({
	homeTopics: z.array(topicCard),
	homeTopicPodcastEpisodeVideos: z.array(podcastEpisodeCard).optional(),
	newestTopicPodcastEpisodeVideos: z.array(podcastEpisodeCard).optional(),
	homePodcastEpisodes: z.array(podcastEpisodeCard),
	newestPodcastEpisodes: z.array(podcastEpisodeCard),
	homeTopicPosts: z.array(topicPostCard),
	newestTopicPosts: z.array(topicPostCard).optional(),
	yourTopics: yourTopicsPage.nullable(),
	// the first page of a user's news, if the request asked for it, and null if its read failed. absent otherwise
	news: newsResponse.nullable().optional(),
	// which page each of the week's new lists holds, if the request asked for pages. absent otherwise
	newestPages: z
		.object({ films: cardsPagePosition, podcastEpisodes: cardsPagePosition, topicPosts: cardsPagePosition })
		.optional(),
})

export type HomeResponse = z.infer<typeof homeResponse>

/**
 * Returns how many reactions a summary holds across its types.
 */
export function toReactionCount(summary: Pick<ReactionSummary, "counts">): number {
	return summary.counts.reduce((total, { count }) => total + count, 0)
}
