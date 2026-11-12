// a details line's counts keep their order, read singular or plural, and leave out a zero
import { expect, test } from "bun:test"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { toCountDetails, toDetailText, toTopicCountsDetails, toTopicDetails } from "./detailsLine"
import { toTeamDetails } from "./teamFields"

// what the topic page's details line reads of a topic
type DetailsTopic = Parameters<typeof toTopicDetails>[0]["topic"]

// a podcast episode of the latest season, with a film or without one
function toPodcastEpisode(id: string, hasVideo: boolean): unknown {
	return { id, video: hasVideo ? { status: "ready" } : null }
}

// a topic with the given count of each thing its page lists. the first film count of its podcast episodes have a film
function toTopic({
	topicPodcastEpisodeVideoCount = 0,
	podcastEpisodeCount = 0,
	commentCount = 0,
	topicPostCount = 0,
	relatedTopicCount = 0,
}): DetailsTopic {
	const podcastEpisodes = Array.from({ length: podcastEpisodeCount }, (_, i) =>
		toPodcastEpisode(`episode-${i}`, i < topicPodcastEpisodeVideoCount),
	)
	return {
		podcast: {
			seasons: podcastEpisodeCount > 0 ? [2026] : [],
			latestSeasonPodcastEpisodes: { podcastEpisodes },
			topicPodcastEpisodeVideoSection:
				topicPodcastEpisodeVideoCount > 0 ? { podcastEpisode: podcastEpisodes[0] } : null,
		},
		commentThread: { commentCount },
		topicPosts: { topicPosts: Array.from({ length: topicPostCount }), canPublish: false },
		relatedTopics: Array.from({ length: relatedTopicCount }),
	} as unknown as DetailsTopic
}

test("counts keep their order, read singular at one, and leave out a zero and a count not known yet", () => {
	expect(
		toCountDetails([
			{ count: 1, noun: "film" },
			{ count: 0, noun: "podcast episode" },
			{ count: 1200, noun: "finding" },
			{ count: null, noun: "note" },
			{ count: undefined, noun: "post" },
			{ count: 2, noun: "similar topic" },
		]),
	).toEqual(["1 film", "1,200 findings", "2 similar topics"])
	expect(toCountDetails([{ count: 0, noun: "film" }])).toEqual([])
})

test("every detail but the line's last ends with a middle dot", () => {
	expect(toDetailText("1 film", false)).toBe("1 film ·")
	expect(toDetailText("6 similar topics", true)).toBe("6 similar topics")
})

test("a topic's details count its films, podcast episodes, findings, comments, posts, notes, and related topics", () => {
	const topic = toTopic({
		topicPodcastEpisodeVideoCount: 1,
		podcastEpisodeCount: 17,
		commentCount: 4,
		topicPostCount: 2,
		relatedTopicCount: 6,
	})
	expect(toTopicDetails({ topic, findingCount: 30, commentCount: null, noteCount: 5 })).toEqual([
		"1 film",
		"17 podcast episodes",
		"30 findings",
		"4 hot takes",
		"2 posts",
		"5 notes",
		"6 similar topics",
	])
})

test("a topic's details take the count its comment thread reports, and add the notes once they load", () => {
	const topic = toTopic({ commentCount: 4 })
	expect(toTopicDetails({ topic, findingCount: 3, commentCount: 5, noteCount: null })).toEqual([
		"3 findings",
		"5 hot takes",
	])
	expect(toTopicDetails({ topic, findingCount: 3, commentCount: 0, noteCount: 1 })).toEqual(["3 findings", "1 note"])
})

test("a topic with nothing to count has no details, and one with no film the user may watch counts no film", () => {
	expect(toTopicDetails({ topic: toTopic({}), findingCount: 0, commentCount: null, noteCount: 0 })).toEqual([])

	// podcast episodes with a film and no film section, and a topic with no podcast and no first page of comments
	const filmlessTopic = toTopic({ topicPodcastEpisodeVideoCount: 2, podcastEpisodeCount: 2 })
	filmlessTopic.podcast = { ...filmlessTopic.podcast, topicPodcastEpisodeVideoSection: null } as DetailsTopic["podcast"]
	const withoutLoadedCounts = { findingCount: 0, commentCount: null, noteCount: null }
	expect(toTopicDetails({ topic: filmlessTopic, ...withoutLoadedCounts })).toEqual(["2 podcast episodes"])
	const bareTopic = { podcast: null, relatedTopics: [] } as unknown as TopicResponse
	expect(toTopicDetails({ topic: bareTopic, ...withoutLoadedCounts })).toEqual([])
})

test("a topic's viewers read as visitors before its followers, each left out at zero, and nothing if they were not read", () => {
	expect(toTopicCountsDetails({ viewerCount: 128, subscriberCount: 1 })).toEqual(["128 visitors", "1 follower"])
	expect(toTopicCountsDetails({ viewerCount: 0, subscriberCount: 3 })).toEqual(["3 followers"])
	expect(toTopicCountsDetails({ viewerCount: 0, subscriberCount: 0 })).toEqual([])
	expect(toTopicCountsDetails(undefined)).toEqual([])
})

test("a team's details keep its members and topics, then add its podcast episodes and notes above zero", () => {
	const teamPage = {
		members: [{ isActive: true }, { isActive: true }, { isActive: false }],
		hiddenMemberCount: 1,
		topics: Array.from({ length: 5 }),
		podcastEpisodeCards: Array.from({ length: 4 }),
	} as unknown as Parameters<typeof toTeamDetails>[0]["teamPage"]
	expect(toTeamDetails({ teamPage, noteCount: 2 })).toEqual(["3 members", "5 topics", "4 podcast episodes", "2 notes"])
	expect(toTeamDetails({ teamPage: { ...teamPage, podcastEpisodeCards: [] }, noteCount: null })).toEqual([
		"3 members",
		"5 topics",
	])
})
