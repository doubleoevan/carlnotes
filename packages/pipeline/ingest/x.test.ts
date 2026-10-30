// X test cases over the pure functions
import { expect, test } from "bun:test"
import { DAY_MS } from "@carlnotes/contracts/time"
import { X_COST_MINIMUM_PER_REQUEST, X_COST_PER_READ } from "@carlnotes/models/budget"
import { mergeSearchResponses, toBoundedQuery, toRequestCost, toResources, toSnippet, toSourceHandle } from "./x"

// a response of the given size, each tweet distinct, so nothing dedupes away
function toResponse(
	tweetCount: number,
	idPrefix: string,
): { tweets: { id: string; text: string; author: { userName: string } }[] } {
	const tweets = Array.from({ length: tweetCount }, (_unused, index) => ({
		id: `${idPrefix}${index}`,
		text: "tweet",
		author: { userName: "someone" },
	}))
	return { tweets }
}

// two distinct tweets plus a third repeating the first id, to exercise in-response dedupe
const TWEETS = [
	{ id: "1", text: "first tweet", author: { userName: "Sama" } },
	{ id: "2", text: "  ", author: { userName: "karpathy" } },
	{ id: "1", text: "dupe", author: { userName: "Sama" } },
]

// each tweet becomes one "read" Resource keyed by a url built from the handle and the id, deduped within the response
test(`toResources maps tweets to deduped "read" Resources`, () => {
	const resources = toResources({ tweets: TWEETS })
	expect(resources.map((resource) => resource.url)).toEqual([
		"https://x.com/Sama/status/1",
		"https://x.com/karpathy/status/2",
	])

	// every Resource is a "read" kind, and the title names the author
	expect(resources.every((resource) => resource.kind === "read")).toBe(true)
	expect(resources[0]?.title).toBe("@Sama on X")

	// the native snippet is the tweet text, and a tweet with only whitespace leaves the snippet null
	expect(resources[0]?.snippet).toBe("first tweet")
	expect(resources[1]?.snippet).toBeNull()
})

// a tweet with no id or no author handle has no url to key on, so it is skipped instead of stored under a broken url
test("toResources skips a tweet missing its id or its author handle", () => {
	const resources = toResources({
		tweets: [
			{ text: "no id", author: { userName: "sama" } },
			{ id: "3", text: "no author" },
		],
	})
	expect(resources).toEqual([])
})

// a tweet by an account X marks possibly sensitive never becomes a Resource, and an unmarked account's tweet does
test("toResources skips a tweet by a possibly sensitive account", () => {
	const resources = toResources({
		tweets: [
			{ id: "4", text: "marked", author: { userName: "marked", possiblySensitive: true } },
			{ id: "5", text: "unmarked", author: { userName: "unmarked", possiblySensitive: false } },
		],
	})
	expect(resources.map((resource) => resource.url)).toEqual(["https://x.com/unmarked/status/5"])
})

// the handle goes straight into a query operator, so anything X would not resolve is rejected instead of sent
test("toSourceHandle takes a writable handle and rejects the rest", () => {
	expect(toSourceHandle({ handle: "sama" })).toBe("sama")
	expect(toSourceHandle({ handle: "  @Karpathy  " })).toBe("Karpathy")
	expect(toSourceHandle({ handle: "a_1" })).toBe("a_1")

	// too long, empty, spaced, punctuated, or absent altogether
	expect(toSourceHandle({ handle: "a".repeat(16) })).toBeNull()
	expect(toSourceHandle({ handle: "@" })).toBeNull()
	expect(toSourceHandle({ handle: "two words" })).toBeNull()
	expect(toSourceHandle({ handle: "from:sama OR x" })).toBeNull()
	expect(toSourceHandle({})).toBeNull()
	expect(toSourceHandle({ handle: 42 })).toBeNull()
})

// X rewrites every url into a t.co link, and review never fetches a tweet
test("toSnippet strips shortened links and drops a tweet that was only one", () => {
	expect(toSnippet("worth reading https://t.co/8B2G4GhOqU")).toBe("worth reading")
	expect(toSnippet("https://t.co/8B2G4GhOqU")).toBeNull()
	expect(toSnippet("https://t.co/aaa https://t.co/bbb")).toBeNull()
	expect(toSnippet("  ")).toBeNull()
	expect(toSnippet(undefined)).toBeNull()

	// a link that is not the shortener is part of what the tweet said, so it stays
	expect(toSnippet("see https://example.com/post")).toBe("see https://example.com/post")
})

// the caller owns the retweet and recency filters, so they are appended whatever the model wrote
test("toBoundedQuery appends the retweet and recency filters", () => {
	// a fixed clock keeps the expected since_time stable
	const nowMs = 1_770_000_000_000
	const boundedQuery = toBoundedQuery("agents min_faves:5", nowMs)
	expect(boundedQuery).toBe("agents min_faves:5 -filter:retweets since_time:1769395200")

	// the window looks back exactly seven days
	const sinceSeconds = Number(boundedQuery.split("since_time:")[1])
	expect(nowMs / 1000 - sinceSeconds).toBe((7 * DAY_MS) / 1000)
})

// the cost is the per-tweet rate on what came back, so a scan reports what it really spent
test("toRequestCost bills the reads a response returned", () => {
	const tweets = Array.from({ length: 20 }, (_unused, index) => ({ id: String(index), author: { userName: "a" } }))
	expect(toRequestCost({ tweets })).toBeCloseTo(20 * X_COST_PER_READ, 10)
})

// an empty response still cost a request, so it reports the provider's minimum instead of zero
test("toRequestCost floors an empty response at the per-request minimum", () => {
	expect(toRequestCost({ tweets: [] })).toBe(X_COST_MINIMUM_PER_REQUEST)
})

// a tweet two queries both matched is one Resource, and each response still bills its own reads
test("mergeSearchResponses dedupes across responses and sums their cost", () => {
	const { resources, costDollars } = mergeSearchResponses([toResponse(3, "a"), toResponse(3, "a")])
	expect(resources).toHaveLength(3)
	expect(costDollars).toBeCloseTo(6 * X_COST_PER_READ, 10)
})
