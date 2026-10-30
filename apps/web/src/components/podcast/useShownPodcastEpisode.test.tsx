import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as podcastEpisodeClient from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { useShownPodcastEpisode } from "@carlnotes/core/hooks/useShownPodcastEpisode"
import { toLoadedPodcastEpisode } from "@carlnotes/core/stores/podcastEpisodePlayerStore"
import { act } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"

afterEach(() => mock.restore())

test("a linked recording polls until published without starting playback", async () => {
	// retain the real timer for React while capturing only the recording poll
	const originalTimeout = globalThis.setTimeout
	let poll: (() => void) | undefined
	spyOn(globalThis, "setTimeout").mockImplementation(((handler: () => void, delay?: number) => {
		if (delay === 5000) {
			poll = handler
			return originalTimeout(() => {}, 60_000)
		}
		return originalTimeout(handler, delay)
	}) as typeof setTimeout)
	const episode = toPodcastEpisodeFixture({ status: "recording" })
	const fetchEpisode = spyOn(podcastEpisodeClient, "fetchPodcastEpisode")
		.mockResolvedValueOnce(episode)
		.mockResolvedValue({ ...episode, status: "published" })
	const topic = toTestTopicResponse({ id: episode.topicId })
	const harness = await renderTestHook(() => useShownPodcastEpisode({ topic, linkedPodcastEpisodeId: episode.id }))
	try {
		expect(harness.read().podcastEpisode?.status).toBe("recording")
		await act(async () => poll?.())
		expect(harness.read().podcastEpisode?.status).toBe("published")
		expect(fetchEpisode).toHaveBeenCalledTimes(2)
		expect(toLoadedPodcastEpisode()).toBeNull()
	} finally {
		await harness.close()
	}
})

test("linked episode changes reject old responses and episodes from another Topic", async () => {
	const pending = Promise.withResolvers<PodcastEpisode | null>()
	spyOn(podcastEpisodeClient, "fetchPodcastEpisode")
		.mockReturnValueOnce(pending.promise)
		.mockResolvedValue(toPodcastEpisodeFixture({ id: "wrong", topicId: "other-topic" }))
	const latestPodcastEpisode = toPodcastEpisodeFixture({ id: "latest" })
	const topic = toTestTopicResponse({ id: "topic-1", latestPodcastEpisode })
	const harness = await renderTestHook(() => useShownPodcastEpisode({ topic, linkedPodcastEpisodeId: "old" }))
	try {
		await harness.render(() => useShownPodcastEpisode({ topic, linkedPodcastEpisodeId: "wrong" }))
		await act(async () => pending.resolve(toPodcastEpisodeFixture({ id: "old" })))
		expect(harness.read().podcastEpisode?.id).toBe("latest")
		await harness.render(() => useShownPodcastEpisode({ topic, linkedPodcastEpisodeId: null }))
		expect(harness.read().podcastEpisode?.id).toBe("latest")
	} finally {
		await harness.close()
	}
})

test("inactive screens abort linked reads and resume with a fresh request", async () => {
	// leave a recording lookup pending while the route becomes inactive
	const pending = Promise.withResolvers<PodcastEpisode | null>()
	const fetchEpisode = spyOn(podcastEpisodeClient, "fetchPodcastEpisode")
		.mockReturnValueOnce(pending.promise)
		.mockResolvedValue(toPodcastEpisodeFixture())
	const topic = toTestTopicResponse({ id: "topic-1" })
	const harness = await renderTestHook(() => useShownPodcastEpisode({ topic, linkedPodcastEpisodeId: "episode-1" }))
	try {
		const signal = fetchEpisode.mock.calls[0]?.[1]?.signal
		await harness.render(() => useShownPodcastEpisode({ topic, linkedPodcastEpisodeId: "episode-1", isActive: false }))
		expect(signal?.aborted).toBe(true)
		await act(async () => pending.resolve(toPodcastEpisodeFixture({ status: "recording" })))
		expect(fetchEpisode).toHaveBeenCalledTimes(1)
		await harness.render(() => useShownPodcastEpisode({ topic, linkedPodcastEpisodeId: "episode-1", isActive: true }))
		expect(fetchEpisode).toHaveBeenCalledTimes(2)
		expect(harness.read().podcastEpisode?.status).toBe("published")
	} finally {
		await harness.close()
	}
})
