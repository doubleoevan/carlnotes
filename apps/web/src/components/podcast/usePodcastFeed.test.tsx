import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as client from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastFeedUrlResponse } from "@carlnotes/contracts/podcast"
import { usePodcastFeed } from "@carlnotes/core/hooks/usePodcastFeed"
import { act } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"

afterEach(() => mock.restore())

// a listener's feed urls, the film feed's beside the podcast feed's
const toFeedUrls = (name: string): PodcastFeedUrlResponse => ({
	podcastFeedUrl: `https://example.test/${name}.xml`,
	podcastVideoFeedUrl: `https://example.test/${name}-video.xml`,
})

test("Films chooses the film feed's url, and a Topic without a film keeps the podcast feed's", async () => {
	// a Topic with a film starts on the podcast feed, and Films switches the chosen url
	const read = spyOn(client, "fetchPodcastFeedUrl").mockResolvedValue(toFeedUrls("listener"))
	const harness = await renderTestHook(() => usePodcastFeed({ topicId: "topic", userId: "listener" }))
	try {
		expect(harness.read().chosenFeedUrl).toBe("https://example.test/listener.xml")
		await act(async () => harness.read().chooseFormat("video"))
		expect(harness.read().chosenFeedUrl).toBe("https://example.test/listener-video.xml")
		await act(async () => harness.read().chooseFormat("audio"))
		expect(harness.read().chosenFeedUrl).toBe("https://example.test/listener.xml")
	} finally {
		await harness.close()
	}

	// a Topic without a film has no film feed to choose
	read.mockResolvedValue({ podcastFeedUrl: "https://example.test/audio.xml", podcastVideoFeedUrl: null })
	const filmlessHarness = await renderTestHook(() => usePodcastFeed({ topicId: "filmless", userId: "listener" }))
	try {
		await act(async () => filmlessHarness.read().chooseFormat("video"))
		expect(filmlessHarness.read()).toMatchObject({ videoUrl: null, chosenFeedUrl: "https://example.test/audio.xml" })
	} finally {
		await filmlessHarness.close()
	}
})

test("feed reset requires confirmation, prevents duplicate writes, and replaces only confirmed links", async () => {
	spyOn(client, "fetchPodcastFeedUrl").mockResolvedValue(toFeedUrls("old"))
	const pending = Promise.withResolvers<PodcastFeedUrlResponse | null>()
	const reset = spyOn(client, "sendResetPodcastFeed").mockReturnValue(pending.promise)
	const harness = await renderTestHook(() => usePodcastFeed({ topicId: "topic", userId: "owner" }))
	try {
		await act(async () => harness.read().reset())
		expect(reset).not.toHaveBeenCalled()
		await act(async () => harness.read().confirmReset())
		await act(async () => harness.read().cancelReset())
		await act(async () => harness.read().reset())
		expect(reset).not.toHaveBeenCalled()
		await act(async () => harness.read().confirmReset())
		let first: Promise<void> | undefined
		await act(async () => {
			first = harness.read().reset()
			void harness.read().reset()
		})
		expect(reset).toHaveBeenCalledTimes(1)
		await act(async () => {
			pending.resolve(toFeedUrls("new"))
			await first
		})
		expect(harness.read()).toMatchObject({
			url: "https://example.test/new.xml",
			videoUrl: "https://example.test/new-video.xml",
			isResetting: false,
			isConfirmingReset: false,
		})
	} finally {
		await harness.close()
	}
})

test("failed resets retain the link, denied resets clear it, and account changes retire delayed reads", async () => {
	const read = spyOn(client, "fetchPodcastFeedUrl").mockResolvedValue(toFeedUrls("old"))
	const reset = spyOn(client, "sendResetPodcastFeed").mockRejectedValue(new client.PodcastEpisodeRequestError(503))
	const harness = await renderTestHook(() => usePodcastFeed({ topicId: "topic", userId: "owner" }))
	try {
		await act(async () => harness.read().confirmReset())
		await act(async () => harness.read().reset())
		expect(harness.read().url).toBe("https://example.test/old.xml")
		expect(harness.read().videoUrl).toBe("https://example.test/old-video.xml")
		reset.mockRejectedValue(new client.PodcastEpisodeRequestError(403))
		await act(async () => harness.read().confirmReset())
		await act(async () => harness.read().reset())
		expect(harness.read()).toMatchObject({ url: null, videoUrl: null })
		const oldRead = Promise.withResolvers<PodcastFeedUrlResponse | null>()
		read.mockReturnValueOnce(oldRead.promise).mockResolvedValue(null)
		await harness.render(() => usePodcastFeed({ topicId: "another-topic", userId: "owner" }))
		await harness.render(() => usePodcastFeed({ topicId: "another-topic", userId: "new-owner" }))
		await act(async () => oldRead.resolve(toFeedUrls("private-old-owner")))
		expect(harness.read().url).toBeNull()
	} finally {
		await harness.close()
	}
})
