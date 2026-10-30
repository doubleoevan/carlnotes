import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as client from "@carlnotes/client/podcastEpisodeClient"
import { toPodcastEpisodeChapterFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { usePodcastEpisodeChapterRating } from "@carlnotes/core/hooks/usePodcastEpisodeChapterRating"
import { act } from "react"
import { renderTestHook } from "@/lib/hookTestHarness"

afterEach(() => mock.restore())

test("chapter ratings prevent duplicate writes, retain confirmed selection, and roll back failure", async () => {
	const pending = Promise.withResolvers<boolean>()
	const send = spyOn(client, "sendPodcastEpisodeChapterRating").mockReturnValue(pending.promise)
	const harness = await renderTestHook(() =>
		usePodcastEpisodeChapterRating("episode", toPodcastEpisodeChapterFixture()),
	)
	try {
		let save: Promise<void> | undefined
		await act(async () => {
			save = harness.read().rate("up")
			void harness.read().rate("down")
		})
		expect(send).toHaveBeenCalledTimes(1)
		expect(harness.read()).toMatchObject({ rating: "up", isSaving: true })
		await act(async () => {
			pending.resolve(true)
			await save
		})
		expect(harness.read()).toMatchObject({ rating: "up", isSaving: false })
		send.mockRejectedValue(new Error("denied"))
		await act(async () => harness.read().rate("down"))
		expect(harness.read()).toMatchObject({ rating: "up", isSaving: false })
	} finally {
		await harness.close()
	}
})
