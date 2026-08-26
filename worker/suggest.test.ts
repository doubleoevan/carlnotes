// source suggestion tests that identify when two Sources have the same source key
import { expect, test } from "bun:test"
import { FeedStatusError } from "./ingest/feed"
import {
	isTemporaryFailure,
	type SuggestedSource,
	type SuggestionContext,
	toSourceKey,
	toTopicContext,
} from "./suggest"

// one proposed source, so a case names only the option and value it varies
const source = (sourceOption: SuggestedSource["sourceOption"], value: string): SuggestedSource => ({
	sourceOption,
	value,
})

// a subreddit reads the same no matter how it was written, normalized by the ingester's own rule
test("a subreddit is the same source no matter how it was written", () => {
	expect(toSourceKey(source("reddit", "r/LocalLLaMA"))).toBe(toSourceKey(source("reddit", "localllama")))
	expect(toSourceKey(source("reddit", "rust"))).not.toBe(toSourceKey(source("reddit", "golang")))
})

// a handle is a domain name, so it reads the same in any case and with or without its @
test("a bluesky account has the same source however its handle was written", () => {
	const account = toSourceKey(source("bluesky", "TheVerge.com"))
	expect(toSourceKey(source("bluesky", "@theverge.com"))).toBe(account)
	expect(toSourceKey(source("bluesky", "arstechnica.com"))).not.toBe(account)
})

// an account and a site are two different things to follow, even where the handle is the site's own domain
test("a bluesky account is not the same source as a feed on the matching domain", () => {
	expect(toSourceKey(source("bluesky", "theverge.com"))).not.toBe(
		toSourceKey(source("rss", "https://theverge.com/rss")),
	)
})

// a name the ingester would reject still keys to itself, so it dedupes normally before it is dropped as unreadable
test("a subreddit name reddit would not accept still keys to itself", () => {
	expect(toSourceKey(source("reddit", "not a subreddit"))).toBe(toSourceKey(source("reddit", "NOT A SUBREDDIT")))
	expect(toSourceKey(source("reddit", "not a subreddit"))).not.toBe(toSourceKey(source("reddit", "mcp")))
})

// a handle reads the same, however, it was written, so a topic already following an account is not suggested again
test("an x handle is the same source however it was written", () => {
	expect(toSourceKey(source("x", "@Sama"))).toBe(toSourceKey(source("x", "sama")))
	expect(toSourceKey(source("x", "openai"))).not.toBe(toSourceKey(source("x", "anthropic")))
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

// a feed and a page at one address are different sources, one per ingester
test("the source option is part of the source key identifier", () => {
	expect(toSourceKey(source("url", "https://a.test/feed"))).not.toBe(toSourceKey(source("rss", "https://a.test/feed")))
})

// a Google News source covers one publisher, so it is the same source as that publisher's own feed
test("a Google News source is the same source as the publisher it covers", () => {
	const publisherFeed = toSourceKey(source("rss", "https://techcrunch.com/feed/"))
	expect(toSourceKey(source("googleNews", "techcrunch.com"))).toBe(publisherFeed)
	expect(toSourceKey(source("googleNews", "https://www.TechCrunch.com/2026/01/02/an-article"))).toBe(publisherFeed)
	expect(toSourceKey(source("googleNews", "theverge.com"))).not.toBe(publisherFeed)
})

// a YouTube id is exact, and a channel and a playlist are differentiated by the id itself
test("a youtube source is the same only at the same id", () => {
	expect(toSourceKey(source("youtube", "UCabc"))).toBe(toSourceKey(source("youtube", "UCabc")))
	expect(toSourceKey(source("youtube", "UCabc"))).not.toBe(toSourceKey(source("youtube", "PLabc")))
})

// a podcast keys by name until iTunes resolves it, and by its exact id after
test("a podcast is the same source at the same name or the same id", () => {
	expect(toSourceKey(source("podcast", "Hard Fork"))).toBe(toSourceKey(source("podcast", " hard fork ")))
	expect(toSourceKey(source("podcast", "1528594034"))).toBe(toSourceKey(source("podcast", "1528594034")))

	// a name and the id it resolves to are different keys, which is why a resolved suggestion is deduped a second time
	expect(toSourceKey(source("podcast", "Hard Fork"))).not.toBe(toSourceKey(source("podcast", "1528594034")))
})

// a podcast named by a show is a different source from a feed url, one per ingester
test("a podcast is not keyed as a feed", () => {
	expect(toSourceKey(source("podcast", "Hard Fork"))).not.toBe(toSourceKey(source("rss", "Hard Fork")))
})

// an unparseable value still keys to something, so a malformed namedSource source is compared instead of crashing
test("a value that is not a url still keys to itself", () => {
	expect(toSourceKey(source("rss", "not a url"))).toBe("rss:not a url")
})

// reddit returns 403 to a blocked IP range and 404 to a subreddit that is not there
test("a reddit suggestion survives a blocked host but not a missing subreddit", () => {
	expect(isTemporaryFailure(new FeedStatusError("https://www.reddit.com/r/mcp/.rss", 403), "reddit")).toBe(true)
	expect(isTemporaryFailure(new FeedStatusError("https://www.reddit.com/r/nope/.rss", 404), "reddit")).toBe(false)
})

// every other source kind reads 403 as the host to show that the source is not readable
test("a 403 drops a suggestion for any other source kind", () => {
	expect(isTemporaryFailure(new FeedStatusError("https://a.test/feed", 403), "rss")).toBe(false)
	expect(isTemporaryFailure(new FeedStatusError("https://a.test/page", 403), "url")).toBe(false)
})

// a throttled or broken host is never returned as "no such source", whatever the source kind
test("a rate limit or a server error keeps a suggestion of any kind", () => {
	expect(isTemporaryFailure(new FeedStatusError("https://a.test/feed", 429), "rss")).toBe(true)
	expect(isTemporaryFailure(new FeedStatusError("https://a.test/feed", 503), "rss")).toBe(true)
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

// a long attachment cannot inflate the prompt. the context stays clipped
test("the topic context stays clipped whatever the attachment includes", () => {
	const topicContext = toTopicContext(toSuggestionContext({ attachmentContext: "a".repeat(10_000) }))
	expect(topicContext.length).toBe(4000)
	expect(topicContext.startsWith("Title: Raccoons")).toBe(true)
})
