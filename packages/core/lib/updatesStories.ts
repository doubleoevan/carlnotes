import { toTestTopicFinding } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { UpdatesFinding, UpdatesResponse } from "@carlnotes/contracts/updates"

// the Findings of a list in the web and mobile stories
const UPDATES_STORY_FINDINGS: UpdatesFinding[] = [
	{
		...toTestTopicFinding({
			findingId: "finding-read",
			title: "Why pressure profiling changes espresso",
			url: "https://example.com/pressure",
			relevanceExplanation: "It measures the pressure curves this Topic keeps asking about.",
		}),
		topicId: "topic-espresso",
		topicName: "Home espresso",
		topicPath: "/topics/topic-espresso/home-espresso",
		readingMinutes: 7.6,
	},
	{
		...toTestTopicFinding({
			findingId: "finding-watch",
			resourceKind: "watch",
			title: "Rebuilding a lever machine",
			url: "https://example.com/lever",
			relevanceExplanation: "A full teardown of the lever group, with the parts you asked about.",
		}),
		topicId: "topic-espresso",
		topicName: "Home espresso",
		topicPath: "/topics/topic-espresso/home-espresso",
		readingMinutes: 12,
	},
	{
		...toTestTopicFinding({
			findingId: "finding-listen",
			resourceKind: "listen",
			title: "Inside the grinder burr shortage",
			url: "https://example.com/burrs",
			relevanceExplanation: "The supply story behind the prices on this Topic's watch list.",
		}),
		topicId: "topic-coffee-trade",
		topicName: "Coffee trade",
		topicPath: "/topics/topic-coffee-trade/coffee-trade",
		readingMinutes: 30,
	},
]

// the Topic of each Finding in a list
const UPDATES_STORY_TOPICS: UpdatesResponse["topics"] = [
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

// a list with its opener and a link to what did not fit
export const UPDATES_STORY: UpdatesResponse = {
	opener: "I had a good time with the espresso reading this morning, and the coffee trade kept me interested too.",
	findings: UPDATES_STORY_FINDINGS,
	moreCount: 12,
	morePath: "/topics",
	topics: UPDATES_STORY_TOPICS,
	podcastEpisodes: [],
}
