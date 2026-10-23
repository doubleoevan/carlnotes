// the invented topics the stories show: a builder for a topic table row, the owned topics on the Activity page, the
// topic page's scan history, a scan note with its source results, and the topic names the paged tables list
import type { ActivityScan, OwnerTopic } from "@carlnotes/contracts/activity"
import type { Topic } from "@carlnotes/contracts/profiles"
import { DAY_MS, MINUTE_MS } from "@carlnotes/contracts/time"
import type { ScanNote, ScanSourceResults, SourceResult, TopicScan } from "@carlnotes/contracts/topics"
import { FIXTURE_DATE, LLM_TOOLING_TOPIC_FIXTURE, STORY_USER } from "../fixtures"
import { LATEST_PODCAST_EPISODE_FIXTURE } from "./podcastEpisodes"

// a scan's id and counts, and how many days after the fixture date it started
type ToActivityScanOptions = Pick<ActivityScan, "id" | "foundCount" | "keptCount" | "costCents"> & { dayOffset: number }

// a topic page scan's id and counts, and how many days from the fixture date it started, negative for the days before
type ToTopicScanOptions = Pick<TopicScan, "id" | "foundCount" | "keptCount"> & { dayOffset: number }

/** The owned topics the stories render: public, invite, and private. */
export const OWNER_TOPIC_FIXTURES: OwnerTopic[] = [
	{
		...LLM_TOOLING_TOPIC_FIXTURE,
		visibility: "public",
		frequency: "daily",
		monthScanCount: 4,
		subscriberCount: 12,
		createdAt: FIXTURE_DATE.toISOString(),
		updatedAt: FIXTURE_DATE.toISOString(),
		monthCostCents: 420,
		monthEmailCount: 4,
		ownerUserId: STORY_USER.userId,
		isEmailEnabled: true,
		scans: [
			toActivityScan({ id: "scan-1", dayOffset: 0, foundCount: 349, keptCount: 13, costCents: 118 }),
			toActivityScan({ id: "scan-2", dayOffset: 1, foundCount: 37, keptCount: 4, costCents: 96 }),
			toActivityScan({ id: "scan-3", dayOffset: 2, foundCount: 51, keptCount: 9, costCents: 131 }),
			toActivityScan({ id: "scan-4", dayOffset: 3, foundCount: 29, keptCount: 3, costCents: 75 }),
		],
		chatMentions: [],
		latestPodcastEpisode: LATEST_PODCAST_EPISODE_FIXTURE,
	},
	{
		id: "topic-vector-databases",
		name: "Vector databases",
		visibility: "invite",
		frequency: "weekly",
		monthScanCount: 1,
		subscriberCount: 3,
		createdAt: FIXTURE_DATE.toISOString(),
		updatedAt: FIXTURE_DATE.toISOString(),
		monthCostCents: 64,
		monthEmailCount: 0,
		ownerUserId: STORY_USER.userId,
		isEmailEnabled: false,
		scans: [toActivityScan({ id: "scan-5", dayOffset: 4, foundCount: 18, keptCount: 2, costCents: 64 })],
		chatMentions: [],
		latestPodcastEpisode: null,
	},
	{
		id: "topic-rust-compilers",
		name: "Rust compilers",
		visibility: "private",
		frequency: "weekdays",
		monthScanCount: 0,
		subscriberCount: 0,
		createdAt: FIXTURE_DATE.toISOString(),
		updatedAt: FIXTURE_DATE.toISOString(),
		monthCostCents: 0,
		monthEmailCount: 0,
		ownerUserId: STORY_USER.userId,
		isEmailEnabled: true,
		scans: [],
		chatMentions: [],
		latestPodcastEpisode: null,
	},
]

/** The scans the topic page's scan history lists, newest first, one a day back from the fixture date. */
export const TOPIC_SCAN_FIXTURES: TopicScan[] = [
	toTopicScan({ id: "scan-3", dayOffset: 0, foundCount: 349, keptCount: 13 }),
	toTopicScan({ id: "scan-2", dayOffset: -1, foundCount: 37, keptCount: 4 }),
	toTopicScan({ id: "scan-1", dayOffset: -2, foundCount: 51, keptCount: 8 }),
]

/**
 * The owner's view of a scan's source results: ten Sources that read 349 and kept 13, matching the newest scan in
 * TOPIC_SCAN_FIXTURES. A subreddit fell back to its public feed, and one page failed.
 */
