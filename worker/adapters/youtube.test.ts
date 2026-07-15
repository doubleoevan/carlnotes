// parseVideos self-check: a playlistItems response maps to deduped watch Resources, verified offline
import { expect, test } from "bun:test"
import { parseVideos, playlistIdFromUrl } from "./youtube"

// two distinct videos plus a third repeating the first videoId, to exercise in-payload dedupe
const VIDEOS = [
	{ snippet: { title: "First", description: "First desc", resourceId: { videoId: "aaa" } } },
	{ snippet: { title: "Second", resourceId: { videoId: "bbb" } } },
	{ snippet: { title: "Dup", resourceId: { videoId: "aaa" } } },
]

// each video becomes one watch Resource keyed by its watch?v= url, deduped within the payload
test("parseVideos maps youtube videos to deduped watch Resources", () => {
	const resources = parseVideos({ items: VIDEOS })
	expect(resources.map((resource) => resource.url)).toEqual([
		"https://www.youtube.com/watch?v=aaa",
		"https://www.youtube.com/watch?v=bbb",
	])
	// every Resource is a watch, and the first video's title comes through
	expect(resources.every((resource) => resource.kind === "watch")).toBe(true)
	expect(resources[0]?.title).toBe("First")
	// the native snippet is the video description; a video without one leaves snippet null (never the title)
	expect(resources[0]?.snippet).toBe("First desc")
	expect(resources[1]?.snippet).toBeNull()
})

// an incomplete payload never throws: a missing items array and videos with no videoId (deleted/private) are skipped
test("parseVideos skips a missing items array and videos with no videoId", () => {
	// no items key at all yields no Resources instead of a TypeError
	expect(parseVideos({})).toEqual([])
	// a video missing its resourceId/videoId is dropped; a well-formed sibling still maps
	const resources = parseVideos({
		items: [{ snippet: { title: "Deleted" } }, { snippet: { title: "Live", resourceId: { videoId: "ccc" } } }],
	})
	expect(resources.map((resource) => resource.url)).toEqual(["https://www.youtube.com/watch?v=ccc"])
})

// playlistIdFromUrl self-check: youtube /playlist urls yield the list id, everything else yields null
test("playlistIdFromUrl extracts the id from playlist urls and rejects the rest", () => {
	// the /playlist page on any accepted youtube host, with or without extra params, yields the list id
	expect(playlistIdFromUrl("https://www.youtube.com/playlist?list=PL123")).toBe("PL123")
	expect(playlistIdFromUrl("https://youtube.com/playlist?list=PL123")).toBe("PL123")
	expect(playlistIdFromUrl("https://m.youtube.com/playlist?list=PL123&si=abc")).toBe("PL123")
	// a watch url (even carrying list=), a non-youtube host, a /playlist with no list, and junk all yield null
	expect(playlistIdFromUrl("https://www.youtube.com/watch?v=abc&list=PL123")).toBeNull()
	expect(playlistIdFromUrl("https://example.com/playlist?list=PL123")).toBeNull()
	expect(playlistIdFromUrl("https://www.youtube.com/playlist")).toBeNull()
	expect(playlistIdFromUrl("not a url")).toBeNull()
})
