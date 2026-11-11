// podcast feed tests: a 304 for a current copy, by its etag or by its modified time, the film feed's items, one feed
// token behind both feed urls, and a token's delete clearing both cached feeds
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import { restoreRedisClient, stubRedisClient } from "@carlnotes/db/redisClientStub"
import { Hono } from "hono"
import * as authorization from "../authorization"
import type { PodcastEpisodeRow, TopicRow } from "./podcastEpisodeRows"
import * as episodeRows from "./podcastEpisodeRows"
import {
	deletePodcastFeedToken,
	loadOrCreatePodcastFeedUrls,
	loadRenderedPodcastFeed,
	type RenderedPodcastFeed,
	toPodcastFeedResponse,
} from "./podcastFeedTokens"

// the cover urls in a feed are signed with the app's auth secret
Bun.env.BETTER_AUTH_SECRET ??= "podcast-feed-test-secret"

// every test reads its own empty cache, so no feed comes back from an earlier run
beforeEach(() => {
	stubRedisClient()
})

// put the pool, the Redis client, and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	restoreRedisClient()
	mock.restore()
})

// a rendered feed last changed at a fixed second, behind one route
const renderedPodcastFeed: RenderedPodcastFeed = {
	xml: "<rss/>",
	etag: '"abc"',
	lastModifiedMs: Date.UTC(2026, 9, 1, 9),
}
const app = new Hono().get("/feed.xml", (context) =>
	toPodcastFeedResponse({ context, renderedPodcastFeed, routeHeaders: { "X-Route": "kept" } }),
)

// request the feed with the given conditional headers
function requestFeed(headers: Record<string, string> = {}): Promise<Response> {
	return Promise.resolve(app.request("/feed.xml", { headers }))
}

test("an unconditional request gets the feed with its validators", async () => {
	// the feed's xml with a 200
	const response = await requestFeed()
	expect(response.status).toBe(200)
	expect(await response.text()).toBe("<rss/>")

	// the validators that the next request sends back, the feed's type, and the header that the route passed
	expect(response.headers.get("ETag")).toBe('"abc"')
	expect(response.headers.get("Last-Modified")).toBe("Thu, 01 Oct 2026 09:00:00 GMT")
	expect(response.headers.get("Content-Type")).toBe("application/rss+xml; charset=utf-8")
	expect(response.headers.get("X-Route")).toBe("kept")
})

test("a matching etag is a 304, and a stale etag gets the feed", async () => {
	// the matching etag gets no body
	const currentResponse = await requestFeed({ "If-None-Match": '"abc"' })
	expect(currentResponse.status).toBe(304)
	expect(await currentResponse.text()).toBe("")
	expect((await requestFeed({ "If-None-Match": '"old"' })).status).toBe(200)
})

test("a modified time at or after the feed's last change is a 304, and an earlier time gets the feed", async () => {
	// the second of the feed's last change is current, and the second before it is not
	expect((await requestFeed({ "If-Modified-Since": "Thu, 01 Oct 2026 09:00:00 GMT" })).status).toBe(304)
	expect((await requestFeed({ "If-Modified-Since": "Thu, 01 Oct 2026 08:59:59 GMT" })).status).toBe(200)

	// an etag decides alone if the request sent an etag
	const staleEtagHeaders = { "If-None-Match": '"old"', "If-Modified-Since": "Fri, 02 Oct 2026 09:00:00 GMT" }
	expect((await requestFeed(staleEtagHeaders)).status).toBe(200)
})

// an invite topic, and a published podcast episode of it
const inviteTopic = { id: "topic-1", name: "Coffee", prompt: "", visibility: "invite", imageHash: null } as TopicRow
const toPodcastEpisodeRow = (id: string, episodeNumber: number): PodcastEpisodeRow => ({
	id,
	topicId: "topic-1",
	scanId: `scan-${id}`,
	status: "published",
	title: `Episode ${episodeNumber}`,
	description: null,
	season: 2026,
	episodeNumber,
	audioKey: `audio-${id}`,
	audioByteSize: 1234,
	durationSeconds: 60,
	listenerCount: 0,
	publishedAt: new Date("2026-10-01T09:00:00Z"),
	imageHash: null,
})

test("the film feed lists only the podcast episodes with a ready film, and the podcast feed lists them all", async () => {
	// two podcast episodes, and only episode-2 has a ready film
	spyOn(episodeRows, "loadPublishedPodcastEpisodeRows").mockResolvedValue([
		toPodcastEpisodeRow("episode-2", 2),
		toPodcastEpisodeRow("episode-1", 1),
	])
	stubConnectionPool((sentQuery) =>
		sentQuery.text.includes('from "topic_podcast_episode_videos"') ? [["episode-2", "ready", 48_000_000]] : [],
	)
	const listener = { userId: "listener", token: "token-1" }

	// the film feed has the one film, and the podcast feed has both podcast episodes
	const filmFeed = await loadRenderedPodcastFeed({ topic: inviteTopic, listener, format: "video" })
	expect(filmFeed.xml.match(/<item>/g)).toHaveLength(1)
	expect(filmFeed.xml).toContain("/api/podcast-feeds/token-1/episodes/episode-2/video.mp4")
	expect(filmFeed.xml).toContain("/podcast-video-feeds/token-1.xml")
	const podcastFeed = await loadRenderedPodcastFeed({ topic: inviteTopic, listener })
	expect(podcastFeed.xml.match(/<item>/g)).toHaveLength(2)
})

test("a listener's podcast feed and film feed share one token, so a reset changes both", async () => {
	// the listener's token, and a topic with a ready film
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	stubConnectionPool((sentQuery) => {
		if (sentQuery.text.includes('from "topic_podcast_episode_videos"')) {
			return [["film-1"]]
		}
		return sentQuery.text.startsWith("select") ? [["token-1"]] : []
	})

	// both urls name the one token
	const podcastFeedUrls = await loadOrCreatePodcastFeedUrls("listener", inviteTopic)
	expect(podcastFeedUrls?.podcastFeedUrl).toEndWith("/podcast-feeds/token-1.xml")
	expect(podcastFeedUrls?.podcastVideoFeedUrl).toEndWith("/podcast-video-feeds/token-1.xml")

	// a topic with no film has no film feed url
	restoreConnectionPool()
	stubConnectionPool((sentQuery) =>
		sentQuery.text.startsWith("select") && !sentQuery.text.includes("videos") ? [["token-1"]] : [],
	)
	expect((await loadOrCreatePodcastFeedUrls("listener", inviteTopic))?.podcastVideoFeedUrl).toBeNull()
})

test("a token's delete clears its cached check and the listener's cached podcast feed and film feed", async () => {
	// the listener's two cached feeds and the token's cached check, beside another listener's feed
	const storedValueByKey = stubRedisClient()

	const listenerKeys = ["podcast-feed:topic-1:listener", "podcast-video-feed:topic-1:listener"]
	for (const key of [...listenerKeys, "podcast-feed-token:token-1", "podcast-video-feed:topic-1:other-listener"]) {
		storedValueByKey.set(key, "{}")
	}

	// the delete returns the token's row
	stubConnectionPool((sentQuery) => (sentQuery.text.startsWith("delete") ? [["token-1"]] : []))
	await deletePodcastFeedToken({ topicId: "topic-1", userId: "listener" })
	expect([...storedValueByKey.keys()]).toEqual(["podcast-video-feed:topic-1:other-listener"])
})
