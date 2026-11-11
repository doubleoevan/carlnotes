// the pages of a news list in the web and mobile stories
import { NEWS_PAGE_SIZE, type NewsEvent, type NewsResponse } from "@carlnotes/contracts/news"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { PODCAST_STORY_EPISODE } from "./podcastEpisodeStories"

// how many rows the story's week holds, enough for seven pages
const NEWS_STORY_ROW_COUNT = 32

// when the story's newest row happened
const NEWS_STORY_NEWEST_AT = Date.parse("2026-11-09T12:00:00Z")

// the Topic every story row belongs to
const NEWS_STORY_TOPIC = { topicId: "topic-espresso", topicName: "Home espresso" }

// the placeholder that shows as a story row's image, which the app serves from its public files
const NEWS_STORY_IMAGE_FILES = { url: "/podcast-cover-placeholder.jpg", url2x: "/podcast-cover-placeholder.jpg" }
const NEWS_STORY_IMAGE = {
	page: NEWS_STORY_IMAGE_FILES,
	list: NEWS_STORY_IMAGE_FILES,
	thumbnail: NEWS_STORY_IMAGE_FILES,
}

// what a row says of nobody and nothing, which each kind's row fills in
const NEWS_STORY_ROW_DEFAULTS = {
	findingId: null,
	podcastEpisodeId: null,
	topicPostId: null,
	listenerCount: null,
	actor: null,
	title: null,
	text: null,
	reactionType: null,
	reactionCount: null,
	commentAuthor: null,
}

// one row of each kind, which the story's week repeats. the Podcast Episode's row plays the story's episode, and the
// Finding's row is the one its first chapter narrates
const NEWS_STORY_KIND_ROWS: Omit<NewsEvent, "id" | "occurredAt" | "topicId" | "topicName" | "image">[] = [
	{
		...NEWS_STORY_ROW_DEFAULTS,
		kind: "podcastEpisode",
		path: "/topics/topic-espresso/home-espresso/episodes/2026/4",
		podcastEpisodeId: PODCAST_STORY_EPISODE.id,
		listenerCount: 14,
		title: "Grinders, scales, and the pour",
	},
	{
		...NEWS_STORY_ROW_DEFAULTS,
		kind: "comment",
		path: "/topics/topic-espresso/home-espresso?comment=comment-1",
		actor: { userId: "user-roastfan", username: "RoastFan" },
		text: "https://example.com/burrs says flat burrs win, and I am not sure it holds for light roasts",
	},
	{
		...NEWS_STORY_ROW_DEFAULTS,
		kind: "reaction",
		path: "/topics/topic-espresso/home-espresso?comment=comment-2",
		reactionCount: 12,
		commentAuthor: { userId: "user-evan", username: "Evan" },
	},
	{
		...NEWS_STORY_ROW_DEFAULTS,
		kind: "finding",
		path: "/topics/topic-espresso/home-espresso?finding=coffee-0",
		findingId: PODCAST_STORY_EPISODE.chapters[0]?.findingId ?? null,
		title: "Why pressure profiling changes espresso",
	},
	{
		...NEWS_STORY_ROW_DEFAULTS,
		kind: "topicPost",
		path: "/topics/topic-espresso/home-espresso/posts/post-1/why-i-weigh-every-shot",
		topicPostId: "post-1",
		actor: { userId: "user-evan", username: "Evan" },
		title: "Why I weigh every shot",
	},
]

// the week's rows, each an hour older than the one before it. a Finding's row has no image, so its kind's icon shows
const NEWS_STORY_EVENTS: NewsEvent[] = Array.from({ length: NEWS_STORY_ROW_COUNT }, (_, i) => {
	const kindRow = NEWS_STORY_KIND_ROWS[i % NEWS_STORY_KIND_ROWS.length] as (typeof NEWS_STORY_KIND_ROWS)[number]
	return {
		...kindRow,
		...NEWS_STORY_TOPIC,
		image: kindRow.kind === "finding" ? null : NEWS_STORY_IMAGE,
		id: `story-row-${i}`,
		occurredAt: new Date(NEWS_STORY_NEWEST_AT - i * 60 * 60_000).toISOString(),
	}
})

/**
 * Returns one page of the story's week of 32 rows, with the episode its Podcast Episode and Finding rows play, which
 * is the story's episode unless one with a film is given.
 */
export function toNewsStoryPage(
	pageNumber: number,
	podcastEpisode: PodcastEpisode = PODCAST_STORY_EPISODE,
): NewsResponse {
	const pageStart = (pageNumber - 1) * NEWS_PAGE_SIZE
	return {
		newsEvents: NEWS_STORY_EVENTS.slice(pageStart, pageStart + NEWS_PAGE_SIZE),
		podcastEpisodes: [podcastEpisode],
		total: NEWS_STORY_ROW_COUNT,
		cursor: "story-cursor",
	}
}

/**
 * A window with no News Event.
 */
export const EMPTY_NEWS_STORY: NewsResponse = { newsEvents: [], podcastEpisodes: [], total: 0, cursor: "story-cursor" }