export const SOURCE_RESULTS_FIXTURE: ScanSourceResults = {
	sources: [
		toOkSourceResult({
			sourceId: "source-linkedin",
			sourceKind: "search",
			label: "LinkedIn posts via Exa search",
			foundCount: 121,
			keptCount: 6,
			costDollars: 0.031,
			durationMs: 41_000,
		}),
		toOkSourceResult({
			sourceId: "source-hacker-news",
			sourceKind: "rss",
			label: "Hacker News front page",
			foundCount: 64,
			keptCount: 3,
			costDollars: 0,
			durationMs: 1_800,
		}),
		toOkSourceResult({
			sourceId: "source-engineering-blogs",
			sourceKind: "rss",
			label: "Company engineering blogs",
			foundCount: 52,
			keptCount: 2,
			costDollars: 0,
			durationMs: 3_240,
		}),
		{
			sourceId: "source-startups",
			sourceKind: "reddit",
			label: "r/startups",
			status: "fallback",
			fallbackMode: "reddit-rss",
			foundCount: 38,
			keptCount: 1,
			costDollars: 0,
			durationMs: 6_400,
		},
		toOkSourceResult({
			sourceId: "source-startup-news",
			sourceKind: "rss",
			label: "Startup news feeds",
			foundCount: 22,
			keptCount: 1,
			costDollars: 0,
			durationMs: 2_100,
		}),
		toOkSourceResult({
			sourceId: "source-arxiv",
			sourceKind: "rss",
			label: "arXiv software engineering",
			foundCount: 18,
			keptCount: 0,
			costDollars: 0,
			durationMs: 900,
		}),
		toOkSourceResult({
			sourceId: "source-launches",
			sourceKind: "rss",
			label: "Product launch roundups",
			foundCount: 14,
			keptCount: 0,
			costDollars: 0,
			durationMs: 1_200,
		}),
		toOkSourceResult({
			sourceId: "source-founder-videos",
			sourceKind: "youtube",
			label: "Founder interview videos",
			foundCount: 12,
			keptCount: 0,
			costDollars: 0,
			durationMs: 8_800,
		}),
		toOkSourceResult({
			sourceId: "source-substack",
			sourceKind: "rss",
			label: "Substack newsletters",
			foundCount: 8,
			keptCount: 0,
			costDollars: 0,
			durationMs: 700,
		}),
		{
			sourceId: "source-indie-hackers",
			sourceKind: "url",
			label: "Indie hacker milestones",
			status: "failed",
			reason: "The page answered 403 Forbidden.",
			foundCount: 0,
			keptCount: 0,
			costDollars: 0,
			durationMs: 2_400,
		},
	],
	earlierKeptCount: 0,
	earlierFoundCount: 0,
}

/** The note a scan's popover shows once it loads: the recap and the source results. */
export const SCAN_NOTE_FIXTURE: ScanNote = {
	scanSummary:
		"Read 349 resources and kept 13. Two agent frameworks shipped tool calling, and one benchmark changed its scoring.",
	sourceResults: SOURCE_RESULTS_FIXTURE,
}

/** Twelve topic names, enough for a second page at ten rows a page. */
export const PAGED_TOPIC_NAMES = [
	"Accessibility audits",
	"Battery chemistry",
	"Bike commuting",
	"City gardening",
	"Climbing gyms",
	"Design systems",
	"Home espresso",
	"LLM tooling",
	"Robot vacuums",
	"Sourdough baking",
	"Tax law changes",
	"Trail running shoes",
]

/**
 * Returns a public topic with kept and seen counts and no email setting, with any of its fields replaced.
 */
export function toStoryTopic(topicFields: Pick<Topic, "id" | "name"> & Partial<Topic>): Topic {
	return {
		visibility: "public",
		createdAt: "2026-03-02T12:00:00.000Z",
		updatedAt: FIXTURE_DATE.toISOString(),
		keptCount: 24,
		seenCount: 180,
		subscriberCount: 3,
		isEmailEnabled: null,
		latestPodcastEpisode: null,
		...topicFields,
	}
}

// one succeeded scan that started the given number of days into the month and took four minutes
function toActivityScan({ id, dayOffset, foundCount, keptCount, costCents }: ToActivityScanOptions): ActivityScan {
	// start the scan the given number of days after the fixture date, and finish it four minutes later
	const startedAt = FIXTURE_DATE.getTime() + dayOffset * DAY_MS
	return {
		id,
		status: "succeeded",
		error: null,
		startedAt: new Date(startedAt).toISOString(),
		finishedAt: new Date(startedAt + 4 * MINUTE_MS).toISOString(),
		stoppedAt: null,
		foundCount,
		keptCount,
		costCents,
	}
}

// one topic page scan that ran to the end, starting the given number of days from the fixture date and taking four
// minutes, with nothing filtered, no cost shown, and no podcast episode
function toTopicScan({ id, dayOffset, foundCount, keptCount }: ToTopicScanOptions): TopicScan {
	// start the scan the given number of days from the fixture date, and finish it four minutes later
	const startedAt = FIXTURE_DATE.getTime() + dayOffset * DAY_MS
	return {
		id,
		status: "succeeded",
		error: null,
		startedAt: new Date(startedAt).toISOString(),
		finishedAt: new Date(startedAt + 4 * MINUTE_MS).toISOString(),
		stoppedAt: null,
		foundCount,
		keptCount,
		filteredCount: 0,
		costDollars: null,
		podcastEpisode: null,
	}
}

// one Source's result that ran its primary path
function toOkSourceResult(sourceResultFields: Omit<Extract<SourceResult, { status: "ok" }>, "status">): SourceResult {
	return { ...sourceResultFields, status: "ok" }
}
