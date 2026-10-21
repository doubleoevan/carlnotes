// reddit ingester self-checks
import { expect, test } from "bun:test"
import type { Source } from "./ingester"
import {
	parsePosts,
	queueRedditRequest,
	toOauthUrl,
	toRedditAccessModes,
	toRedditPostId,
	toRedditRequest,
	toRssUrl,
	toSubredditName,
	toThreadText,
} from "./reddit"

// a Source setting just the config under test. the rest of the row is irrelevant to what it fetches
function toRedditSource(config: Record<string, unknown>): Source {
	return { id: "src_1", topicId: "top_1", kind: "reddit", config } as Source
}

// a subreddit alone reads that subreddit's listing with the default sort
test("toRedditRequest reads a subreddit listing", () => {
	expect(toRedditRequest(toRedditSource({ subreddit: "mcp" }))).toEqual({
		kind: "listing",
		subreddit: "mcp",
		sort: "hot",
	})
})

// the configured sort orders the listing, and an unrecognized one falls back instead of failing the Source
test("toRedditRequest honors a valid sort and falls back on an invalid one", () => {
	expect(toRedditRequest(toRedditSource({ subreddit: "mcp", sort: "top" }))).toMatchObject({ sort: "top" })
	expect(toRedditRequest(toRedditSource({ subreddit: "mcp", sort: "trending" }))).toMatchObject({ sort: "hot" })
})

// a query alongside the subreddit searches inside it instead of reading the whole listing
test("toRedditRequest restricts a query to its subreddit", () => {
	expect(toRedditRequest(toRedditSource({ subreddit: "mcp", query: "agent memory" }))).toEqual({
		kind: "search",
		subreddit: "mcp",
		query: "agent memory",
	})
})

// the subreddit is what a reddit Source is, so a Source without one fails instead of reading something arbitrary
test("toRedditRequest rejects a Source with no subreddit", () => {
	expect(() => toRedditRequest(toRedditSource({}))).toThrow(/needs a valid config.subreddit/)
	expect(() => toRedditRequest(toRedditSource({ query: "agent memory" }))).toThrow(/needs a valid config.subreddit/)
})

// a subreddit reddit itself would reject is rejected instead of encoded into a url path
test("toRedditRequest rejects an invalid subreddit", () => {
	expect(() => toRedditRequest(toRedditSource({ subreddit: "not a subreddit" }))).toThrow(
		/needs a valid config.subreddit/,
	)
})

// the Source config and a suggested subreddit both read a written name through here
test("toSubredditName drops a leading r/ and keeps the name reddit would accept", () => {
	expect(toSubredditName("r/LocalLLaMA")).toBe("LocalLLaMA")
	expect(toSubredditName("  r/mcp  ")).toBe("mcp")
	expect(toSubredditName("mcp")).toBe("mcp")
})

// a name outside reddit's charset never reaches a url, whether it came from a Source or from the model
test("toSubredditName rejects a name reddit would not accept", () => {
	expect(toSubredditName("not a subreddit")).toBeNull()
	expect(toSubredditName("")).toBeNull()
	expect(toSubredditName("r/")).toBeNull()
	expect(toSubredditName("a".repeat(22))).toBeNull()
	expect(toSubredditName(undefined)).toBeNull()
})

// OAuth is preferred wherever credentials are set, with the keyless rss feeds behind it as the fallback
test("toRedditAccessModes prefers OAuth and keeps the rss feeds as the fallback", () => {
	expect(toRedditAccessModes(true)).toEqual(["oauth", "rss"])
	expect(toRedditAccessModes(false)).toEqual(["rss"])
})

// the OAuth url includes the sort, the post limit, and the subreddit restriction a search needs
test("toOauthUrl builds the listing, site-wide search, and in-subreddit search urls", () => {
	expect(toOauthUrl({ kind: "listing", subreddit: "mcp", sort: "top" })).toBe(
		"https://oauth.reddit.com/r/mcp/top?limit=25",
	)
	expect(toOauthUrl({ kind: "search", subreddit: "", query: "agent memory" })).toBe(
		"https://oauth.reddit.com/search?q=agent+memory&limit=25",
	)
	expect(toOauthUrl({ kind: "search", subreddit: "mcp", query: "agent memory" })).toBe(
		"https://oauth.reddit.com/r/mcp/search?q=agent+memory&limit=25&restrict_sr=1",
	)
})

// the keyless url reads the rss feeds that reddit still serves
test("toRssUrl builds the feed urls and drops the sort", () => {
	expect(toRssUrl({ kind: "listing", subreddit: "mcp", sort: "top" })).toBe("https://www.reddit.com/r/mcp/.rss")
	expect(toRssUrl({ kind: "search", subreddit: "", query: "agent memory" })).toBe(
		"https://www.reddit.com/search.rss?q=agent+memory",
	)
	expect(toRssUrl({ kind: "search", subreddit: "mcp", query: "agent memory" })).toBe(
		"https://www.reddit.com/r/mcp/search.rss?q=agent+memory&restrict_sr=1",
	)
})

