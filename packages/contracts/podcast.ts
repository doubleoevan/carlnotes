// the podcast contracts: an episode, its chapters, summary, transcript, and script, and a topic's podcast
import { z } from "zod"
import { ratings, visibilities } from "./enums"
import type { PodcastEpisodeChapterScript, PodcastEpisodeTurn } from "./payloads"
import { displayEnum } from "./tolerantReads"
import { topicImageUrls } from "./topicImages"

// one chapter of a podcast episode, in the shape that the player shows
const podcastEpisodeChapter = z.object({
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
	// the podcast episode's own image at every size, with no text on it, null until it is drawn
	image: topicImageUrls.nullable(),
	// whether the podcast episode has a ready film. an older api leaves it out
	hasVideo: z.boolean().optional(),
	// the url of the ready film's own image, null with no ready film or until the film has one. an older api leaves it
	// out
	videoPosterUrl: z.string().nullable().optional(),
})

export type PodcastEpisodeSummary = z.infer<typeof podcastEpisodeSummary>

// a podcast episode pinned among the home podcast episodes: its title, its topic's name, its page, and its position
export const homePodcastEpisode = z.object({
	id: z.string(),
	title: z.string(),
	topicName: z.string(),
	pagePath: z.string(),
	homeOrder: z.number(),
})

export type HomePodcastEpisode = z.infer<typeof homePodcastEpisode>

/**
 * Returns a home podcast episode's label in a list: its title, then its topic's name.
 */
export function toHomePodcastEpisodeLabel({
	title,
	topicName,
}: Pick<HomePodcastEpisode, "title" | "topicName">): string {
	return `${title} · ${topicName}`
}

// a published podcast episode's summary, with the season and number it was published under
export const publishedPodcastEpisodeSummary = podcastEpisodeSummary.extend({
	season: z.number(),
	episodeNumber: z.number(),
})

type PublishedPodcastEpisodeSummary = z.infer<typeof publishedPodcastEpisodeSummary>

// the season and number a published podcast episode is given
export type PublishedPodcastEpisodeNumbers = Pick<PublishedPodcastEpisodeSummary, "season" | "episodeNumber">

/**
 * Whether a podcast episode has the season and number a published one is given.
 */
export function isPublishedPodcastEpisode<T extends { season: number | null; episodeNumber: number | null }>(
	podcastEpisode: T,
): podcastEpisode is T & PublishedPodcastEpisodeNumbers {
	return podcastEpisode.season !== null && podcastEpisode.episodeNumber !== null
}

// a podcast episode's film: its stable video url, its captions url, and the url of its own image for the poster,
// which is null until the film has one and optional, so a released app reads a film without it
const topicPodcastEpisodeVideo = z.object({
	videoUrl: z.string(),
	captionsUrl: z.string(),
	posterUrl: z.string().nullable().optional(),
})

export type TopicPodcastEpisodeVideo = z.infer<typeof topicPodcastEpisodeVideo>

// the formats a podcast episode plays in
export const podcastEpisodeFormats = ["audio", "video"] as const

export type PodcastEpisodeFormat = (typeof podcastEpisodeFormats)[number]

