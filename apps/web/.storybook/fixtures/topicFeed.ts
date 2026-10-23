// the invented topic feeds the header and the app shell load, and a builder for a topic finding. a visitor's feed has
// one featured topic, and a signed-in user's has their own topic and the one they subscribe to above the featured one
import { fetchTopicFeed } from "@carlnotes/client/topicClient"
import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { TopicFeed, TopicFeedResponse } from "@carlnotes/contracts/topics"
import { mocked } from "storybook/test"
import { FIXTURE_DATE, LLM_TOOLING_TOPIC_FIXTURE, STORY_PEOPLE, STORY_USER, toStoryProfile } from "../fixtures"

// the LLM tooling topic's owner, with no uploaded avatar
const LIN_IDENTITY = toStoryProfile(STORY_PEOPLE[1])

// the LLM tooling topic's one finding from its latest scan
const LOCAL_RUNTIME_FINDING = toStoryTopicFinding({
	findingId: "finding-local-runtime",
	title: "A faster local runtime for small models",
})

// the LLM tooling topic as a visitor sees it: Carlos's public topic, with one finding from its latest scan
const LLM_TOOLING_TOPIC_FEED: TopicFeed = {
	...LLM_TOOLING_TOPIC_FIXTURE,
	prompt: "New releases and benchmarks for local model runtimes and developer tools.",
	tags: ["ai", "developer tools"],
	frequency: "daily",
	scheduledTime: "06:00",
	scheduledDayOfWeek: "monday",
	maxTopicFindings: 10,
	owner: LIN_IDENTITY,
	isTopicOwner: false,
	newCount: 1,
	isOnTeam: false,
	isTeamMember: false,
	chatMentions: [],
	teamLink: null,
	canRate: false,
	isSubscribed: false,
	subscriberCount: 12,
	viewerCount: 48,
	teamCount: 0,
	visibility: "public",
	createdAt: FIXTURE_DATE.toISOString(),
	feedUpdatedAt: FIXTURE_DATE.toISOString(),
	lastScanAt: FIXTURE_DATE.toISOString(),
	lastScanDurationMs: 84_000,
	monthCostDollars: null,
	scanSummary: "A faster local runtime for small models led the scan.",
	attachments: [],
	sources: [],
	findings: [LOCAL_RUNTIME_FINDING],
	latestPodcastEpisode: null,
}

// the LLM tooling topic as the story user sees it, who subscribes to it and so may rate its findings
const SUBSCRIBED_LLM_TOOLING_TOPIC_FEED: TopicFeed = {
	...LLM_TOOLING_TOPIC_FEED,
	canRate: true,
	isSubscribed: true,
	subscriberCount: 13,
}

// the story user's own topic, with the month's scan spend that only its owner sees, and one finding from its latest
// scan
const VECTOR_DATABASES_TOPIC_FEED: TopicFeed = {
	...LLM_TOOLING_TOPIC_FEED,
	id: "topic-vector-databases",
	name: "Vector databases",
	prompt: "Releases, benchmarks, and pricing changes for vector databases and search indexes.",
	tags: ["databases"],
	frequency: "weekly",
	owner: toStoryProfile(STORY_USER),
	isTopicOwner: true,
	canRate: true,
	subscriberCount: 3,
	visibility: "invite",
	monthCostDollars: 0.64,
	scanSummary: "A new release with faster filtered search led the scan.",
	findings: [
		toStoryTopicFinding({
			findingId: "finding-filtered-search",
			scanId: "scan-october-5",
			resourceId: "resource-filtered-search",
			url: "https://example.com/blog/filtered-search-release",
			title: "Filtered search gets three times faster",
			relevanceScore: 0.88,
			relevanceExplanation: "A release of a database the topic follows, with new benchmarks.",
		}),
	],
}

// the free plan's topic limits, which both feeds show
const FREE_TOPIC_QUOTA = { topicLimit: 3, dailyTopicLimit: 1, dailyTopicsRemaining: 1 }

// a visitor's feed: one featured topic
const STORY_TOPIC_FEED: TopicFeedResponse = {
	sections: [{ key: "featured", topics: [LLM_TOOLING_TOPIC_FEED] }],
	topicsRemaining: 3,
	...FREE_TOPIC_QUOTA,
}

// a signed-in user's feed: their own topic, the topic they subscribe to, then the same topic among the featured ones
const STORY_USER_TOPIC_FEED: TopicFeedResponse = {
	sections: [
		{ key: "yours", topics: [VECTOR_DATABASES_TOPIC_FEED] },
		{ key: "subscribed", topics: [SUBSCRIBED_LLM_TOOLING_TOPIC_FEED] },
		{ key: "featured", topics: [SUBSCRIBED_LLM_TOOLING_TOPIC_FEED] },
	],
	topicsRemaining: 2,
	...FREE_TOPIC_QUOTA,
}

/**
 * Mocks the topic feed that the TopicFeedProvider loads with a visitor's feed.
 */
export function mockTopicFeed(): void {
	mocked(fetchTopicFeed).mockResolvedValue(STORY_TOPIC_FEED)
}

/**
 * Mocks the topic feed that the TopicFeedProvider loads with a signed-in user's feed.
 */
export function mockUserTopicFeed(): void {
	mocked(fetchTopicFeed).mockResolvedValue(STORY_USER_TOPIC_FEED)
}

/**
 * Returns a read finding from the LLM tooling topic's latest scan, with any of its fields replaced.
 */
export function toStoryTopicFinding(
	topicFindingFields: Pick<TopicFinding, "findingId" | "title"> & Partial<TopicFinding>,
): TopicFinding {
	return {
		scanId: "scan-october-1",
		resourceId: "resource-local-runtime",
		url: "https://example.com/blog/local-runtime-release",
		resourceKind: "read",
		source: "example.com",
		faviconPath: null,
		publishedAt: FIXTURE_DATE.toISOString(),
		fetchedAt: FIXTURE_DATE.toISOString(),
		viewCount: 3,
		relevanceScore: 0.92,
		relevanceExplanation: "A new release of a runtime the topic follows.",
		rating: null,
		isConsumed: false,
		isBookmarked: false,
		teamBookmarks: [],
		...topicFindingFields,
	}
}
