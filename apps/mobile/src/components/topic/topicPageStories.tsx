import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toTestTopicFinding, toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { ScanSourceResults } from "@carlnotes/contracts/topics"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { type ReactNode, useState } from "react"

// published metadata exercises the player and episode card without streaming media
export const STORY_PODCAST_EPISODE: PodcastEpisode = {
	id: "episode-1",
	title: "Better beans, better mornings",
	description: null,
	season: 2026,
	episodeNumber: 1,
	durationSeconds: 600,
	publishedAt: "2026-10-25T12:00:00Z",
	pagePath: "/topics/coffee/episodes/2026/1",
	chapterCount: 4,
	topicId: "topic-1",
	topicVisibility: "public",
	status: "published",
	audioUrl: null,
	coverUrl: null,
	smallCoverUrl: null,
	chapters: Array.from({ length: 4 }, (_, i) => ({
		position: i,
		title: `Coffee chapter ${i + 1}`,
		findingId: `coffee-${i}`,
		sourceUrl: "https://example.com",
		rating: null,
		faviconPath: null,
		startSeconds: i * 100,
		endSeconds: (i + 1) * 100,
	})),
	progressSeconds: 0,
	isCompleted: false,
	isVoiceChatConfigured: false,
}

// a complete page with its owner, history, and related topics
export const STORY_TOPIC_PAGE = toTestTopicResponse({
	owner: { userId: "coffee-reader", username: "CoffeeReader", avatarSource: null, avatarVersion: null },
	findings: Array.from({ length: 8 }, (_, i) =>
		toTestTopicFinding({ findingId: `coffee-${i}`, title: `Coffee finding ${i + 1}` }),
	),
	latestPodcastEpisode: STORY_PODCAST_EPISODE,
	scanSummary: "Small changes to water temperature and grind size make a better cup.",
	podcast: {
		isEnabled: true,
		hasFullPodcastEpisodes: true,
		canRemovePodcastEpisodes: false,
		unpublishedPodcastEpisode: null,
		seasons: [2026],
		latestSeasonPodcastEpisodes: { podcastEpisodes: [STORY_PODCAST_EPISODE] },
		publicFeedUrl: null,
	},
	scans: [
		{
			id: "scan-1",
			status: "succeeded",
			startedAt: "2026-10-25T12:00:00Z",
			finishedAt: "2026-10-25T12:03:00Z",
			stoppedAt: null,
			foundCount: 42,
			keptCount: 8,
			filteredCount: 34,
			costDollars: 0.12,
			error: null,
			podcastEpisode: null,
		},
	],
	relatedTopics: [
		{ id: "coffee", name: "Coffee for two", latestPodcastEpisode: STORY_PODCAST_EPISODE },
		{ id: "tea", name: "Tea for two", latestPodcastEpisode: null },
	],
})

/**
 * Supplies inert note responses for native page stories without an account request.
 */
export function TopicPageStoryProvider({ children }: { children: ReactNode }) {
	const [queryClient] = useState(() => {
		// prefill only the story's own transient queries
		const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity, retry: false } } })
		client.setQueryData(["topic-counts", STORY_TOPIC_PAGE.id], { viewerCount: 2, subscriberCount: 0 })
		client.setQueryData(["mobile-notes", undefined, STORY_TOPIC_PAGE.id], {
			pageName: STORY_TOPIC_PAGE.name,
			creatableVisibilities: ["private", "public"],
			notes: [],
		})
		client.setQueryData(["mobile-scan-note", undefined, "scan-1"], {
			scanSummary: "Carl kept eight useful findings from forty-two resources.",
			sourceResults: STORY_SCAN_SOURCE_RESULTS,
		})
		client.setQueryData(["mobile-podcast-season", undefined, STORY_TOPIC_PAGE.id, 2025], {
			podcastEpisodes: [
				{ ...STORY_PODCAST_EPISODE, id: "previous-season-episode", season: 2025, title: "Last year's coffee" },
			],
		})
		return client
	})
	return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}

// source outcomes cover read, kept, fallback, and failure in native diary stories
export const STORY_SCAN_SOURCE_RESULTS: ScanSourceResults = {
	earlierKeptCount: 0,
	earlierFoundCount: 0,
	sources: [
		{
			sourceId: "web",
			sourceKind: "search",
			label: "web search",
			foundCount: 45,
			keptCount: 10,
			costDollars: 0.035,
			durationMs: 4600,
			status: "ok",
		},
		{
			sourceId: "rss",
			sourceKind: "rss",
			label: "simonwillison.net",
			foundCount: 30,
			keptCount: 0,
			costDollars: 0,
			durationMs: 1200,
			status: "ok",
		},
		{
			sourceId: "reddit",
			sourceKind: "reddit",
			label: "r/startups",
			foundCount: 10,
			keptCount: 0,
			costDollars: 0,
			durationMs: 6400,
			status: "fallback",
			fallbackMode: "reddit-rss",
		},
		{
			sourceId: "youtube",
			sourceKind: "youtube",
			label: "@aiDotEngineer",
			foundCount: 0,
			keptCount: 0,
			costDollars: 0,
			durationMs: 2400,
			status: "failed",
			reason: "The playlist could not be read.",
		},
	],
}
