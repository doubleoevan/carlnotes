// the podcast contracts: an episode, its chapters, summary, transcript, and script, and a topic's podcast
import { z } from "zod"
import { ratings, visibilities } from "../enums"
import type { PodcastEpisodeChapterScript, PodcastEpisodeTurn } from "../payloads"

// one chapter of a podcast episode, in the shape that the player shows
export const podcastEpisodeChapter = z.object({
	position: z.number(),
	title: z.string(),
	// the finding that the chapter narrates, null once a scan filtered the finding out. the source url stays
	findingId: z.string().nullable(),
	sourceUrl: z.string(),
	// the chapter's own rating, which rates a chapter whose finding was filtered out
	rating: z.enum(ratings).nullable(),
	// the path of the source host's stored favicon, null except on a podcast episode's own page
	faviconPath: z.string().nullable(),
	startSeconds: z.number(),
	endSeconds: z.number(),
})

export type PodcastEpisodeChapter = z.infer<typeof podcastEpisodeChapter>

// a published podcast episode as a table row, its play button, and its tooltip show it: its page, title, and
// description, its season, number, length, and publish time, and how many chapters it has
export const podcastEpisodeSummary = z.object({
	id: z.string(),
	title: z.string().nullable(),
	description: z.string().nullable(),
	// the publish year, the episode number within that year, the length, and the publish time.
	// all are null until the podcast episode publishes
	season: z.number().nullable(),
	episodeNumber: z.number().nullable(),
	durationSeconds: z.number().nullable(),
	publishedAt: z.string().nullable(),
	// the podcast episode's own page, null until the podcast episode publishes
	pagePath: z.string().nullable(),
	chapterCount: z.number(),
})

export type PodcastEpisodeSummary = z.infer<typeof podcastEpisodeSummary>

// a published podcast episode's summary, with the season and number it was published under
export const publishedPodcastEpisodeSummary = podcastEpisodeSummary.extend({
	season: z.number(),
	episodeNumber: z.number(),
})

export type PublishedPodcastEpisodeSummary = z.infer<typeof publishedPodcastEpisodeSummary>

// a podcast episode in the shape that the player shows: its summary, its topic, its status, its audio and covers, its
// chapters, and the user's progress. a recording or failed episode has its status and its title once written
export const podcastEpisode = podcastEpisodeSummary.extend({
	topicId: z.string(),
	// the visibility of the episode's topic
	topicVisibility: z.enum(visibilities),
	status: z.enum(["recording", "published", "failed"]),
	// the stable audio url, null until the podcast episode publishes.
	// the cover's url at each size, null until the episode has a title
	audioUrl: z.string().nullable(),
	coverUrl: z.string().nullable(),
	smallCoverUrl: z.string().nullable(),
	chapters: z.array(podcastEpisodeChapter),
	// where the user stopped listening and whether the user finished. zero and false for a visitor
	progressSeconds: z.number(),
	isCompleted: z.boolean(),
	// whether voice chat is configured
	isVoiceChatConfigured: z.boolean(),
})

export type PodcastEpisode = z.infer<typeof podcastEpisode>

// a season's episodes for the podcast episodes' card, newest first, without their chapters
export const seasonPodcastEpisodes = z.object({ podcastEpisodes: z.array(podcastEpisode) })

export type SeasonPodcastEpisodes = z.infer<typeof seasonPodcastEpisodes>

// one block of a podcast episode's transcript. a chapter under its title,
// or the cold open, a transition, or the sign-off under no heading
export const podcastEpisodeTranscriptBlock = z.object({
	heading: z.string().nullable(),
	turns: z.array(z.object({ speakerName: z.string(), text: z.string() })),
})

export type PodcastEpisodeTranscriptBlock = z.infer<typeof podcastEpisodeTranscriptBlock>

// a topic's podcast as its page shows it
export const topicPodcast = z.object({
	// whether the owner has the podcast on
	isEnabled: z.boolean(),
	// whether the owner's plan gets full podcast episodes. the free plan gets short ones and only keeps the latest
	hasFullPodcastEpisodes: z.boolean(),
	// whether this user may remove a podcast episode
	canRemovePodcastEpisodes: z.boolean(),
	// the topic's newest podcast episode if it is recording or failed to record, without chapters,
	// and if the user may see it. null once a later episode publishes
	unpublishedPodcastEpisode: podcastEpisode.nullable(),
	// the seasons that have a published podcast episode, newest first
	seasons: z.array(z.number()),
	// the latest season's podcast episodes
	latestSeasonPodcastEpisodes: seasonPodcastEpisodes,
	// the public podcast feed, for a public topic with a published episode, and null for every other topic
	publicFeedUrl: z.string().nullable(),
})

export type TopicPodcast = z.infer<typeof topicPodcast>

// the length limits of a podcast episode's title and description
export const PODCAST_EPISODE_TITLE_MAX_CHARS = 60

export const PODCAST_EPISODE_DESCRIPTION_MAX_CHARS = 155

// a podcast episode's entire script. the cold open, the themed segments in order, and the sign-off and goodbye.
// each segment has the short transition into the segment, then its chapters
export type PodcastEpisodeScript = {
	coldOpen: PodcastEpisodeTurn[]
	segments: { transition: PodcastEpisodeTurn[]; chapters: PodcastEpisodeChapterScript[] }[]
	signOff: PodcastEpisodeTurn[]
}
