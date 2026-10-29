import { expect, test } from "bun:test"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { toPodcastEpisodeFixture } from "../lib/podcastEpisodeTestFixtures"
import { toShownPodcastEpisode } from "./useShownPodcastEpisode"

test("shown episode precedence preserves loaded, linked, recording, and latest choices", () => {
	// make all three episode candidates belong to the same Topic
	const latestPodcastEpisode = toPodcastEpisodeFixture({ id: "latest" })
	const topic = toTestTopicResponse({ id: "topic-1", latestPodcastEpisode })
	const linkedPodcastEpisode = toPodcastEpisodeFixture({ id: "linked" })
	const loadedPodcastEpisode = toPodcastEpisodeFixture({ id: "loaded" })
	const select = (loaded: PodcastEpisode | null, linked: PodcastEpisode | null): string | undefined =>
		toShownPodcastEpisode({ topic, loadedPodcastEpisode: loaded, linkedPodcastEpisode: linked }).podcastEpisode?.id
	expect(select(loadedPodcastEpisode, linkedPodcastEpisode)).toBe("loaded")
	expect(select(null, linkedPodcastEpisode)).toBe("linked")
	expect(select(null, null)).toBe("latest")
	expect(select({ ...loadedPodcastEpisode, topicId: "other" }, { ...linkedPodcastEpisode, topicId: "other" })).toBe(
		"latest",
	)
})

test("recording and failed episodes obey the existing scan permission", () => {
	// a recording takes precedence while a failure stays behind the scan permission
	const unpublishedPodcastEpisode = toPodcastEpisodeFixture({ id: "recording", status: "recording" })
	const topic = toTestTopicResponse({
		id: "topic-1",
		latestPodcastEpisode: toPodcastEpisodeFixture({ id: "latest" }),
		podcast: {
			isEnabled: true,
			hasFullPodcastEpisodes: true,
			canRemovePodcastEpisodes: false,
			unpublishedPodcastEpisode,
			seasons: [],
			latestSeasonPodcastEpisodes: { podcastEpisodes: [] },
			publicFeedUrl: null,
		},
	})
	expect(
		toShownPodcastEpisode({ topic, linkedPodcastEpisode: null, loadedPodcastEpisode: null }).podcastEpisode?.id,
	).toBe("recording")
	if (!topic.podcast) {
		throw new Error("Expected a podcast fixture")
	}
	const failedTopic = {
		...topic,
		isTopicOwner: false,
		isTeamMember: false,
		manualScansRemaining: null,
		podcast: {
			...topic.podcast,
			unpublishedPodcastEpisode: { ...unpublishedPodcastEpisode, status: "failed" as const },
		},
	}
	expect(
		toShownPodcastEpisode({ topic: failedTopic, linkedPodcastEpisode: null, loadedPodcastEpisode: null }).podcastEpisode
			?.id,
	).toBe("latest")
})