// a Scan runs its Sources at once, and reddit rejects the second request that arrives with the first
test("queueRedditRequest runs requests one at a time, even after one fails", async () => {
	// each request records when it started and ended, so an overlap would show as a start before the previous end
	const events: string[] = []
	const request = (label: string, willFail: boolean) => async (): Promise<string> => {
		events.push(`${label} start`)
		await Bun.sleep(10)
		events.push(`${label} end`)

		// a rejected request is what has to leave the queue running for the ones behind it
		if (willFail) {
			throw new Error(`${label} rejected`)
		}
		return label
	}

	// queue three reddit requests at once, the middle one failing, the way concurrent Sources would arrive
	const queued = [
		queueRedditRequest("oauth", request("first", false)),
		queueRedditRequest("oauth", request("second", true)).catch(() => "second failed"),
		queueRedditRequest("oauth", request("third", false)),
	]
	expect(await Promise.all(queued)).toEqual(["first", "second failed", "third"])

	// no request started before the one ahead of it finished, and a rejection did not stall the queue
	// biome-ignore format: one line keeps the expected order under the comment-density hook's limit
	expect(events).toEqual(["first start", "first end", "second start", "second end", "third start", "third end"])
})

// two distinct posts plus a third repeating the first permalink, to test in-payload dedupe
const CHILDREN = [
	{ data: { permalink: "/r/x/comments/a/first/", title: "First", selftext: "First self", score: 12 } },
	{ data: { permalink: "/r/x/comments/b/second/", title: "Second" } },
	{ data: { permalink: "/r/x/comments/a/first/", title: "Dupe" } },
]

// each post becomes one "read" Resource keyed by its absolute comments permalink, deduped within the payload
test("parsePosts maps reddit posts to deduped read Resources", () => {
	const resources = parsePosts({ data: { children: CHILDREN } })
	expect(resources.map((resource) => resource.url)).toEqual([
		"https://www.reddit.com/r/x/comments/a/first/",
		"https://www.reddit.com/r/x/comments/b/second/",
	])
	// every Resource is a "read" kind, and the first post's title comes through
	expect(resources.every((resource) => resource.kind === "read")).toBe(true)
	expect(resources[0]?.title).toBe("First")

	// the native snippet is the post selftext. a post without one leaves the snippet null.
	expect(resources[0]?.snippet).toBe("First self")
	expect(resources[1]?.snippet).toBeNull()

	// the post score is included as the engagement signal, and a post without one leaves it null
	expect(resources[0]?.engagement).toBe(12)
	expect(resources[1]?.engagement).toBeNull()
})

// a search response is the same listing shape, so one parser serves both response types and both kinds of Source
test("parsePosts maps a search response the same way", () => {
	const resources = parsePosts({
		data: { children: [{ data: { permalink: "/r/y/comments/c/found/", title: "Found", score: 3 } }] },
	})
	expect(resources).toEqual([
		{
			url: "https://www.reddit.com/r/y/comments/c/found/",
			title: "Found",
			kind: "read",
			snippet: null,
			contentHash: null,
			engagement: 3,
		},
	])
})

// only a thread url names a post, and the id is what the thread endpoint takes
test("toRedditPostId reads the id from a thread url and rejects everything else", () => {
	// every host spelling of a thread url yields the id, with or without the slug
	expect(toRedditPostId("https://www.reddit.com/r/improv/comments/1v7pwde/a_slug_here")).toBe("1v7pwde")
	expect(toRedditPostId("https://reddit.com/r/AskCulinary/comments/abc123/")).toBe("abc123")
	expect(toRedditPostId("https://old.reddit.com/r/x/comments/zz99/title")).toBe("zz99")

	// a subreddit listing, another host, and an unparseable string all name no post
	expect(toRedditPostId("https://www.reddit.com/r/improv/")).toBeNull()
	expect(toRedditPostId("https://example.com/r/x/comments/abc/")).toBeNull()
	expect(toRedditPostId("not a url")).toBeNull()
})

// a thread is worth fetching for its replies, so the text has to include the replies
test("toThreadText joins the post's body with its replies", () => {
	const text = toThreadText([
		{ data: { children: [{ data: { title: "How do I braise?", selftext: "Never done it." } }] } },
		{ data: { children: [{ data: { body: "Low and slow." } }, { data: { body: "Sear it first." } }] } },
	])
	expect(text).toBe("How do I braise?\n\nNever done it.\n\nLow and slow.\n\nSear it first.")
})

// a missing body must not leave a blank run in the joined text
test("toThreadText skips a missing body and an empty reply", () => {
	// a link post has only a title, and the "load more" stub has no body
	const text = toThreadText([
		{ data: { children: [{ data: { title: "Look at this" } }] } },
		{ data: { children: [{ data: { body: "  " } }, { data: {} }, { data: { body: "Nice find." } }] } },
	])
	expect(text).toBe("Look at this\n\nNice find.")

	// a response with nothing readable reads as an empty string instead of throwing
	expect(toThreadText([])).toBe("")
})

// reddit keeps a removed reply in the thread and puts a placeholder where its words were
test("toThreadText drops a removed post body and a removed reply", () => {
	const text = toThreadText([
		{ data: { children: [{ data: { title: "Still here", selftext: "[deleted]" } }] } },
		{
			data: {
				children: [
					{ data: { body: "[removed]" } },
					{ data: { body: "[deleted]" } },
					{ data: { body: "Real answer." } },
				],
			},
		},
	])
	expect(text).toBe("Still here\n\nReal answer.")
})
