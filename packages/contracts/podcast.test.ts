// podcast contract tests: the next unplayed response parses an episode or null, and the feed url response parses a url
import { expect, test } from "bun:test"
import { nextUnplayedPodcastEpisodeResponse, podcastFeedUrlResponse } from "./podcast"
import { toPodcastEpisodeFixture } from "./podcastEpisodeTestFixtures"

// a published podcast episode as the player shows it
const PUBLISHED_PODCAST_EPISODE = toPodcastEpisodeFixture()

// the next unplayed response parses a podcast episode or null, and rejects a response with no episode field
test("nextUnplayedPodcastEpisodeResponse parses an episode or null", () => {
	const withEpisode = { podcastEpisode: PUBLISHED_PODCAST_EPISODE }
	expect(nextUnplayedPodcastEpisodeResponse.parse(withEpisode)).toEqual(withEpisode)
	expect(nextUnplayedPodcastEpisodeResponse.parse({ podcastEpisode: null })).toEqual({ podcastEpisode: null })
	expect(nextUnplayedPodcastEpisodeResponse.safeParse({}).success).toBe(false)
})

// the feed url response parses the url and rejects a response with none
test("podcastFeedUrlResponse parses the feed url", () => {
	const feed = { podcastFeedUrl: "https://carlnotes.example/podcast-feeds/token.xml" }
	expect(podcastFeedUrlResponse.parse(feed)).toEqual(feed)
	expect(podcastFeedUrlResponse.safeParse({}).success).toBe(false)
})
