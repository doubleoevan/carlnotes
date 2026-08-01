// parseVideos tests. verify a playlistItems response gets mapped to deduped watch Resources
import { expect, test } from "bun:test"
import { parseVideos, playlistIdFromUrl } from "./youtube"

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

// an incomplete payload never throws. a missing items array and videos with no videoId, like deleted or private ones, are skipped
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

	// a /watch url still yields null even if it carries the "list" param.
	// so do a non-YouTube host, a /playlist with no list param, and junk
	expect(playlistIdFromUrl("https://www.youtube.com/watch?v=abc&list=PL123")).toBeNull()
	expect(playlistIdFromUrl("https://example.com/playlist?list=PL123")).toBeNull()
	expect(playlistIdFromUrl("https://www.youtube.com/playlist")).toBeNull()
	expect(playlistIdFromUrl("not a url")).toBeNull()
})
