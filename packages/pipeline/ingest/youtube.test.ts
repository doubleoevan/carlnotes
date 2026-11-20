// the YouTube ingester's tests: the playlist read, its Atom fallback, and the videos' lengths
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool, toTableUpdates } from "@carlnotes/db/connectionPoolStub"
import * as monitoring from "@carlnotes/server/monitoring"
import { FetchStatusError } from "@carlnotes/server/publicFetch"
import * as feed from "./feed"
import type { Source } from "./ingester"
import { fetchVideos, parseVideos, toVideoDurationSeconds, youtubeIngester } from "./youtube"

// the API key the run started with, which the ingester tests set
const originalYoutubeApiKey = Bun.env.YOUTUBE_API_KEY

// put the fetch, the error report, the connection pool, and the API key back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
	Bun.env.YOUTUBE_API_KEY = originalYoutubeApiKey
})

// a YouTube channel id the Source reads
const YOUTUBE_CHANNEL_ID = "UCHnyfMqiRRG1u-2MsSQLbXA"

// a ready YouTube Source reading the YouTube channel
const YOUTUBE_CHANNEL_SOURCE = {
	id: "source-1",
	topicId: "topic-1",
	kind: "youtube",
	config: { channelId: YOUTUBE_CHANNEL_ID },
	status: "ready",
} as unknown as Source

// respond to the playlist read with the given status
function stubPlaylistStatus(status: number): void {
	Bun.env.YOUTUBE_API_KEY = "fixture-key"
	spyOn(globalThis, "fetch").mockImplementation((async () => new Response("{}", { status })) as unknown as typeof fetch)
}

// respond to the playlist read, then to the videos read with the given response
function stubYoutubeFetch(videosResponse: Response): ReturnType<typeof spyOn> {
	return spyOn(globalThis, "fetch").mockImplementation((async (url: string) =>
		url.includes("/playlistItems") ? Response.json({ items: VIDEOS }) : videosResponse) as unknown as typeof fetch)
}

// two distinct videos plus a third repeating the first videoId, to exercise deduping
const VIDEOS = [
	{ snippet: { title: "First", description: "First desc", resourceId: { videoId: "aaa" } } },
	{ snippet: { title: "Second", resourceId: { videoId: "bbb" } } },
	{ snippet: { title: "Dup", resourceId: { videoId: "aaa" } } },
]

// each video becomes one watch Resource keyed by its watch?v= url, deduped within a payload
test("parseVideos maps youtube videos to deduped 'watch' Resources", () => {
	const resources = parseVideos({ items: VIDEOS })
	expect(resources.map((resource) => resource.url)).toEqual([
		"https://www.youtube.com/watch?v=aaa",
		"https://www.youtube.com/watch?v=bbb",
	])

	// every Resource has a "watch" kind, and the first video's title gets set
	expect(resources.every((resource) => resource.kind === "watch")).toBe(true)
	expect(resources[0]?.title).toBe("First")

	// the snippet is its video description. a video without one has snippet null
	expect(resources[0]?.snippet).toBe("First desc")
	expect(resources[1]?.snippet).toBeNull()
})

// an incomplete payload never throws an error
test("parseVideos skips a missing items array and videos with no videoId", () => {
	// no items key at all yield no Resources instead of a TypeError
	expect(parseVideos({})).toEqual([])

	// a video missing its videoId is dropped. a well-formed one beside it still gets mapped
	const resources = parseVideos({
		items: [{ snippet: { title: "Deleted" } }, { snippet: { title: "Live", resourceId: { videoId: "ccc" } } }],
	})
	expect(resources.map((resource) => resource.url)).toEqual(["https://www.youtube.com/watch?v=ccc"])
})

// a playlist the API does not serve, as for a YouTube Topic channel, is read from the YouTube channel's Atom feed
test("the ingester reads the Atom feed if the API has no playlist", async () => {
	stubConnectionPool()
	stubPlaylistStatus(404)
	const fetchNamedFeedSpy = spyOn(feed, "fetchNamedFeed").mockResolvedValue({
		feedName: "Homeboy Sandman - Topic",
		resources: [
			{ url: "https://www.youtube.com/watch?v=aaa", title: "A", kind: "watch", snippet: null, contentHash: null },
		],
	})
	const ingestResult = await youtubeIngester(YOUTUBE_CHANNEL_SOURCE)
	expect(ingestResult.fallbackMode).toBe("youtube-atom")
	expect(ingestResult.resources).toHaveLength(1)
	expect(fetchNamedFeedSpy.mock.calls[0]?.[0]).toBe(
		`https://www.youtube.com/feeds/videos.xml?channel_id=${YOUTUBE_CHANNEL_ID}`,
	)
})

