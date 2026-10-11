// fetch tests for the content ttl, the tweet whose snippet is whole, the fields a fetch writes, and the page title
import { expect, test } from "bun:test"
import { isContentStale } from "../scrape"
import { isSnippetComplete, toFetchedContentFields, toPageTitleField } from "./fetch"

// isContentStale sends stored content back for revalidation once it reaches the ttl window
test("isContentStale gates on the ttl window", () => {
	const now = new Date("2026-07-24T12:00:00Z")
	// an hour old is still reusable under a one-day ttl, two days old is stale, and the exact ttl boundary is stale
	expect(isContentStale(new Date("2026-07-24T11:00:00Z"), now, 86_400_000)).toBe(false)
	expect(isContentStale(new Date("2026-07-22T12:00:00Z"), now, 86_400_000)).toBe(true)
	expect(isContentStale(new Date("2026-07-23T12:00:00Z"), now, 86_400_000)).toBe(true)
})

// a tweet arrives with its entire text, so scoring it must never pay for a fetch that x.com would reject anyway
test("isSnippetComplete skips the fetch for a tweet and for nothing else", () => {
	expect(isSnippetComplete("https://x.com/sama/status/123")).toBe(true)

	// every other host still fetches, including one that merely ends in the same letters
	expect(isSnippetComplete("https://example.com/post")).toBe(false)
	expect(isSnippetComplete("https://notx.com/sama/status/123")).toBe(false)
	expect(isSnippetComplete("https://www.reddit.com/r/x/comments/a/first/")).toBe(false)
})

// an empty scrape and a failed object-storage write both leave no key, so the snippet becomes the text to score
test("toFetchedContentFields keeps the key and scores content when stored, otherwise falls back to the snippet", () => {
	// a successful store keeps the key and size and scores the in-memory content
	expect(toFetchedContentFields({ contentKey: "resources/r1/content.md", bytes: 12 }, "body", "snip")).toEqual({
		scoringText: "body",
		contentKey: "resources/r1/content.md",
		contentBytes: 12,
	})
	// a failed or skipped store keeps no key and scores the snippet, or leaves the content empty if there is no snippet
	expect(toFetchedContentFields(null, "body", "snip")).toEqual({
		scoringText: "snip",
		contentKey: null,
		contentBytes: null,
	})
	expect(toFetchedContentFields(null, "body", null)).toEqual({ scoringText: "", contentKey: null, contentBytes: null })
})

// the page's own title replaces a title that came from the url, and leaves every other title alone
test("toPageTitleField writes the page title only over a title from the url", () => {
	const urlFallbackResource = { title: "agent evals", url: "https://example.com/blog/agent-evals" }
	expect(toPageTitleField(urlFallbackResource, "Agent Evals Are Hard")).toEqual({ title: "Agent Evals Are Hard" })

	// a title that already names the page is kept, since a page's own title is often its site's name
	const alreadyNamedResource = { title: "Why agent evals are hard", url: "https://example.com/blog/agent-evals" }
	expect(toPageTitleField(alreadyNamedResource, "Example Blog")).toEqual({})

	// a fetch that read no page names no title, so the stored one stands
	expect(toPageTitleField(urlFallbackResource, null)).toEqual({})
})
