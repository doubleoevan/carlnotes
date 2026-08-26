// parseVideos tests. verify a playlistItems response gets mapped to deduped watch Resources
import { expect, test } from "bun:test"
import { parseVideos, playlistIdFromUrl, toAtomUrl, toYoutubeSourceId } from "./youtube"

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

	// a video missing its videoId is dropped. a well-formed sibling still gets mapped
	const resources = parseVideos({
		items: [{ snippet: { title: "Deleted" } }, { snippet: { title: "Live", resourceId: { videoId: "ccc" } } }],
	})
	expect(resources.map((resource) => resource.url)).toEqual(["https://www.youtube.com/watch?v=ccc"])
})

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
	// a channel's uploads playlist starts with UU and a mix with RD, and neither is a channel feed
	expect(toAtomUrl("UUabc123", "playlist")).toBe("https://www.youtube.com/feeds/videos.xml?playlist_id=UUabc123")
	expect(toAtomUrl("RDabc123", "playlist")).toBe("https://www.youtube.com/feeds/videos.xml?playlist_id=RDabc123")
	expect(toAtomUrl("UCabc123", "channel")).toBe("https://www.youtube.com/feeds/videos.xml?channel_id=UCabc123")
})

// a caller that does not know reads the YouTube kind from the id, where only UC names a channel
test("toAtomUrl reads the kind from the id when the caller does not say", () => {
	// every playlist prefix falls to playlist, and only a UC id is read as a channel
	expect(toAtomUrl("UCabc123")).toBe("https://www.youtube.com/feeds/videos.xml?channel_id=UCabc123")
	for (const playlistId of ["PLabc123", "UUabc123", "RDabc123", "OLabc123", "LLabc123"]) {
		expect(toAtomUrl(playlistId)).toBe(`https://www.youtube.com/feeds/videos.xml?playlist_id=${playlistId}`)
	}
})

// a suggestion names a channel, however the model wrote it, and only an id can be fetched
test("toYoutubeSourceId reads the id out of every form that already carries one", async () => {
	// a raw channel id and every playlist prefix are already what the feed reads
	expect(await toYoutubeSourceId("UCHnyfMqiRRG1u-2MsSQLbXA")).toBe("UCHnyfMqiRRG1u-2MsSQLbXA")
	expect(await toYoutubeSourceId("PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab")).toBe("PLZHQObOWTQDPD3MizzM2xVFitgF8hE_ab")
	expect(await toYoutubeSourceId("  UUabc123def456ghi789jk  ")).toBe("UUabc123def456ghi789jk")

	// a channel url and a playlist url each have an id that would otherwise be thrown away for being wrapped in a url
	expect(await toYoutubeSourceId("https://www.youtube.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA")).toBe(
		"UCHnyfMqiRRG1u-2MsSQLbXA",
	)
	expect(await toYoutubeSourceId("https://m.youtube.com/playlist?list=PLabc123")).toBe("PLabc123")

	// a bare name, another host, a video, and an unparseable string all name no channel or playlist
	expect(await toYoutubeSourceId("Veritasium")).toBeNull()
	expect(await toYoutubeSourceId("https://example.com/channel/UCHnyfMqiRRG1u-2MsSQLbXA")).toBeNull()
	expect(await toYoutubeSourceId("https://www.youtube.com/watch?v=abc123")).toBeNull()
	expect(await toYoutubeSourceId("not a url")).toBeNull()
})
