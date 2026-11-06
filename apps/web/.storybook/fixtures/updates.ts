import type { FindingSearchTopic } from "@carlnotes/contracts/search"
import { toTestUpdatesFinding } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { Updates, UpdatesFinding } from "@carlnotes/contracts/updates"

// the Findings of an updates list in the stories
const UPDATES_STORY_FINDINGS: UpdatesFinding[] = [
	toTestUpdatesFinding({
		findingId: "finding-read",
		title: "Why pressure profiling changes espresso",
		url: "https://example.com/pressure",
		relevanceExplanation: "It measures the pressure curves this Topic keeps asking about.",
		readingMinutes: 7.6,
	}),
	toTestUpdatesFinding({
		findingId: "finding-watch",
		resourceKind: "watch",
		title: "Rebuilding a lever machine",
		url: "https://example.com/lever",
		relevanceExplanation: "A full teardown of the lever group, with the parts you asked about.",
		readingMinutes: 12,
	}),
	toTestUpdatesFinding({
		findingId: "finding-listen",
		resourceKind: "listen",
		title: "Inside the grinder burr shortage",
		url: "https://example.com/burrs",
		relevanceExplanation: "The supply story behind the prices on this Topic's watch list.",
		topicId: "topic-coffee-trade",
		topicName: "Coffee trade",
		topicPath: "/topics/topic-coffee-trade/coffee-trade",
		readingMinutes: 30,
	}),
]

// the Topic of each Finding in an updates list
export const UPDATES_STORY_TOPICS: FindingSearchTopic[] = [
	{
		id: "topic-espresso",
		name: "Home espresso",
		prompt: "Espresso at home",
		visibility: "public",
		canRate: true,
		canBookmark: true,
	},
	{
		id: "topic-coffee-trade",
		name: "Coffee trade",
		prompt: "The coffee trade",
		visibility: "public",
		canRate: true,
		canBookmark: true,
	},
]

// an updates list with its opener and a link to what did not fit
export const UPDATES_STORY: Updates = {
	opener: "I had a good time with the espresso reading this morning, and the coffee trade kept me interested too.",
	findings: UPDATES_STORY_FINDINGS,
	moreCount: 12,
	morePath: "/",
}
