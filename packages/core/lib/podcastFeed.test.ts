import { expect, test } from "bun:test"
import { toPodcastAppLink } from "./podcastFeed"

test("podcast app schemes preserve every private-feed token character", () => {
	const feedUrl = "https://carlnotes.com/api/topics/topic/feed.xml?token=fake%2Btoken%2Fvalue&format=rss"
	expect(toPodcastAppLink({ platform: "ios", feedUrl })).toEqual({
		url: "podcast://carlnotes.com/api/topics/topic/feed.xml?token=fake%2Btoken%2Fvalue&format=rss",
		label: "Open in Apple Podcasts",
	})
	expect(toPodcastAppLink({ platform: "android", feedUrl })?.url).toBe(
		"pcast://carlnotes.com/api/topics/topic/feed.xml?token=fake%2Btoken%2Fvalue&format=rss",
	)
	expect(toPodcastAppLink({ platform: "windows", feedUrl })).toBeNull()
	expect(toPodcastAppLink({ platform: "ios", feedUrl: "javascript:alert(1)" })).toBeNull()
})
