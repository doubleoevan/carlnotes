// what the stored version 9 MCP view bundle reads from a tool result, written out once and never updated. a result may
// gain a field, and tsc -b fails here if a field a stored bundle reads is removed or changes type
import { expect, test } from "bun:test"
import type { TopicFinding } from "./findings"
import { MCP_VIEW_META_KEY, MCP_VIEWS, type McpSearchPage, type McpViewData, type McpViewTopicResult } from "./mcpViews"
import type { PodcastEpisode } from "./podcast"
import type { TopicSuggestionsResult } from "./topicSuggestions"

// a result's fields, each optional at every depth, so a fixture pins the fields it names and only those
type StoredBundleRead<Result> = Result extends (infer ResultItem)[]
	? StoredBundleRead<ResultItem>[]
	: Result extends object
		? { [Field in keyof Result]?: StoredBundleRead<Result[Field]> }
		: Result

// the MCP views version 9 holds
const VERSION_9_MCP_VIEWS = ["search", "topic", "findings", "suggest-topics"]

// a finding as the findings and search MCP views read it
const VERSION_9_FINDING = {
	findingId: "finding-1",
	scanId: "scan-1",
	resourceId: "resource-1",
	url: "https://example.com/coffee",
	resourceKind: "read",
	title: "A better cup",
	source: "Coffee Journal",
	faviconPath: null,
	publishedAt: "2026-10-25T16:00:00.000Z",
	fetchedAt: "2026-10-25T16:00:00.000Z",
	viewCount: 3,
	relevanceScore: 0.9,
	relevanceExplanation: "A practical guide.",
	rating: null,
	isConsumed: false,
	isBookmarked: false,
	teamBookmarks: [],
} satisfies StoredBundleRead<TopicFinding>

// a podcast episode as the player reads it
const VERSION_9_PODCAST_EPISODE = {
	id: "episode-1",
	title: "Robot vacuums, ranked",
	description: "Six robot vacuums, ranked.",
	season: 2026,
	episodeNumber: 7,
	durationSeconds: 600,
	publishedAt: "2026-10-01T00:00:00.000Z",
	pagePath: "/topics/topic-1/robots/episodes/2026/7",
	chapterCount: 1,
	topicId: "topic-1",
	topicVisibility: "public",
	status: "published",
	audioUrl: "/api/episodes/episode-1/audio.mp3",
	coverUrl: null,
	smallCoverUrl: null,
	chapters: [
		{
			position: 0,
			title: "Chapter 1",
			findingId: null,
			sourceUrl: "https://example.com",
			rating: null,
			faviconPath: null,
			startSeconds: 0,
			endSeconds: 60,
		},
	],
	progressSeconds: 0,
	isCompleted: false,
	isVoiceChatConfigured: true,
} satisfies StoredBundleRead<PodcastEpisode>

// the MCP view data beside a result, with every optional part filled
export const VERSION_9_MCP_VIEW_DATA = {
	session: { userId: "user-1", username: "vienna", avatarSource: null, avatarVersion: null },
	podcastEpisodes: [VERSION_9_PODCAST_EPISODE],
	topic: {
		id: "topic-1",
		name: "LLM tooling",
		prompt: "Tools that run language models",
		visibility: "public",
		latestPodcastEpisode: null,
		isSubscribed: true,
		canRate: true,
		canBookmark: true,
	},
	topicFindings: [VERSION_9_FINDING],
	topicDraftOptions: { knownTags: ["coffee"], isPodcastEnabledByDefault: true },
	sendConfirmationLinks: [{ entryId: "entry-1", links: [{ url: "https://example.com", title: "A link" }] }],
} satisfies StoredBundleRead<McpViewData>

// the search tool's page, with a row of the two kinds an MCP view acts on
export const VERSION_9_SEARCH_PAGE = {
	rows: [
		{
			kind: "topic",
			id: "topic-1",
			name: "LLM tooling",
			path: "/topics/topic-1/llm-tooling",
			url: "https://carlnotes.com/topics/topic-1/llm-tooling",
			date: null,
			count: 2,
			topic: { id: "topic-1", name: "LLM tooling", latestPodcastEpisode: null },
			subscriberCount: 2,
			isSubscribed: false,
		},
		{
			kind: "finding",
			id: "finding-1",
			name: "A better cup",
			path: "/topics/topic-1/llm-tooling",
			url: "https://example.com/coffee",
			date: null,
			count: null,
			finding: VERSION_9_FINDING,
			topic: {
				id: "topic-1",
				name: "LLM tooling",
				prompt: "Tools that run language models",
				visibility: "public",
				canRate: true,
				canBookmark: true,
			},
		},
	],
	rowCount: 2,
	page: 1,
	pageCount: 1,
	pageSize: 20,
	podcastEpisodes: [VERSION_9_PODCAST_EPISODE],
	searchRequest: { q: "coffee", page: 1 },
	searchUrl: "https://carlnotes.com/search?q=coffee",
} satisfies StoredBundleRead<McpSearchPage>

// an edit preview, which Save sends back
export const VERSION_9_TOPIC_PREVIEW = {
	status: "confirmRequired",
	topicId: "topic-1",
	afterTopicDraft: { name: "LLM tooling", prompt: "Tools that run language models", tags: ["coffee"] },
	topicEditChanges: ["makes the topic public, so anyone can read it"],
	confirmation: "1793000000000.signature",
} satisfies StoredBundleRead<McpViewTopicResult>

// the suggestion checklist's unavailable state, the one shape every call can return
export const VERSION_9_SUGGESTIONS = { status: "unavailable" } satisfies StoredBundleRead<TopicSuggestionsResult>

test("the MCP views and the metadata key a stored bundle needs stay in place", () => {
	expect(MCP_VIEWS).toEqual(expect.arrayContaining(VERSION_9_MCP_VIEWS))
	expect(MCP_VIEW_META_KEY).toBe("carlnotes/card")
})
