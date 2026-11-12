// the tool results the MCP view tests send, typed from the MCP view contracts, so a renamed field fails the type check

import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { McpScanStatus } from "@carlnotes/contracts/mcpScanStatus"
import {
	MCP_VIEW_META_KEY,
	type McpSearchPage,
	type McpViewDashboard,
	type McpViewData,
	type McpViewNews,
	type McpViewTopic,
	type McpViewTopicResult,
} from "@carlnotes/contracts/mcpViews"
import type { PersonalSourcesSendResult } from "@carlnotes/contracts/personalSources"
import {
	toPodcastEpisodeFixture,
	toPodcastEpisodeSummaryFixture,
} from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { searchRequestPayload } from "@carlnotes/contracts/search"
import { toTestCommentThread } from "@carlnotes/contracts/socialTestFixtures"
import { toTestTopicFinding, toTestUpdatesFinding } from "@carlnotes/contracts/topicFeedTestFixtures"
import { EMPTY_TOPIC_DRAFT } from "@carlnotes/contracts/topicPayloads"
import {
	type TopicPostCard,
	type TopicPostResponse,
	toTopicPostDiscussionPodcastEpisode,
} from "@carlnotes/contracts/topicPosts"
import type { Updates } from "@carlnotes/contracts/updates"
import { COMMENT_MENTION_STORIES } from "@carlnotes/core/lib/commentMentionStories"
import { STORY_PODCAST_DASHBOARD, STORY_TOPIC_DASHBOARD } from "@carlnotes/core/lib/dashboardStories"
import { EMPTY_NEWS_STORY, toNewsStoryPage } from "@carlnotes/core/lib/newsStories"
import { TOPIC_POST_CARD_STORY, TOPIC_POST_DISCUSSION_STORY } from "@carlnotes/core/lib/topicPostStories"
import { type McpViewToolResult, TEST_SITE_URL } from "./mcpViewTestHost"

// how many bytes the silent podcast episode's audio has
const SILENT_AUDIO_BYTE_COUNT = 4000

/**
 * Returns a number's bytes as a wav file's header stores them.
 */
function toLittleEndianBytes(value: number, byteCount: number): number[] {
	return Array.from({ length: byteCount }, (_, byteIndex) => (value >> (byteIndex * 8)) & 255)
}

// the caller a user's tool result names
const USER_SESSION: McpViewData["session"] = {
	userId: "user-1",
	username: "vienna",
	avatarSource: null,
	avatarVersion: null,
}

// the MCP view data of a user's tool result and of a visitor's
export const USER_MCP_VIEW_DATA: McpViewData = { session: USER_SESSION, podcastEpisodes: [] }
export const VISITOR_MCP_VIEW_DATA: McpViewData = { session: null, podcastEpisodes: [] }

// half a second of silence, written here so the frame can play it with no request to the site
const SILENT_AUDIO_URL = `data:audio/wav;base64,${Buffer.from([
	...new TextEncoder().encode("RIFF"),
	...toLittleEndianBytes(SILENT_AUDIO_BYTE_COUNT + 36, 4),
	...new TextEncoder().encode("WAVEfmt "),
	...toLittleEndianBytes(16, 4),
	...toLittleEndianBytes(1, 2),
	...toLittleEndianBytes(1, 2),
	...toLittleEndianBytes(8000, 4),
	...toLittleEndianBytes(8000, 4),
	...toLittleEndianBytes(1, 2),
	...toLittleEndianBytes(8, 2),
	...new TextEncoder().encode("data"),
	...toLittleEndianBytes(SILENT_AUDIO_BYTE_COUNT, 4),
	...new Uint8Array(SILENT_AUDIO_BYTE_COUNT).fill(128),
]).toString("base64")}`

// a topic's latest podcast episode, as its play button and the player read it
export const PODCAST_EPISODE_SUMMARY = toPodcastEpisodeSummaryFixture()
export const PODCAST_EPISODE = toPodcastEpisodeFixture({ audioUrl: SILENT_AUDIO_URL })

// a topic the findings MCP view heads its rows with
export const FINDINGS_TOPIC: McpViewTopic = {
	id: "topic-1",
	name: "LLM tooling",
	prompt: "Tools that run language models",
	visibility: "public",
	latestPodcastEpisode: null,
	image: null,
	isSubscribed: false,
	canRate: true,
	canBookmark: true,
}