// a YouTube channel that neither the API nor the feed has is failed on its row, so it stops reading ready
test("the ingester fails the source if the feed has no YouTube channel either", async () => {
	const sentQueries = stubConnectionPool()
	stubPlaylistStatus(404)
	spyOn(feed, "fetchNamedFeed").mockRejectedValue(new FetchStatusError("feed", 404))
	await expect(youtubeIngester(YOUTUBE_CHANNEL_SOURCE)).rejects.toThrow("feed returned 404")

	// the one write marks the row failed with the reason its owner reads
	const sourceUpdates = toTableUpdates(sentQueries, "sources")
	expect(sourceUpdates).toHaveLength(1)
	expect(sourceUpdates[0]?.values).toContain("failed")
	expect(sourceUpdates[0]?.values).toContain("YouTube has no channel or playlist with this id")
})

// without a key, the feed alone says a YouTube channel is missing, and the feed sometimes says so for a YouTube channel
// that exists
test("the ingester keeps the source ready if only the feed has no YouTube channel", async () => {
	const sentQueries = stubConnectionPool()
	Bun.env.YOUTUBE_API_KEY = ""
	spyOn(feed, "fetchNamedFeed").mockRejectedValue(new FetchStatusError("feed", 404))
	await expect(youtubeIngester(YOUTUBE_CHANNEL_SOURCE)).rejects.toThrow("feed returned 404")
	expect(toTableUpdates(sentQueries, "sources")).toEqual([])
})

// a 400 that names the API key is a rejected key, which reads no feed and leaves the Source ready
test("the ingester reads no feed if the API rejects its key", async () => {
	const sentQueries = stubConnectionPool()
	Bun.env.YOUTUBE_API_KEY = "fixture-key"
	spyOn(globalThis, "fetch").mockImplementation(
		(async () =>
			new Response('{"error":{"message":"API key not valid. Please pass a valid API key."}}', {
				status: 400,
			})) as unknown as typeof fetch,
	)
	const fetchNamedFeedSpy = spyOn(feed, "fetchNamedFeed")
	await expect(youtubeIngester(YOUTUBE_CHANNEL_SOURCE)).rejects.toThrow("returned 400")
	expect(fetchNamedFeedSpy).not.toHaveBeenCalled()
	expect(toTableUpdates(sentQueries, "sources")).toEqual([])
})

// a quota 403 may pass by the next Scan, so the Source keeps reading ready and no feed is read
test("the ingester fails only the Scan's read on a quota error", async () => {
	const sentQueries = stubConnectionPool()
	stubPlaylistStatus(403)
	const fetchNamedFeedSpy = spyOn(feed, "fetchNamedFeed")
	await expect(youtubeIngester(YOUTUBE_CHANNEL_SOURCE)).rejects.toThrow("returned 403")
	expect(fetchNamedFeedSpy).not.toHaveBeenCalled()
	expect(toTableUpdates(sentQueries, "sources")).toEqual([])
})

// a page of videos makes one videos call, and each Resource takes its length
test("fetchVideos adds each video's length with one call", async () => {
	const fetchSpy = stubYoutubeFetch(
		Response.json({
			items: [
				{ id: "aaa", contentDetails: { duration: "PT1H2M3S" } },
				{ id: "bbb", contentDetails: { duration: "P0D" } },
			],
		}),
	)
	const { resources } = await fetchVideos("playlist", "fixture-key")
	expect(resources.map((resource) => resource.durationSeconds)).toEqual([3723, null])
	expect(fetchSpy).toHaveBeenCalledTimes(2)
	expect(String(fetchSpy.mock.calls[1]?.[0])).toContain("part=contentDetails&id=aaa,bbb")

	// the key goes in a header on both calls, never in a url
	for (const [url, init] of fetchSpy.mock.calls as [string, RequestInit][]) {
		expect(url).not.toContain("fixture-key")
		expect(init.headers).toEqual({ "X-Goog-Api-Key": "fixture-key" })
	}
})

// a failed videos call costs the Scan nothing, and the error report never holds the url with its key
test("a failed videos call keeps the Resources and reports the failure", async () => {
	stubYoutubeFetch(new Response("quota", { status: 403 }))
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => undefined)
	const { resources } = await fetchVideos("playlist", "fixture-key")
	expect(resources.map((resource) => resource.url)).toEqual([
		"https://www.youtube.com/watch?v=aaa",
		"https://www.youtube.com/watch?v=bbb",
	])
	expect(reportErrorSpy).toHaveBeenCalledTimes(1)
	expect(JSON.stringify(reportErrorSpy.mock.calls)).not.toContain("fixture-key")
})

// days, hours, minutes, and seconds each count, and a live video's zero says nothing
test("toVideoDurationSeconds reads an ISO 8601 duration", () => {
	expect(toVideoDurationSeconds("PT45S")).toBe(45)
	expect(toVideoDurationSeconds("PT3M")).toBe(180)
	expect(toVideoDurationSeconds("P1DT1S")).toBe(86_401)
	expect(toVideoDurationSeconds("P0D")).toBeNull()
	expect(toVideoDurationSeconds("an hour")).toBeNull()
	expect(toVideoDurationSeconds(undefined)).toBeNull()
})
