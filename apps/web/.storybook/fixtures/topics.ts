// the invented topics the stories show: a builder for a topic table row, the owned topics on the Activity page, the
// topic page's scan history and a scan note, and the topic names the paged tables list
import type { ActivityScan, OwnerTopic } from "@carlnotes/contracts/activity"
import type { Topic } from "@carlnotes/contracts/profiles"
import { DAY_MS, MINUTE_MS } from "@carlnotes/contracts/time"
import type { TopicScan } from "@carlnotes/contracts/topics"
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
			toActivityScan({ id: "scan-1", dayOffset: 0, foundCount: 42, keptCount: 6, costCents: 118 }),
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
	toTopicScan({ id: "scan-3", dayOffset: 0, foundCount: 42, keptCount: 6 }),
	toTopicScan({ id: "scan-2", dayOffset: -1, foundCount: 37, keptCount: 4 }),
	toTopicScan({ id: "scan-1", dayOffset: -2, foundCount: 51, keptCount: 8 }),
]

/** The recap a scan's popover shows once its scan note loads. */
export const SCAN_NOTE_FIXTURE =
	"Read 42 resources and kept 6. Two agent frameworks shipped tool calling, and one benchmark changed its scoring."

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