// what a visitor may do with the same topic
export const VISITOR_FINDINGS_TOPIC: McpViewTopic = {
	...FINDINGS_TOPIC,
	isSubscribed: null,
	canRate: false,
	canBookmark: false,
}

// two findings of the topic
export const TOPIC_FINDINGS = [
	toTestTopicFinding({ findingId: "finding-1", title: "Agents that read the docs" }),
	toTestTopicFinding({ findingId: "finding-2", title: "Replay sets for evals" }),
]

// a user's findings table, with the sender's private annotation on the first finding
export const PERSONAL_ANNOTATION = "Ask the platform team about this one."
export const FINDINGS_MCP_VIEW_DATA: McpViewData = {
	...USER_MCP_VIEW_DATA,
	topic: FINDINGS_TOPIC,
	topicFindings: TOPIC_FINDINGS,
	personalAnnotations: { "finding-1": PERSONAL_ANNOTATION },
}

// a search for "orbit" with one Team
export const SEARCH_PAGE: McpSearchPage = {
	rows: [
		{
			kind: "team",
			id: "team-1",
			name: "Orbit Club",
			path: "/teams/team-1",
			date: null,
			count: null,
			team: { teamId: "team-1", name: "Orbit Club", avatarVersion: null },
			topicCount: 2,
			memberCount: 5,
			url: `${TEST_SITE_URL}/teams/team-1`,
		},
	],
	rowCount: 1,
	page: 1,
	pageCount: 1,
	pageSize: 10,
	podcastEpisodes: [],
	searchRequest: searchRequestPayload.parse({ q: "orbit", kinds: ["teams"] }),
	searchUrl: `${TEST_SITE_URL}/search?q=orbit&kinds=teams`,
}

// a search with one Topic, which a user may follow
export const TOPIC_SEARCH_PAGE: McpSearchPage = {
	...SEARCH_PAGE,
	rows: [
		{
			kind: "topic",
			id: "topic-1",
			name: "LLM tooling",
			path: "/topics/topic-1/llm-tooling",
			date: null,
			count: null,
			topic: { id: "topic-1", name: "LLM tooling", latestPodcastEpisode: null, image: null },
			subscriberCount: 4,
			isSubscribed: false,
			url: `${TEST_SITE_URL}/topics/topic-1/llm-tooling`,
		},
	],
	searchRequest: searchRequestPayload.parse({ q: "llm" }),
}

// a search with one Topic Post on that Topic, with no image yet
export const TOPIC_POST_SEARCH_PAGE: McpSearchPage = {
	...SEARCH_PAGE,
	rows: [
		{
			kind: "topicPost",
			id: "topic-post-1",
			name: "What the evals missed",
			path: "/topics/topic-1/llm-tooling/posts/topic-post-1/what-the-evals-missed",
			date: "2026-10-01T12:00:00.000Z",
			count: null,
			// the author, the summary, and no image
			topicPost: {
				author: { userId: "user-1", username: "vienna", avatarSource: null, avatarVersion: null },
				summary: "Replay sets catch what a fixed eval suite does not.",
				image: null,
			},
			topic: { id: "topic-1", name: "LLM tooling" },
			url: `${TEST_SITE_URL}/topics/topic-1/llm-tooling/posts/topic-post-1/what-the-evals-missed`,
		},
	],
	searchRequest: searchRequestPayload.parse({ q: "evals" }),
}

// text with no place to wrap, as a url or a pasted id may be
const UNBROKEN_TEXT = "unbrokentext".repeat(12)

// a search and a topic's findings with that text in every name and title
export const LONG_SEARCH_PAGE: McpSearchPage = {
	...TOPIC_SEARCH_PAGE,
	rows: TOPIC_SEARCH_PAGE.rows.map((row) => ({ ...row, name: UNBROKEN_TEXT })),
}
export const LONG_FINDINGS_MCP_VIEW_DATA: McpViewData = {
	...USER_MCP_VIEW_DATA,
	topic: { ...FINDINGS_TOPIC, name: UNBROKEN_TEXT },
	topicFindings: [toTestTopicFinding({ findingId: "finding-3", title: UNBROKEN_TEXT })],
}

