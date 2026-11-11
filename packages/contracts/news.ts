// the news: the News Events on a person's Topics inside a window of time, read in pages
import { z } from "zod"
import { reactionTypes } from "./enums"
import { podcastEpisode } from "./podcast"
import { topicImageUrls } from "./topicImages"

// the windows a news read covers, measured back from the request, in the order the picker offers them
export const newsWindows = ["week", "day", "hour"] as const

export type NewsWindow = (typeof newsWindows)[number]

// the window of a read that names none
export const DEFAULT_NEWS_WINDOW: NewsWindow = "week"

// how far back each window reaches, in milliseconds
export const NEWS_WINDOW_MILLISECONDS: Record<NewsWindow, number> = {
	week: 7 * 24 * 60 * 60_000,
	day: 24 * 60 * 60_000,
	hour: 60 * 60_000,
}

// each window as the picker names it
export const NEWS_WINDOW_LABELS: Record<NewsWindow, string> = { week: "Week", day: "Day", hour: "Hour" }

// the news's title on the signed-in home and on a profile page
export const NEWS_TITLE = "Brews News"

// how many rows one page of the news holds
export const NEWS_PAGE_SIZE = 5

// what a list that failed to load reads as
export const NEWS_FAILED_TEXT = "Carl couldn't get the news. He'll try again if you ask."

// where a news list shows, which its events report
export type NewsPlace = "home" | "profile"

// the kinds of News Event, in the order that rows of one time read
export const newsEventKinds = ["podcastEpisode", "topicPost", "comment", "reaction", "finding"] as const

export type NewsEventKind = (typeof newsEventKinds)[number]

// a person a row names: who wrote, posted, or reacted, or whose Comment the reactions are on
const newsEventUser = z.object({ userId: z.string(), username: z.string() })

// one row of the news. the id is unique in a read, and the path opens the row's page, Finding, or Comment
const newsEvent = z.object({
	id: z.string(),
	kind: z.enum(newsEventKinds),
	occurredAt: z.string(),
	topicId: z.string(),
	topicName: z.string(),
	// the image of the Podcast Episode or the published Topic Post the row is about, or of its Topic. null for a Topic
	// with no image yet
	image: topicImageUrls.nullable(),
	path: z.string(),
	// the Finding and the Podcast Episode the row is about, if it is about one, which its play button reads
	findingId: z.string().nullable(),
	podcastEpisodeId: z.string().nullable(),
	// the Topic Post the row is about, or that its Comment or reaction hangs on, which a Topic Post's row opens the
	// info popup of
	topicPostId: z.string().nullable(),
	// how many people listened to the row's Podcast Episode. null for every other kind of row
	listenerCount: z.number().nullable(),
	// who did it. null for a Podcast Episode, a Finding, a Comment by Carl, and the reactions on one Comment
	actor: newsEventUser.nullable(),
	// the title of the Podcast Episode, Topic Post, or Finding the row is about. null for the Topic itself
	title: z.string().nullable(),
	// a Comment's first line as plain text
	text: z.string().nullable(),
	// a single reaction's type, or the count of the reactions on one Comment with that Comment's author
	reactionType: z.enum(reactionTypes).nullable(),
	reactionCount: z.number().nullable(),
	commentAuthor: newsEventUser.nullable(),
})

export type NewsEvent = z.infer<typeof newsEvent>

// one numbered page of a window's news: its rows, the Podcast Episodes those rows play, the window's row count, and
// the window's cursor, which a read of another page passes back so every page reads the same rows
export const newsResponse = z.object({
	newsEvents: z.array(newsEvent),
	podcastEpisodes: z.array(podcastEpisode),
	total: z.number(),
	cursor: z.string(),
})

export type NewsResponse = z.infer<typeof newsResponse>

// the most pages a news read opens, far past what a week of one person's Topics holds
const NEWS_MAX_PAGE = 10_000

// a news read's query: the window, the page, and the cursor an earlier page of the window returned
export const newsQuery = z.object({
	window: z.enum(newsWindows).default(DEFAULT_NEWS_WINDOW),
	page: z.coerce.number().int().min(1).max(NEWS_MAX_PAGE).default(1),
	cursor: z.string().max(256).optional(),
})

/**
 * Returns what a window with no News Event reads as.
 */
export function toEmptyNewsText(window: NewsWindow): string {
	return `A quiet ${window}. Carl kept the kettle on.`
}
