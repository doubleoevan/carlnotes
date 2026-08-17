// the bluesky ingester's parsing, driven by fixture posts shaped like getAuthorFeed's own responses
import { expect, test } from "bun:test"
import { parseLinks, toBackoffMs } from "./bluesky"

// a post that links to an article, one that links to the same article again, one with an image alongside its link,
// one that links to a video, one that links back into bluesky, and one that links nowhere
const posts = [
	{
		author: { handle: "theverge.com" },
		embed: {
			external: {
				uri: "https://www.theverge.com/a",
				title: "Disney Plus tries AI search",
				description: "Also an ESPN chatbot.",
			},
		},
		likeCount: 12,
	},
	{
		author: { handle: "theverge.com" },
		embed: { external: { uri: "https://www.theverge.com/a", title: "Disney Plus tries AI search" } },
		likeCount: 3,
	},
	{
		author: { handle: "theverge.com" },
		embed: { media: { external: { uri: "https://www.theverge.com/b", title: "The best instant cameras" } } },
		likeCount: 7,
	},
	{
		author: { handle: "theverge.com" },
		embed: { external: { uri: "https://www.youtube.com/watch?v=abc", title: "Hands on" } },
		likeCount: 4,
	},
	{
		author: { handle: "theverge.com" },
		embed: { external: { uri: "https://bsky.app/profile/someone" } },
		likeCount: 9,
	},
	{ author: { handle: "theverge.com" }, likeCount: 40 },
]

test("parseLinks returns the linked article instead of the post", () => {
	const resources = parseLinks(posts)
	const [article] = resources

	// the link card's metadata
	expect(article?.url).toBe("https://www.theverge.com/a")
	expect(article?.title).toBe("Disney Plus tries AI search")
	expect(article?.snippet).toBe("Also an ESPN chatbot.")
	expect(article?.kind).toBe("read")

	// the sharing post's likes are used as the article's engagement, and the fetch fills content later
	expect(article?.engagement).toBe(12)
	expect(article?.contentHash).toBeNull()
})

test("parseLinks reads a link nested under media and types a video by its host", () => {
	const resources = parseLinks(posts)

	// a post with its own image nests the link card under media, and it still counts
	expect(resources.map((resource) => resource.url)).toContain("https://www.theverge.com/b")

	// the resource kind is based on the host, so a video an account links to is saved as "watch"
	const video = resources.find((resource) => resource.url.includes("youtube.com"))
	expect(video?.kind).toBe("watch")
})

test("parseLinks skips posts that link nowhere or back into bluesky, and dedupes the rest", () => {
	const resources = parseLinks(posts)

	// the linkless post and the bluesky link are both dropped, and the repeated article collapses to one
	expect(resources).toHaveLength(3)
	expect(resources.some((resource) => resource.url.includes("bsky.app"))).toBe(false)

	// the first sighting of an article wins, so its engagement is the one that gets saved
	expect(resources[0]?.engagement).toBe(12)
})

test("toBackoffMs prefers the reset time, falls back to retry-after, and caps the wait", () => {
	// a reset two seconds out is honored as an interval instead of as a timestamp
	const resetAt = Math.floor((Date.now() + 2_000) / 1000)
	expect(toBackoffMs(new Headers({ "ratelimit-reset": String(resetAt) }))).toBeGreaterThan(500)

	// retry-after counts seconds from now, and a response naming neither waits the default
	expect(toBackoffMs(new Headers({ "retry-after": "3" }))).toBe(3_000)
	expect(toBackoffMs(new Headers())).toBe(5_000)

	// a header naming next week is capped, so it cannot pause a Scan
	expect(toBackoffMs(new Headers({ "retry-after": "999999" }))).toBe(30_000)
})
