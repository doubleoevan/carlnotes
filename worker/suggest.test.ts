// source suggestion tests that identify when two Sources have the same source key,
// so a suggestion does not repeat what was already added
import { expect, test } from "bun:test"
import { type SuggestedSource, type SuggestionContext, toSourceKey, toTopicContext } from "./suggest"

// one proposed source, so a case names only the kind and value it varies
const source = (sourceKind: SuggestedSource["sourceKind"], value: string): SuggestedSource => ({ sourceKind, value })

// a subreddit reads the same no matter how it was written
test("a subreddit is the same source no matter how it was written", () => {
	expect(toSourceKey(source("reddit", "r/LocalLLaMA"))).toBe(toSourceKey(source("reddit", "localllama")))
	expect(toSourceKey(source("reddit", "rust"))).not.toBe(toSourceKey(source("reddit", "golang")))
})

// one publication is one source, so a topic already following a site is not suggested its other feed
test("an rss feed is the same source as another feed on the same host", () => {
	const blogFeed = toSourceKey(source("rss", "https://simonwillison.net/atom/everything/"))
	expect(toSourceKey(source("rss", "https://simonwillison.net/atom/links/"))).toBe(blogFeed)
	expect(toSourceKey(source("rss", "https://www.simonwillison.net/atom/everything/"))).toBe(blogFeed)
	expect(toSourceKey(source("rss", "https://other.test/feed"))).not.toBe(blogFeed)
})

// two pages on one site are two sources
test("a url is the same source only at the same address", () => {
	const trending = toSourceKey(source("url", "https://github.com/trending"))
	expect(toSourceKey(source("url", "https://github.com/trending?utm_source=x"))).toBe(trending)
	expect(toSourceKey(source("url", "https://github.com/explore"))).not.toBe(trending)
})

// a feed and a page at one address are different sources, since a different ingester reads each
test("the source kind is part of the source key identifier", () => {
	expect(toSourceKey(source("url", "https://a.test/feed"))).not.toBe(toSourceKey(source("rss", "https://a.test/feed")))
})

// the built-in web search is always the same key, so only one web search can ever be added
test("the built-in web search is one source", () => {
	expect(toSourceKey(source("search", ""))).toBe(toSourceKey(source("search", "anything")))
})

// a YouTube id is exact, since a channel and a playlist differentiated by the id itself
test("a youtube source is the same only at the same id", () => {
	expect(toSourceKey(source("youtube", "UCabc"))).toBe(toSourceKey(source("youtube", "UCabc")))
	expect(toSourceKey(source("youtube", "UCabc"))).not.toBe(toSourceKey(source("youtube", "PLabc")))
})

// an unparseable value still keys to something, so a malformed candidate source is compared instead of crashing
test("a value that is not a url still keys to itself", () => {
	expect(toSourceKey(source("rss", "not a url"))).toBe("rss:not a url")
})

// a suggestion context holding only what the context reads, for test cases to override
function toSuggestionContext(overrides: Partial<SuggestionContext>): SuggestionContext {
	return {
		name: "Raccoons",
		prompt: "care and feeding",
		attachmentContext: "",
		excludeSources: [],
		limit: 3,
		...overrides,
	}
}

// what the owner attached says as much about the topic as the prompt, so the model reads both
test("the topic context includes the attachment context when there is one", () => {
	// with nothing attached, the context is the title and prompt alone, with no empty attachment heading
	expect(toTopicContext(toSuggestionContext({}))).toBe(
		"Title: Raccoons\n\nWhat the reader is looking for:\ncare and feeding",
	)

	// an attached context is labeled so the model can tell it was the user's own words
	expect(toTopicContext(toSuggestionContext({ attachmentContext: "they like grapes" }))).toContain(
		"From the reader's attachments:\nthey like grapes",
	)
})

// a long attachment cannot inflate the prompt, since the context stays clipped
test("the topic context stays clipped whatever the attachment includes", () => {
	const topicContext = toTopicContext(toSuggestionContext({ attachmentContext: "a".repeat(10_000) }))
	expect(topicContext.length).toBe(4000)
	expect(topicContext.startsWith("Title: Raccoons")).toBe(true)
})
