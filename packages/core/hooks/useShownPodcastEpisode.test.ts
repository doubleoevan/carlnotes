import { expect, test } from "bun:test"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { toShownPodcastEpisode } from "./useShownPodcastEpisode"

test("shown episode precedence preserves loaded, linked, recording, and latest choices", () => {
	// make all three episode candidates belong to the same Topic
	const latestPodcastEpisode = toPodcastEpisodeFixture({ id: "latest" })
	const topic = toTestTopicResponse({ id: "topic-1", latestPodcastEpisode })
	const linkedPodcastEpisode = toPodcastEpisodeFixture({ id: "linked" })
	const loadedPodcastEpisode = toPodcastEpisodeFixture({ id: "loaded" })
	const select = (loaded: PodcastEpisode | null, linked: PodcastEpisode | null): string | undefined =>
		toShownPodcastEpisode({ topic, loadedPodcastEpisode: loaded, linkedPodcastEpisode: linked }).podcastEpisode?.id

	// a loaded Podcast Episode wins, then a linked one, then the latest, and another Topic's never shows
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
			isCommentsEnabled: true,
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

test("a Topic Post's discussion loaded in the player leaves the Topic's own episode shown", () => {
	// the Topic's latest episode, and one of its posts' discussions in the player
	const latestPodcastEpisode = toPodcastEpisodeFixture({ id: "latest" })
	const topic = toTestTopicResponse({ id: "topic-1", latestPodcastEpisode })
	const loadedDiscussion = toPodcastEpisodeFixture({ id: "topic-post-discussion:post-1:recording-1" })

	// the discussion belongs to the Topic, yet the podcast section keeps the latest episode
	expect(loadedDiscussion.topicId).toBe(topic.id)
	expect(
		toShownPodcastEpisode({ topic, loadedPodcastEpisode: loadedDiscussion, linkedPodcastEpisode: null }).podcastEpisode
			?.id,
	).toBe("latest")
})
