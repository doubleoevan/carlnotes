// page read tests: a topic's and a podcast episode's page read become the page, the invite gate, or a missing page,
// and a topic page's saved counts become the counts its poll shows first
import { expect, test } from "bun:test"
import type { PodcastEpisodePageRead, TopicPageRead } from "@carlnotes/contracts/pageReads"
import { toPodcastEpisodePageResult, toSavedTopicCounts, toTopicPageResult } from "./pageReads"

// a page head the reads hold
const HEAD = {
	title: "Coffee",
	cardTitle: "Coffee",
	description: "Coffee",
	canonicalUrl: null,
	cardUrl: "http://localhost/topics/t1",
	imageUrl: "http://localhost/og.png",
	feedUrl: null,
	isIndexed: false,
	jsonLd: null,
}

// an invite topic's gate
const TOPIC_GATE = { error: "forbidden", gatedVisibility: "invite", topicName: "Coffee" } as const

test("a topic page read is the topic, the invite gate, or a missing topic", () => {
	const topic = { id: "t1" } as NonNullable<TopicPageRead["topic"]>
	expect(toTopicPageResult({ head: HEAD, topic, topicGate: null })).toEqual({ status: "visible", topic })
	expect(toTopicPageResult({ head: HEAD, topic: null, topicGate: TOPIC_GATE })).toEqual({
		status: "gated",
		topicGate: { topicName: "Coffee" },
	})
	expect(toTopicPageResult({ head: HEAD, topic: null, topicGate: null })).toEqual({ status: "missing" })
	expect(toTopicPageResult(null)).toEqual({ status: "missing" })
})

test("a podcast episode page read is the page, its topic's invite gate, or a missing podcast episode", () => {
	const podcastEpisodePage = { podcastEpisode: { id: "e1" } } as NonNullable<
		PodcastEpisodePageRead["podcastEpisodePage"]
	>
	expect(toPodcastEpisodePageResult({ head: HEAD, podcastEpisodePage, topicGate: null })).toEqual({
		status: "visible",
		podcastEpisodePage,
	})
	expect(toPodcastEpisodePageResult({ head: HEAD, podcastEpisodePage: null, topicGate: TOPIC_GATE }).status).toBe(
		"gated",
	)
	expect(toPodcastEpisodePageResult(null)).toEqual({ status: "missing" })
})

test("a topic page's saved counts are its poll's first counts, and an older payload with no viewer count has none", () => {
	expect(toSavedTopicCounts({ viewerCount: 128, subscriberCount: 14 })).toEqual({
		viewerCount: 128,
		subscriberCount: 14,
	})
	expect(toSavedTopicCounts({ subscriberCount: 14 })).toBeNull()
})
