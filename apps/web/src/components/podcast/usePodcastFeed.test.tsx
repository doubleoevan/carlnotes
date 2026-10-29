import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as client from "@carlnotes/client/podcastEpisodeClient"
import { usePodcastFeed } from "@carlnotes/core/hooks/usePodcastFeed"
import { act } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"

afterEach(() => mock.restore())

test("feed reset requires confirmation, prevents duplicate writes, and replaces only confirmed links", async () => {
	spyOn(client, "fetchPodcastFeedUrl").mockResolvedValue("https://example.test/old.xml")
	const pending = Promise.withResolvers<string | null>()
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
			pending.resolve("https://example.test/new.xml")
			await first
		})
		expect(harness.read()).toMatchObject({
			url: "https://example.test/new.xml",
			isResetting: false,
			isConfirmingReset: false,
		})
	} finally {
		await harness.close()
	}
})

test("failed resets retain the link, denied resets clear it, and account changes retire delayed reads", async () => {
	const read = spyOn(client, "fetchPodcastFeedUrl").mockResolvedValue("https://example.test/old.xml")
	const reset = spyOn(client, "sendResetPodcastFeed").mockRejectedValue(new client.PodcastEpisodeRequestError(503))
	const harness = await renderTestHook(() => usePodcastFeed({ topicId: "topic", userId: "owner" }))
	try {
		await act(async () => harness.read().confirmReset())
		await act(async () => harness.read().reset())
		expect(harness.read().url).toBe("https://example.test/old.xml")
		reset.mockRejectedValue(new client.PodcastEpisodeRequestError(403))
		await act(async () => harness.read().confirmReset())
		await act(async () => harness.read().reset())
		expect(harness.read().url).toBeNull()
		const oldRead = Promise.withResolvers<string | null>()
		read.mockReturnValueOnce(oldRead.promise).mockResolvedValue(null)
		await harness.render(() => usePodcastFeed({ topicId: "another-topic", userId: "owner" }))
		await harness.render(() => usePodcastFeed({ topicId: "another-topic", userId: "new-owner" }))
		await act(async () => oldRead.resolve("https://example.test/private-old-owner.xml"))
		expect(harness.read().url).toBeNull()
	} finally {
		await harness.close()
	}
})
