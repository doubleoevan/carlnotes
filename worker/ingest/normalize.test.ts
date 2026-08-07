// tests for url canonicalization, title fallback, and resource kind detection
import { expect, test } from "bun:test"
import { toCanonicalUrl, toFallbackTitle, toResourceKind } from "./normalize"

// a host ignores case, so two links that differ only there are the same page
test("toCanonicalUrl lowercases the host and drops the fragment", () => {
	expect(toCanonicalUrl("https://WWW.Example.COM/Path#section")).toBe("https://www.example.com/Path")
})

// tracking parameters name a referrer, not a page, so they cannot make two urls different
test("toCanonicalUrl drops tracking parameters and orders the rest", () => {
	expect(toCanonicalUrl("https://example.com/post?utm_source=x&id=7&fbclid=abc")).toBe("https://example.com/post?id=7")
	expect(toCanonicalUrl("https://example.com/post?b=2&a=1")).toBe("https://example.com/post?a=1&b=2")
})

// a trailing slash addresses the same page, while the root path keeps its single slash
test("toCanonicalUrl strips a trailing slash without emptying the root", () => {
	expect(toCanonicalUrl("https://example.com/guide/")).toBe("https://example.com/guide")
	expect(toCanonicalUrl("https://example.com/")).toBe("https://example.com/")
})

// a YouTube handle ignores case, so two spellings of one channel are one channel
test("toCanonicalUrl folds path case only for hosts that ignore it", () => {
	expect(toCanonicalUrl("https://www.youtube.com/c/TitoTheRaccoon")).toBe(
		toCanonicalUrl("https://www.youtube.com/c/titotheraccoon"),
	)
	// a handle's tab and the @ and legacy spellings fold the same way
	expect(toCanonicalUrl("https://www.youtube.com/c/TitoTheRaccoon/Videos")).toBe(
		"https://www.youtube.com/c/titotheraccoon/videos",
	)
	expect(toCanonicalUrl("https://www.youtube.com/@TitoTheRaccoon")).toBe("https://www.youtube.com/@titotheraccoon")
	expect(toCanonicalUrl("https://www.youtube.com/AlveusSanctuary")).toBe("https://www.youtube.com/alveussanctuary")

	// everywhere else a path's case is meaningful, so two spellings stay two pages
	expect(toCanonicalUrl("https://example.com/Tito")).not.toBe(toCanonicalUrl("https://example.com/tito"))
})

// a channel id, a video id, and a youtu.be path are exact, so lowercasing one points at a page that is not there
test("toCanonicalUrl leaves youtube's exact ids alone", () => {
	expect(toCanonicalUrl("https://www.youtube.com/channel/UCcefcZRL2oaA_uBNeo5UOWg")).toBe(
		"https://www.youtube.com/channel/UCcefcZRL2oaA_uBNeo5UOWg",
	)
	expect(toCanonicalUrl("https://www.youtube.com/shorts/AbCdEfGhIjK")).toBe(
		"https://www.youtube.com/shorts/AbCdEfGhIjK",
	)
	expect(toCanonicalUrl("https://youtu.be/dQw4w9WgXcQ")).toBe("https://youtu.be/dQw4w9WgXcQ")
})

// a url that cannot be parsed still has to come back, since a wrong dedupe key is worse than none
test("toCanonicalUrl returns an unparseable url untouched", () => {
	expect(toCanonicalUrl("not a url")).toBe("not a url")
})

// a provider that returns an empty title leaves the row printing its host, so the snippet's first line stands in
test("toFallbackTitle reads the snippet's first line", () => {
	expect(toFallbackTitle("https://www.youtube.com/c/tito", "Tito The Raccoon - YouTube\n\nmore text")).toBe(
		"Tito The Raccoon - YouTube",
	)
})

// with no snippet, the url's own last path segment names the page
test("toFallbackTitle falls back to the url's last path segment", () => {
	expect(toFallbackTitle("https://example.com/blog/raccoon-care-guide", null)).toBe("raccoon care guide")
	expect(toFallbackTitle("https://example.com/docs/manual.pdf", "")).toBe("manual")
})

// a url with nothing but a host has no segment to read, so there is no title to derive
test("toFallbackTitle gives up on a bare host", () => {
	expect(toFallbackTitle("https://example.com/", null)).toBeNull()
})

// a snippet often opens with body text, a rule, or a stray number, so a line has to read like a name first
test("toFallbackTitle skips lines that are not titles", () => {
	// a Markdown rule and a bare year are fragments, so the real heading below them wins
	expect(toFallbackTitle("https://example.com/x", "---\n2001\n# Raising a Baby Raccoon")).toBe("Raising a Baby Raccoon")

	// an opening paragraph runs past a title's length, so the url's own segment stands in instead
	const paragraph = "Contemporary evaluation techniques are inadequate for agentic systems. ".repeat(4)
	expect(toFallbackTitle("https://example.com/blog/agent-evals", paragraph)).toBe("agent evals")
})

// a link's kind is inferred from its host
test("toResourceKind reads a url's kind off its host", () => {
	expect(toResourceKind("https://www.youtube.com/watch?v=abc")).toBe("watch")
	expect(toResourceKind("https://youtu.be/abc")).toBe("watch")
	expect(toResourceKind("https://m.youtube.com/watch?v=abc")).toBe("watch")
	expect(toResourceKind("https://podcasts.apple.com/us/podcast/x")).toBe("listen")

	// anything unrecognized, and anything unparseable, reads as an article
	expect(toResourceKind("https://hamel.dev/blog/judge-bias")).toBe("read")
	expect(toResourceKind("not a url")).toBe("read")
	expect(toResourceKind("https://notyoutube.com/watch")).toBe("read")
})
