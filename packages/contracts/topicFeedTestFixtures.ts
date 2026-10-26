import type { TopicFinding } from "./findings"
import type { TopicFeed, TopicFeedResponse, TopicResponse } from "./topics"

// stable, complete payloads shared by Feed tests and native stories
const FOUND_AT = "2026-10-25T16:00:00.000Z"

/**
 * Returns a complete finding with optional scenario fields.
 */
export function toTestTopicFinding(overrides: Partial<TopicFinding> = {}): TopicFinding {
	return {
		findingId: "finding-1",
		scanId: "scan-1",
		resourceId: "resource-1",
		url: "https://example.com/coffee",
		resourceKind: "read",
		title: "A better cup, one small change at a time",
		source: "Coffee Journal",
		faviconPath: null,
		publishedAt: FOUND_AT,
		fetchedAt: FOUND_AT,
		viewCount: 3,
		relevanceScore: 0.9,
		relevanceExplanation:
			"**Carl's take:** A practical [guide](https://example.com) to getting more from the beans you already have.",
		rating: null,
		isConsumed: false,
		isBookmarked: false,
		teamBookmarks: [],
		...overrides,
	}
}

/**
 * Returns a complete owned topic for tests and reading stories.
 */
export function toTestTopicFeed(overrides: Partial<TopicFeed> = {}): TopicFeed {
	return {
		id: "topic-1",
		name: "Better coffee at home",
		prompt: "Practical coffee research",
		tags: ["coffee"],
		frequency: "daily",
		scheduledTime: "09:00",
		scheduledDayOfWeek: "monday",
		maxTopicFindings: 10,
		owner: null,
		isTopicOwner: true,
		newCount: 1,
		isOnTeam: false,
		isTeamMember: false,
		chatMentions: [],
		teamLink: null,
		canRate: true,
		isSubscribed: false,
		subscriberCount: 2,
		teamCount: 0,
		visibility: "public",
		createdAt: FOUND_AT,
		lastScanAt: FOUND_AT,
		lastScanDurationMs: 1000,
		monthCostDollars: null,
		scanSummary: null,
		attachments: [],
		sources: [],
		findings: [toTestTopicFinding()],
		latestPodcastEpisode: null,
		viewerCount: 4,
		feedUpdatedAt: FOUND_AT,
		...overrides,
	}
}

/**
 * Returns Home's four sections with the supplied owned topics.
 */
export function toTestTopicFeedResponse(topics: TopicFeed[] = [toTestTopicFeed()]): TopicFeedResponse {
	return {
		sections: [
			{ key: "yours", topics },
			{ key: "subscribed", topics: [] },
			{ key: "featured", topics: [] },
			{ key: "popular", topics: [] },
		],
		topicsRemaining: 3,
		topicLimit: 4,
		dailyTopicLimit: 4,
		dailyTopicsRemaining: 3,
	}
}

/**
 * Returns an independent Topic page with optional scenario fields.
 */
export function toTestTopicResponse(overrides: Partial<TopicResponse> = {}): TopicResponse {
	return {
		...toTestTopicFeed(),
		podcast: null,
		scans: [],
		invites: [],
		manualScansRemaining: 3,
		manualScanLimit: 3,
		isManualScanPaused: false,
		isSpendExhausted: false,
		canEdit: true,
		team: null,
		hasRequestedToJoin: false,
		roomTeams: [],
		isDailyFrequencyPaused: false,
		featureOrder: null,
		featuredTopics: null,
		relatedTopics: [],
		...overrides,
	}
}
