// parseVideos self-check: a playlistItems response maps to deduped watch Resources, verified offline
import { expect, test } from "bun:test"
import { parseVideos } from "./youtube"

// two distinct videos plus a third repeating the first videoId, to exercise in-payload dedupe
const VIDEOS = [
	{ snippet: { title: "First", resourceId: { videoId: "aaa" } } },
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
})
