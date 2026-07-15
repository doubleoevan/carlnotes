// parsePosts self-check: an OAuth listing maps to deduped read Resources keyed by permalink, verified offline
import { expect, test } from "bun:test"
import { parsePosts } from "./reddit"

// two distinct posts plus a third repeating the first permalink, to exercise in-payload dedupe
const CHILDREN = [
	{ data: { permalink: "/r/x/comments/a/first/", title: "First", selftext: "First self" } },
	{ data: { permalink: "/r/x/comments/b/second/", title: "Second" } },
	{ data: { permalink: "/r/x/comments/a/first/", title: "Dup" } },
]

// each post becomes one read Resource keyed by its absolute comments permalink, deduped within the payload
test("parsePosts maps reddit posts to deduped read Resources", () => {
	const resources = parsePosts({ data: { children: CHILDREN } })
	expect(resources.map((resource) => resource.url)).toEqual([
		"https://www.reddit.com/r/x/comments/a/first/",
		"https://www.reddit.com/r/x/comments/b/second/",
	])
	// every Resource is a read, and the first post's title comes through
	expect(resources.every((resource) => resource.kind === "read")).toBe(true)
	expect(resources[0]?.title).toBe("First")
	// the native snippet is the post selftext; a post without one leaves snippet null (never the title)
	expect(resources[0]?.snippet).toBe("First self")
	expect(resources[1]?.snippet).toBeNull()
})
