// activity tests for the payload assembly
import { expect, test } from "bun:test"
import type { PodcastEpisode } from "@shared/contracts"
import { toActivityTopics, toCents, toSubscriptionRows } from "./activity"

// scans.cost is a numeric dollars string, converted once for every spend figure on the page
test("toCents converts the dollars string and zeroes malformed values", () => {
	expect(toCents("0.123456")).toBe(12)
	expect(toCents("1.20")).toBe(120)
	expect(toCents(null)).toBe(0)
	expect(toCents("not a number")).toBe(0)
})

// each owned topic includes its month scan count, cost sum, and subtable rows
test("toActivityTopics groups scans per topic and sums their cents", () => {
	const topicRows = [
		{
			id: "t1",
			ownerId: "owner-1",
			name: "Agents",
			visibility: "public" as const,
			frequency: "daily" as const,
			createdAt: new Date("2026-07-01T00:00:00Z"),
			updatedAt: new Date("2026-07-20T00:00:00Z"),
		},
		{
			id: "t2",
			ownerId: "owner-1",
			name: "Quiet",
			visibility: "private" as const,
			frequency: "weekly" as const,
			createdAt: new Date("2026-07-02T00:00:00Z"),
			updatedAt: new Date("2026-07-02T00:00:00Z"),
		},
	]
	const scanRows = [
		{
			id: "s1",
			topicId: "t1",
			status: "succeeded" as const,
			error: null,
			startedAt: new Date("2026-07-21T00:00:00Z"),
			finishedAt: new Date("2026-07-21T00:02:00Z"),
			stoppedAt: null,
			foundCount: 12,
			keptCount: 3,
			costDollars: "0.10",
			scanSummary: "Found a few things.",
		},
		// a still-running scan has no finish time or recap yet
		{
			id: "s2",
			topicId: "t1",
			status: "running" as const,
			error: null,
			startedAt: new Date("2026-07-22T00:00:00Z"),
			finishedAt: null,
			stoppedAt: null,
			foundCount: 4,
			keptCount: 1,
			costDollars: "0.25",
			scanSummary: null,
		},
	]
	// only the first topic has subscribers, so the second proves a missing count reads as zero
	const [agents, quiet] = toActivityTopics({ topicRows, scanRows, subscriberCountByTopic: new Map([["t1", 3]]) })

	// the topic with scans counts them and sums their cost in cents
	expect(agents?.monthScanCount).toBe(2)
	expect(agents?.subscriberCount).toBe(3)
	expect(quiet?.subscriberCount).toBe(0)
	expect(agents?.monthCostCents).toBe(35)
	expect(agents?.scans.map((scan) => scan.costCents)).toEqual([10, 25])
	expect(agents?.scans.map((scan) => scan.foundCount)).toEqual([12, 4])

	// finishedAt converts to an iso string when it's set and passes null through otherwise
	expect(agents?.scans[0]?.finishedAt).toBe("2026-07-21T00:02:00.000Z")
	expect(agents?.scans[1]?.finishedAt).toBeNull()

	// a topic with no scans this month still appears, with zeroes
	expect(quiet?.monthScanCount).toBe(0)
	expect(quiet?.monthCostCents).toBe(0)
	expect(quiet?.scans).toEqual([])
})

// a subscription row for one topic, or the pending invitation that stands in for one
function subscriptionRow(topicId: string): Parameters<typeof toSubscriptionRows>[0][number] {
	return {
		topicId,
		name: `topic ${topicId}`,
		owner: { userId: "owner-1", username: "Owner", avatarSource: null, avatarVersion: null },
		team: null,
		visibility: "public",
		subscribedAt: new Date("2026-07-01T00:00:00Z"),
		isActive: true,
		isEmailEnabled: true,
		inviteId: null,
	}
}

// the dates serialize to strings for a JSON payload
test("toSubscriptionRows serializes the subscribed date", () => {
	const [row] = toSubscriptionRows([subscriptionRow("t1")])
	expect(row?.subscribedAt).toBe("2026-07-01T00:00:00.000Z")
})

// an owned topic row with no scans this month
function ownedTopicRow(topicId: string): Parameters<typeof toActivityTopics>[0]["topicRows"][number] {
	return {
		id: topicId,
		ownerId: "owner-1",
		name: `topic ${topicId}`,
		visibility: "public",
		frequency: "weekly",
		createdAt: new Date("2026-07-01T00:00:00Z"),
		updatedAt: new Date("2026-07-01T00:00:00Z"),
	}
}

// the latest podcast episode passes through to its topic's row, and a topic without one reads null
test("toActivityTopics and toSubscriptionRows include each topic's latest podcast episode", () => {
	const podcastEpisode = { id: "podcast-episode-1", episodeNumber: 3 } as PodcastEpisode
	const latestPodcastEpisodeByTopic = new Map([["t1", podcastEpisode]])

	// an owned topic with a podcast episode and one without
	const [ownedTopicWithEpisode, ownedTopicWithoutEpisode] = toActivityTopics({
		topicRows: [ownedTopicRow("t1"), ownedTopicRow("t2")],
		scanRows: [],
		subscriberCountByTopic: new Map(),
		latestPodcastEpisodeByTopic,
	})
	expect(ownedTopicWithEpisode?.latestPodcastEpisode).toBe(podcastEpisode)
	expect(ownedTopicWithoutEpisode?.latestPodcastEpisode).toBeNull()

	// a subscription with a podcast episode and one without
	const [subscriptionWithEpisode, subscriptionWithoutEpisode] = toSubscriptionRows(
		[subscriptionRow("t1"), subscriptionRow("t2")],
		latestPodcastEpisodeByTopic,
	)
	expect(subscriptionWithEpisode?.latestPodcastEpisode).toBe(podcastEpisode)
	expect(subscriptionWithoutEpisode?.latestPodcastEpisode).toBeNull()
})