// the first of a search's two pages, with a Finding that a user may rate and bookmark
export const FINDING_SEARCH_PAGE: McpSearchPage = {
	...SEARCH_PAGE,
	rows: [
		{
			kind: "finding",
			id: "finding-1",
			name: "Agents that read the docs",
			path: `/topics/${FINDINGS_TOPIC.id}`,
			date: null,
			count: null,
			finding: TOPIC_FINDINGS[0] as TopicFinding,
			topic: {
				id: FINDINGS_TOPIC.id,
				name: FINDINGS_TOPIC.name,
				prompt: FINDINGS_TOPIC.prompt,
				visibility: "public",
				canRate: true,
				canBookmark: true,
			},
			url: `${TEST_SITE_URL}/topics/${FINDINGS_TOPIC.id}`,
		},
	],
	rowCount: 11,
	pageCount: 2,
}

// an updates list with an opener, ranked Findings, and more that did not fit
export const UPDATES_RESULT: Updates = {
	opener: "Three things moved while you were out.",
	findings: [
		toTestUpdatesFinding({
			findingId: "finding-4",
			title: "A model router ships",
			topicId: FINDINGS_TOPIC.id,
			topicName: FINDINGS_TOPIC.name,
			topicPath: `/topics/${FINDINGS_TOPIC.id}/llm-tooling`,
		}),
	],
	moreCount: 2,
	morePath: "/topics",
}

// the MCP view data of an updates list, with each row's Topic
export const UPDATES_MCP_VIEW_DATA: McpViewData = { ...USER_MCP_VIEW_DATA, updatesTopics: [FINDINGS_TOPIC] }

// the story week's News Events on the given pages of the list, five to a page
function toStoryNewsEvents(pageNumbers: number[]): McpViewNews["newsPage"]["newsEvents"] {
	return pageNumbers.flatMap((pageNumber) => toNewsStoryPage(pageNumber).newsEvents)
}

// the cursor the week's first read_news result returns for its next page
export const NEWS_NEXT_CURSOR = "news-cursor-2"

// a week of 32 News Events as read_news returns them: the first twenty with the caller's unseen mentions, then the
// last twelve from the cursor
export const NEWS_RESULT: McpViewNews = {
	window: "week",
	commentMentions: COMMENT_MENTION_STORIES,
	newsPage: { ...toNewsStoryPage(1), newsEvents: toStoryNewsEvents([1, 2, 3, 4]) },
	nextCursor: NEWS_NEXT_CURSOR,
}
export const SECOND_NEWS_RESULT: McpViewNews = {
	...NEWS_RESULT,
	commentMentions: [],
	newsPage: { ...toNewsStoryPage(1), newsEvents: toStoryNewsEvents([5, 6, 7]) },
	nextCursor: null,
}

// a day in which nothing happened
export const QUIET_DAY_NEWS_RESULT: McpViewNews = {
	window: "day",
	commentMentions: [],
	newsPage: EMPTY_NEWS_STORY,
	nextCursor: null,
}

// the url a link in the Topic Post's body opens
export const TOPIC_POST_BODY_LINK_URL = "https://example.com/roast-notes"

// a Topic's published Topic Post as its card, and the same post as its page shows it, with an image on the site, a
// link in its body, a recording, and its comment thread's first page
export const TOPIC_POST_CARD: TopicPostCard = TOPIC_POST_CARD_STORY
const TOPIC_POST_IMAGE_FILES = { url: "/topic-post-image.jpg", url2x: "/topic-post-image-2x.jpg" }
export const TOPIC_POST: TopicPostResponse = {
	...TOPIC_POST_DISCUSSION_STORY,
	html: `<p>Start with <a href="${TOPIC_POST_BODY_LINK_URL}">the roast notes</a>.</p>${TOPIC_POST_DISCUSSION_STORY.html}`,
	image: { page: TOPIC_POST_IMAGE_FILES, list: TOPIC_POST_IMAGE_FILES, thumbnail: TOPIC_POST_IMAGE_FILES },
	commentThread: toTestCommentThread(),
}

// what a user saved through a checklist's send
export const SEND_CONFIRMATION: Extract<PersonalSourcesSendResult, { status: "accepted" }> = {
	status: "accepted",
	topic: { id: "topic-1", name: "LLM tooling", url: `${TEST_SITE_URL}/topics/topic-1/llm-tooling` },
	entryId: "entry-1",
	title: "Eval drift and replay sets",
	queuedLinkCount: 2,
}

// a preview of an edit that needs the user's agreement
export const TOPIC_EDIT_PREVIEW: Extract<McpViewTopicResult, { status: "confirmRequired" }> = {
	status: "confirmRequired",
	topicId: "topic-1",
	afterTopicDraft: { ...EMPTY_TOPIC_DRAFT, name: "Home espresso", prompt: "Grinders and burrs" },
	topicEditChanges: ["makes the topic public, so anyone can read it"],
	confirmation: "1.a",
}

