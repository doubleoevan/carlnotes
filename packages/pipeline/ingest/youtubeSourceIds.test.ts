// toYoutubeSourceId and toResolvedYoutubeSourceConfig tests. every form a YouTube Source is written in resolves to the
// id its ingester reads
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import {
	playlistIdFromUrl,
	toAtomUrl,
	toResolvedYoutubeSourceConfig,
	toYoutubeSourceId,
	YoutubeUnavailableError,
} from "./youtubeSourceIds"

// put the fetch back after each test
afterEach(() => {
	mock.restore()
})

// a YouTube channel id, and the YouTube channel page that names it in its canonical link
const YOUTUBE_CHANNEL_ID = "UCHnyfMqiRRG1u-2MsSQLbXA"
const YOUTUBE_CHANNEL_PAGE = `<html><head><link rel="canonical" href="https://www.youtube.com/channel/${YOUTUBE_CHANNEL_ID}"></head></html>`

// respond to every YouTube channel page with the canonical link, and return the spy so a test can read the urls asked
// for
function stubYoutubeChannelPage(): ReturnType<typeof spyOn> {
	return spyOn(globalThis, "fetch").mockImplementation(
		(async () => new Response(YOUTUBE_CHANNEL_PAGE)) as unknown as typeof fetch,
	)
}

// playlistIdFromUrl self-check. YouTube /playlist urls yield the playlist id. everything else yields null
test("playlistIdFromUrl extracts the id from playlist urls and rejects the rest", () => {
	// the /playlist page on any accepted YouTube host, with or without extra params, yields the playlist id
	expect(playlistIdFromUrl("https://www.youtube.com/playlist?list=PL123")).toBe("PL123")
	expect(playlistIdFromUrl("https://youtube.com/playlist?list=PL123")).toBe("PL123")
	expect(playlistIdFromUrl("https://m.youtube.com/playlist?list=PL123&si=abc")).toBe("PL123")

	// a /watch url still yields null even if it has the "list" param
	expect(playlistIdFromUrl("https://www.youtube.com/watch?v=abc&list=PL123")).toBeNull()
	expect(playlistIdFromUrl("https://example.com/playlist?list=PL123")).toBeNull()
	expect(playlistIdFromUrl("https://www.youtube.com/playlist")).toBeNull()
	expect(playlistIdFromUrl("not a url")).toBeNull()
})

// a playlist the caller already identified is asked for as a playlist, whatever letters its id starts with
test("toAtomUrl names the id by what the caller says it is", () => {
	// a YouTube channel's uploads playlist starts with UU and a mix with RD, and neither is a YouTube channel feed
	expect(toAtomUrl("UUabc123", "playlist")).toBe("https://www.youtube.com/feeds/videos.xml?playlist_id=UUabc123")
	expect(toAtomUrl("RDabc123", "playlist")).toBe("https://www.youtube.com/feeds/videos.xml?playlist_id=RDabc123")
	expect(toAtomUrl("UCabc123", "channel")).toBe("https://www.youtube.com/feeds/videos.xml?channel_id=UCabc123")
})

// a caller that does not know reads the YouTube kind from the id, where only UC names a YouTube channel
test("toAtomUrl reads the kind from the id when the caller does not say", () => {
	// every playlist prefix falls to playlist, and only a UC id is read as a YouTube channel
	expect(toAtomUrl("UCabc123")).toBe("https://www.youtube.com/feeds/videos.xml?channel_id=UCabc123")
	for (const playlistId of ["PLabc123", "UUabc123", "RDabc123", "OLabc123", "LLabc123"]) {
		expect(toAtomUrl(playlistId)).toBe(`https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`)
	}
})

// a suggestion names a YouTube channel, however the model wrote it, and only an id can be fetched
test("toYoutubeSourceId reads the id out of every form that already carries one", async () => {
	// a raw YouTube channel id and every playlist prefix are already what the feed reads
	expect(await toYoutubeSourceId("UCHnyfMqiRRG1u-2MsSQLbXA")).toBe("UCHnyfMqiRRG1u-2MsSQLbXA")
	expect(await toYoutubeSourceId("PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab")).toBe("PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab")
	expect(await toYoutubeSourceId("PLcpW9GQqtxf8")).toBe("PLcpW9GQqtxf8")
	expect(await toYoutubeSourceId("  UUabc123def456ghi789jk  ")).toBe("UUabc123def456ghi789jk")

	// a YouTube channel url and a playlist url each have an id that would otherwise be thrown away for being wrapped in a
	// url
	expect(await toYoutubeSourceId("https://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA")).toBe(
		"UCHnyfMqiRRG1u-2MsSQLbXA",
	)
	expect(await toYoutubeSourceId("https://m.youtube.com/playlist?list=PLabc123")).toBe("PLabc123")
	expect(
		await toYoutubeSourceId("https://www.youtube.com/watch?v=lsbHor1FHMg&list=PLmaz6Fx9ULHqpSXpYMXE_C56yNicAbwTN"),
	).toBe("PLmaz6Fx9ULHqpSXpYMXE_C56yNicAbwTN")

	// a bare name, another host, a video, and an unparseable string all name no YouTube channel or playlist
	expect(await toYoutubeSourceId("Veritasium")).toBeNull()
	expect(await toYoutubeSourceId("https://example.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA")).toBeNull()
	expect(await toYoutubeSourceId("https://www.youtube.com/watch?v=abc123")).toBeNull()
	expect(await toYoutubeSourceId("not a url")).toBeNull()
})