// a podcast episode in the shape that the player shows: its summary, its topic, its status, its audio and covers, its
// chapters, and the user's progress. a recording or failed episode has its status and its title once written
export const podcastEpisode = podcastEpisodeSummary.extend({
	topicId: z.string(),
	// the visibility of the episode's topic
	topicVisibility: z.enum(visibilities),
	status: displayEnum(["recording", "published", "failed"]),
	// the stable audio url, null until the podcast episode publishes.
	// the cover's url at each size, null until the episode has a title
	audioUrl: z.string().nullable(),
	coverUrl: z.string().nullable(),
	smallCoverUrl: z.string().nullable(),
	// the film, null if the podcast episode has no ready film. an older api leaves it out
	video: topicPodcastEpisodeVideo.nullable().optional(),
	// whether the podcast episode's film is rendering. an older api leaves it out
	isVideoRendering: z.boolean().optional(),
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

// the newest unplayed podcast episode from another topic that the user owns or subscribes to, or null with none
export const nextUnplayedPodcastEpisodeResponse = z.object({ podcastEpisode: podcastEpisode.nullable() })

// the url of the user's podcast feed for a topic, which a feed read and a feed reset both return
export const podcastFeedUrlResponse = z.object({
	podcastFeedUrl: z.string(),
	// the film feed's url, beside the podcast feed's, if the Topic has a film
	podcastVideoFeedUrl: z.string().nullable().optional(),
})
export type PodcastFeedUrlResponse = z.infer<typeof podcastFeedUrlResponse>

// one turn as a transcript reads it: its speaker's name and its words
export const podcastEpisodeTranscriptTurn = z.object({ speakerName: z.string(), text: z.string() })

export type PodcastEpisodeTranscriptTurn = z.infer<typeof podcastEpisodeTranscriptTurn>

// one block of a podcast episode's transcript. a chapter under its title,
// or the cold open, a transition, or the sign-off under no heading
export const podcastEpisodeTranscriptBlock = z.object({
	heading: z.string().nullable(),
	turns: z.array(podcastEpisodeTranscriptTurn),
})

export type PodcastEpisodeTranscriptBlock = z.infer<typeof podcastEpisodeTranscriptBlock>

// a topic's podcast as its page shows it
export const topicPodcast = z.object({
	// whether the owner has the podcast on
	isEnabled: z.boolean(),
	// whether the owner lets the podcast talk about comments
	isCommentsEnabled: z.boolean(),
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
	// Topic Cinema: the latest film the user may watch and whether its section opens, null with no film. an older api
	// leaves it out
	topicPodcastEpisodeVideoSection: z
		.object({ podcastEpisode: podcastEpisode, isOpen: z.boolean() })
		.nullable()
		.optional(),
	// the public film feed, for a public topic with a film, and null for every other topic. an older api leaves it out
	publicVideoFeedUrl: z.string().nullable().optional(),
})

export type TopicPodcast = z.infer<typeof topicPodcast>

// a user's choice to open or close Topic Cinema, with the latest film when they chose
export const topicPodcastEpisodeVideoSectionPayload = z.object({ isOpen: z.boolean(), podcastEpisodeId: z.string() })

// the length limits of a podcast episode's title and description
export const PODCAST_EPISODE_TITLE_MAX_CHARS = 60

export const PODCAST_EPISODE_DESCRIPTION_MAX_CHARS = 155

// an editor's change to a podcast episode's title and description, trimmed and within their limits
export const updatePodcastEpisodePayload = z.object({
	title: z.string().trim().min(1).max(PODCAST_EPISODE_TITLE_MAX_CHARS),
	description: z.string().trim().max(PODCAST_EPISODE_DESCRIPTION_MAX_CHARS),
})

export type UpdatePodcastEpisodePayload = z.infer<typeof updatePodcastEpisodePayload>

// a podcast episode's entire script. the cold open, the themed segments in order, and the sign-off and goodbye.
// each segment has the short transition into the segment, then its chapters
export type PodcastEpisodeScript = {
	coldOpen: PodcastEpisodeTurn[]
	segments: { transition: PodcastEpisodeTurn[]; chapters: PodcastEpisodeChapterScript[] }[]
	signOff: PodcastEpisodeTurn[]
}

// a session-authorized, short-lived media source kept only in a player's memory
export const podcastEpisodeAudio = z.object({
	audioUrl: z.url().refine((url) => url.startsWith("https://")),
	expiresAt: z.iso.datetime(),
})

export type PodcastEpisodeAudio = z.infer<typeof podcastEpisodeAudio>

// a film's short-lived url, which a platform player loads without the session, and when the url expires
export const topicPodcastEpisodeVideoFile = z.object({
	videoUrl: z.url().refine((url) => url.startsWith("https://")),
	expiresAt: z.iso.datetime(),
})
export type TopicPodcastEpisodeVideoFile = z.infer<typeof topicPodcastEpisodeVideoFile>
