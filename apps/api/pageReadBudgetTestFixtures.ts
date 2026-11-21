// the page read budget fixture's full rows: a topic with a succeeded scan, a shown finding, a ready Source, a
// published podcast episode with a chapter and a ready film, a comment on every page, a related topic and podcast
// episode, and a Topic Post's discussion, so each page read's budget counts the reads behind its fuller branches
import type { SentQuery } from "@carlnotes/db/connectionPoolStub"
import { toTableRow } from "@carlnotes/db/connectionPoolStub"
import { sources } from "@carlnotes/db/schema/topics"
import { toPublishedPodcastEpisodeRow } from "./podcast/podcastEpisodeTestFixtures"

// the fixture's dates
export const FIXTURE_DATE = new Date("2026-10-01T00:00:00Z")

// the topic's published podcast episode, and the related topic's
export const PODCAST_EPISODE_ROW = toPublishedPodcastEpisodeRow({
	id: "episode-1",
	topicId: "topic-1",
	episodeNumber: 1,
})
const RELATED_PODCAST_EPISODE_ROW = toPublishedPodcastEpisodeRow({
	id: "episode-2",
	topicId: "topic-2",
	episodeNumber: 1,
})

// a comment by the person, with no reply, in the column order the comment read selects
const COMMENT_ROW = [
	"comment-1",
	"owner-1",
	"A comment",
	null,
	null,
	null,
	null,
	FIXTURE_DATE,
	"Owner",
	null,
	null,
	false,
]

// one of the fixture's fuller reads: whether a query is that read, and the rows it returns
type FullPageRead = { isRead: (sentQuery: SentQuery) => boolean; toRows: (sentQuery: SentQuery) => unknown[] }

// the fixture's fuller reads, each matched by its query's text and values
const FULL_PAGE_READS: FullPageRead[] = [
	// the topic's shown finding, from its succeeded scan
	{
		isRead: ({ text }) => text.includes('from "findings" inner join "resources"'),
		toRows: () => {
			const resourceColumns = ["resource-1", "https://example.test/a", "read", "A finding", FIXTURE_DATE, FIXTURE_DATE]
			return [["finding-1", "scan-1", ...resourceColumns, 0.9, "Because it fits", 0, null, null, null]]
		},
	},
	// the topic's succeeded scan, whose row holds the topic's shown finding count and newest shown finding time, its
	// recap for the page and for the head, and the month's cost
	{
		isRead: ({ text }) => text.includes('row_number() over (order by "scans"."started_at" desc'),
		toRows: () => {
			const countColumns = [5, 1, 4, "0.1", null]
			const newestScanColumns = [null, 1, FIXTURE_DATE, "A summary", "A summary", "0.1", 1]
			return [["scan-1", "succeeded", FIXTURE_DATE, FIXTURE_DATE, null, ...countColumns, ...newestScanColumns]]
		},
	},
	// the topic's ready Source
	{
		isRead: ({ text }) => text.includes('from "sources" where "sources"."topic_id" = $1'),
		toRows: () => {
			const sourceFields = { kind: "rss", config: { url: "https://example.test/feed" }, status: "ready" }
			return [toTableRow(sources, { id: "source-1", topicId: "topic-1", ...sourceFields, createdAt: FIXTURE_DATE })]
		},
	},
	// the topic's published podcast episode, which is its newest, and its ready film
	{
		isRead: ({ text }) => text.includes('"episodes"."id" in (select "id" from "episodes"'),
		toRows: () => [[...PODCAST_EPISODE_ROW, true, true]],
	},
	{
		isRead: ({ text }) => text.includes('from "topic_videos"'),
		toRows: ({ values }) => (values.includes("episode-1") ? [["episode-1", "ready", 5678, null]] : []),
	},
	// the podcast episode's chapter, and its chapter count
	{
		isRead: ({ text }) =>
			text.startsWith('select "id", "episode_id", "position"') && text.includes('from "episode_chapters"'),
		toRows: () => [
			["chapter-1", "episode-1", 1, "finding-1", "resource-1", "A chapter", "https://example.test/a", null, 0, 30],
		],
	},
	{ isRead: ({ text }) => text.includes('count(*) from "episode_chapters"'), toRows: () => [["episode-1", 1]] },
	// a comment on each page, with no reply, and its counts
	{
		isRead: ({ text }) =>
			text.includes('from "comments" left join "users"') && text.includes('"comments"."parent_comment_id" is null'),
		toRows: () => [COMMENT_ROW],
	},
	{ isRead: ({ text }) => text.startsWith("select count(*), count(*) filter"), toRows: () => [[1, 1]] },
	// the related topic and its row
	{ isRead: ({ text }) => text.startsWith('with "related_topic_candidates"'), toRows: () => [["topic-2", 0.2]] },
	{
		isRead: ({ text }) => text.includes('from "topics" where ("topics"."id" in ('),
		toRows: () => [["topic-2", "Espresso", "owner-2", "public", null]],
	},
	// the related podcast episode and its row with its topic
	{ isRead: ({ text }) => text.startsWith('with "related_episode_candidates"'), toRows: () => [["episode-2", 0.2]] },
	{
		isRead: ({ text, values }) => text.includes('from "episodes" inner join "topics"') && values.includes("episode-2"),
		toRows: () => [[...RELATED_PODCAST_EPISODE_ROW, "topic-2", "Espresso", "public", null]],
	},
	// the Topic Post's published discussion
	{
		isRead: ({ text }) => text.includes('from "topic_post_discussions"'),
		toRows: () => [["discussion-1", 60, FIXTURE_DATE, "audio-key", 1234, null, "published"]],
	},
]

/**
 * Returns the full rows of a page read's query, or null for a query that the fixture's first rows return.
 */
export function toFullPageReadRows(sentQuery: SentQuery): unknown[] | null {
	return FULL_PAGE_READS.find(({ isRead }) => isRead(sentQuery))?.toRows(sentQuery) ?? null
}