// a handle, a /c/ url, and a /user/ url name no id, so each one asks its YouTube channel page
test("toYoutubeSourceId asks the YouTube channel page of a handle, a /c/ url, and a /user/ url", async () => {
	const fetchSpy = stubYoutubeChannelPage()
	expect(await toYoutubeSourceId("@veritasium")).toBe(YOUTUBE_CHANNEL_ID)
	expect(await toYoutubeSourceId("https://www.youtube.com/@veritasium/videos")).toBe(YOUTUBE_CHANNEL_ID)
	expect(await toYoutubeSourceId("https://www.youtube.com/c/veritasium")).toBe(YOUTUBE_CHANNEL_ID)
	expect(await toYoutubeSourceId("https://youtube.com/user/1veritasium/videos")).toBe(YOUTUBE_CHANNEL_ID)
	expect(fetchSpy.mock.calls.map((call: unknown[]) => String(call[0]))).toEqual([
		"https://www.youtube.com/@veritasium",
		"https://www.youtube.com/@veritasium",
		"https://www.youtube.com/c/veritasium",
		"https://www.youtube.com/user/1veritasium",
	])
})

// a YouTube channel page that is missing, or that names no YouTube channel of its own, names nothing
test("toYoutubeSourceId returns null for a YouTube channel page that names no YouTube channel", async () => {
	// a missing page
	spyOn(globalThis, "fetch").mockImplementation(
		(async () => new Response("gone", { status: 404 })) as unknown as typeof fetch,
	)
	expect(await toYoutubeSourceId("https://www.youtube.com/c/gone")).toBeNull()

	// a page with no canonical link, and a /c/ url with no name after it
	spyOn(globalThis, "fetch").mockImplementation((async () => new Response("<html></html>")) as unknown as typeof fetch)
	expect(await toYoutubeSourceId("@nobody")).toBeNull()
	expect(await toYoutubeSourceId("https://www.youtube.com/c/")).toBeNull()
})

// a rate limit, a server error, or a dropped connection is YouTube not responding, which is not a missing YouTube
// channel
test("toYoutubeSourceId throws an unavailable error if YouTube does not respond", async () => {
	spyOn(globalThis, "fetch").mockImplementation(
		(async () => new Response("busy", { status: 503 })) as unknown as typeof fetch,
	)
	await expect(toYoutubeSourceId("@veritasium")).rejects.toBeInstanceOf(YoutubeUnavailableError)
	spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("connection reset"))
	await expect(toYoutubeSourceId("@veritasium")).rejects.toBeInstanceOf(YoutubeUnavailableError)
})

// the page is read a chunk at a time, so a canonical link split across two chunks still matches
test("toYoutubeSourceId finds a canonical link split across chunks", async () => {
	// filler longer than the overlap, then the page cut in the middle of its link
	const encoder = new TextEncoder()
	const splitAt = YOUTUBE_CHANNEL_PAGE.indexOf("/channel/") + 4
	const pageChunks = ["x".repeat(5000), YOUTUBE_CHANNEL_PAGE.slice(0, splitAt), YOUTUBE_CHANNEL_PAGE.slice(splitAt)]

	// respond to the YouTube channel page as a stream of those chunks
	const pageStream = new ReadableStream({
		start(controller) {
			for (const pageChunk of pageChunks) {
				controller.enqueue(encoder.encode(pageChunk))
			}
			controller.close()
		},
	})
	spyOn(globalThis, "fetch").mockImplementation((async () => new Response(pageStream)) as unknown as typeof fetch)
	expect(await toYoutubeSourceId("@veritasium")).toBe(YOUTUBE_CHANNEL_ID)
})

// a saved value resolves to the id under the field its kind reads, and a value that was not the id names the source
test("toResolvedYoutubeSourceConfig stores the id under its kind's field", async () => {
	stubYoutubeChannelPage()

	// a handle and a /c/ url resolve to the YouTube channel, named by what was saved until a Scan stores the title
	expect(await toResolvedYoutubeSourceConfig({ channelId: "@veritasium" })).toEqual({
		channelId: YOUTUBE_CHANNEL_ID,
		name: "@veritasium",
	})
	expect(
		await toResolvedYoutubeSourceConfig({ channelId: "https://www.youtube.com/c/veritasium", name: "Kept" }),
	).toEqual({ channelId: YOUTUBE_CHANNEL_ID, name: "Kept" })

	// an id is kept as it is, and a playlist id saved as a YouTube channel moves to the playlist field
	expect(await toResolvedYoutubeSourceConfig({ channelId: YOUTUBE_CHANNEL_ID })).toEqual({
		channelId: YOUTUBE_CHANNEL_ID,
	})
	expect(await toResolvedYoutubeSourceConfig({ channelId: "UUabc123def456ghi789jk" })).toEqual({
		playlistId: "UUabc123def456ghi789jk",
	})
	expect(await toResolvedYoutubeSourceConfig({ playlistId: "https://www.youtube.com/playlist?list=PLabc123" })).toEqual(
		{
			playlistId: "PLabc123",
			name: "https://www.youtube.com/playlist?list=PLabc123",
		},
	)

	// a plain name and a config with no value name nothing
	expect(await toResolvedYoutubeSourceConfig({ channelId: "Homeboy Sandman" })).toBeNull()
	expect(await toResolvedYoutubeSourceConfig({})).toBeNull()
})
