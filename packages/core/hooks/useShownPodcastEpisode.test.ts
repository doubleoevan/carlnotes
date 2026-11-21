import { afterEach, expect, jest, test } from "bun:test"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toPodcastEpisodeFixture, toTopicPodcastFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { focusManager } from "@tanstack/react-query"
import { advancePolls, settle } from "../lib/pollTestFixtures"
import {
	PODCAST_EPISODE_RECORDING_POLL_MS,
	startRecordingPodcastEpisodePoll,
	toShownPodcastEpisode,
} from "./useShownPodcastEpisode"

test("shown episode precedence preserves loaded, linked, recording, and latest choices", () => {
	// make all three podcast episode candidates belong to the same Topic
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
		podcast: toTopicPodcastFixture({ unpublishedPodcastEpisode, seasons: [] }),
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
	// the Topic's latest podcast episode, and one of its Topic Posts' discussions in the player
	const latestPodcastEpisode = toPodcastEpisodeFixture({ id: "latest" })
	const topic = toTestTopicResponse({ id: "topic-1", latestPodcastEpisode })
	const loadedDiscussion = toPodcastEpisodeFixture({ id: "topic-post-discussion:post-1:recording-1" })

	// the discussion belongs to the Topic, yet the podcast section keeps the latest podcast episode
	expect(loadedDiscussion.topicId).toBe(topic.id)
	expect(
		toShownPodcastEpisode({ topic, loadedPodcastEpisode: loadedDiscussion, linkedPodcastEpisode: null }).podcastEpisode
			?.id,
	).toBe("latest")
})

// put the real clock and the app's own focus back after each test
afterEach(() => {
	jest.useRealTimers()
	focusManager.setFocused(undefined)
})

test("a linked recording's poll pauses in a hidden tab, reads at once on the return, and stops once it publishes", async () => {
	// fake timers in a focused tab, and a poll that counts its reads while the podcast episode records
	jest.useFakeTimers()
	focusManager.setFocused(true)
	let readCount = 0
	let isRecording = true
	const stopPoll = startRecordingPodcastEpisodePoll(async () => {
		readCount += 1
		return isRecording
	})

	// one read per interval while the podcast episode records
	await advancePolls({ pollMs: PODCAST_EPISODE_RECORDING_POLL_MS, pollCount: 2 })
	expect(readCount).toBe(2)

	// no read in a hidden tab, and a read at once on the return
	focusManager.setFocused(false)
	await advancePolls({ pollMs: PODCAST_EPISODE_RECORDING_POLL_MS, pollCount: 4 })
	expect(readCount).toBe(2)
	focusManager.setFocused(true)
	await settle()
	expect(readCount).toBe(3)

	// a read that finds it published stops the poll
	isRecording = false
	await advancePolls({ pollMs: PODCAST_EPISODE_RECORDING_POLL_MS, pollCount: 1 })
	expect(readCount).toBe(4)
	await advancePolls({ pollMs: PODCAST_EPISODE_RECORDING_POLL_MS, pollCount: 5 })
	expect(readCount).toBe(4)
	stopPoll()
})

test("a linked recording's poll stops at its one-hour limit", async () => {
	jest.useFakeTimers()
	focusManager.setFocused(true)
	let readCount = 0
	const stopPoll = startRecordingPodcastEpisodePoll(async () => {
		readCount += 1
		return true
	})

	// an hour of reads, then none past the limit
	await advancePolls({
		pollMs: PODCAST_EPISODE_RECORDING_POLL_MS,
		pollCount: (60 * 60 * 1000) / PODCAST_EPISODE_RECORDING_POLL_MS,
	})
	const readCountAtLimit = readCount
	await advancePolls({ pollMs: PODCAST_EPISODE_RECORDING_POLL_MS, pollCount: 20 })
	expect(readCount).toBe(readCountAtLimit)
	stopPoll()
})
