import { expect, mock, test } from "bun:test"
import { openPodcastFeed } from "./podcastFeedActions"

test("podcast launch preserves tokens and returns safe copy fallbacks", async () => {
	const feedUrl = "https://example.test/feed.xml?token=fictional%2Bsecret"
	const adapter = { canOpenURL: mock(async () => true), openURL: mock(async () => {}) }
	const options = { feedUrl, platform: "ios", adapter, isCurrent: () => true }
	expect(await openPodcastFeed(options)).toBeNull()
	expect(adapter.openURL).toHaveBeenCalledWith("podcast://example.test/feed.xml?token=fictional%2Bsecret")
	adapter.canOpenURL.mockResolvedValue(false)
	expect(await openPodcastFeed(options)).toContain("Copy the feed link instead")
	expect(adapter.openURL).toHaveBeenCalledTimes(1)
	adapter.canOpenURL.mockRejectedValue(new Error(feedUrl))
	const message = await openPodcastFeed(options)
	expect(message).toContain("Copy the feed link instead")
	expect(message).not.toContain("fictional")
})

test("closing the dialog or changing accounts retires a delayed app launch", async () => {
	const supported = Promise.withResolvers<boolean>()
	let isActive = true
	const adapter = { canOpenURL: () => supported.promise, openURL: mock(async () => {}) }
	const pending = openPodcastFeed({
		feedUrl: "https://example.test/private.xml",
		platform: "ios",
		adapter,
		isCurrent: () => isActive,
	})
	isActive = false
	supported.resolve(true)
	expect(await pending).toBeNull()
	expect(adapter.openURL).not.toHaveBeenCalled()
})