// the model's fenced copy of an updates list, a Scan status, the news, or a Topic Post
const MODEL_COPY = { opener: "the model's fenced copy" }

/**
 * Returns a tool result as the api sends it: text for the model, the structured result, and the MCP view's data.
 */
export function toMcpViewToolResult({
	structuredContent,
	mcpViewData,
}: {
	structuredContent?: Record<string, unknown>
	mcpViewData: McpViewData
}): McpViewToolResult {
	return { content: [], structuredContent, _meta: { [MCP_VIEW_META_KEY]: mcpViewData } }
}

/**
 * Returns a read_updates result that holds an updates list.
 */
export function toUpdatesToolResult(updates: Updates = UPDATES_RESULT): McpViewToolResult {
	return toMcpViewToolResult({ structuredContent: MODEL_COPY, mcpViewData: { ...UPDATES_MCP_VIEW_DATA, updates } })
}

// the story user's Topic Dashboard as read_dashboard returns them to that user, who reads the full snapshot, and their
// Podcast Dashboard
export const TOPIC_DASHBOARD_RESULT: McpViewDashboard = {
	dashboardKind: "topicDashboard",
	subjectId: "user-vienna",
	hasFullAccess: true,
	dashboard: STORY_TOPIC_DASHBOARD,
}
export const PODCAST_DASHBOARD_RESULT: McpViewDashboard = {
	...TOPIC_DASHBOARD_RESULT,
	dashboardKind: "podcastDashboard",
	dashboard: STORY_PODCAST_DASHBOARD,
}

/**
 * Returns a read_dashboard result that holds one Dashboard's read.
 */
export function toDashboardToolResult(dashboard: McpViewDashboard = TOPIC_DASHBOARD_RESULT): McpViewToolResult {
	return toMcpViewToolResult({ structuredContent: MODEL_COPY, mcpViewData: { ...USER_MCP_VIEW_DATA, dashboard } })
}

/**
 * Returns a read_news result that holds a window's news.
 */
export function toNewsToolResult(news: McpViewNews = NEWS_RESULT): McpViewToolResult {
	const mcpViewData = { ...USER_MCP_VIEW_DATA, podcastEpisodes: news.newsPage.podcastEpisodes, news }
	return toMcpViewToolResult({ structuredContent: MODEL_COPY, mcpViewData })
}

/**
 * Returns a read_topic_posts result that holds one page of a Topic's Topic Posts, the last page unless a cursor
 * follows it.
 */
export function toTopicPostsToolResult(
	topicPosts: TopicPostCard[] = [TOPIC_POST_CARD],
	nextCursor: string | null = null,
): McpViewToolResult {
	const mcpViewData = { ...USER_MCP_VIEW_DATA, topic: FINDINGS_TOPIC, topicPosts }
	return toMcpViewToolResult({ structuredContent: { items: [], nextCursor }, mcpViewData })
}

/**
 * Returns a read_topic_post result that holds a Topic Post, with its discussion as the player plays it: silent audio,
 * and the cover on the site.
 */
export function toTopicPostToolResult(mcpViewData: McpViewData = USER_MCP_VIEW_DATA): McpViewToolResult {
	const discussionPodcastEpisode = toTopicPostDiscussionPodcastEpisode(TOPIC_POST)
	const coverUrl = `${TEST_SITE_URL}${TOPIC_POST_IMAGE_FILES.url}`
	const podcastEpisodes = discussionPodcastEpisode
		? [{ ...discussionPodcastEpisode, audioUrl: SILENT_AUDIO_URL, coverUrl, smallCoverUrl: coverUrl }]
		: []
	return toMcpViewToolResult({
		structuredContent: MODEL_COPY,
		mcpViewData: { ...mcpViewData, podcastEpisodes, topicPost: TOPIC_POST },
	})
}

/**
 * Returns a read_scan_status result that holds a Scan status.
 */
export function toScanToolResult(
	scanStatus: McpScanStatus,
	mcpViewData: McpViewData = USER_MCP_VIEW_DATA,
): McpViewToolResult {
	return toMcpViewToolResult({ structuredContent: MODEL_COPY, mcpViewData: { ...mcpViewData, scanStatus } })
}
