// the images a page's Markdown shows: an article's own images are kept in order, and a linked image, a rejected name,
// and a url that is not http are left out
import { expect, test } from "bun:test"
import { isRejectedImageUrl, toResourceImageCandidateUrls } from "./resourceImageCandidates"

// the page every test reads
const PAGE_URL = "https://news.example.com/articles/warriors-rumors"

// an article's own two photos, an author's linked avatar, and a related story's linked photo, as Firecrawl writes them
const ARTICLE_MARKDOWN = [
	"![Video thumbnail](https://cdn.example.com/lead.png?w=2560)",
	"",
	"![Denver Nuggets v Phoenix Suns](https://cdn.example.com/getty/2303176046.jpg?w=2560)",
	"",
	"# New Warriors Rumors",
	"",
	"[![](https://cdn.example.com/writers/zach.jpg)\\\\",
	"Zach Bachar](https://news.example.com/writers/zach-bachar)",
	"",
	"The Warriors are keeping their options open.",
	"",
	"## TOP NEWS",
	"",
	"[![Play-In Tournament](https://cdn.example.com/getty/2271000740.jpg?w=2560)\\\\",
	"\\\\",
	"**Warriors Determined To Trade KP** \\\\",
	"\\\\",
	"Bleacher Report2d](https://news.example.com/articles/25530893-trade-rumors)",
].join("\n")

test("an article's own images are kept in the page's order", () => {
	expect(toResourceImageCandidateUrls(ARTICLE_MARKDOWN, PAGE_URL)).toEqual([
		"https://cdn.example.com/lead.png?w=2560",
		"https://cdn.example.com/getty/2303176046.jpg?w=2560",
	])
})

test("a related story's linked image and an author's linked avatar are left out", () => {
	const candidateUrls = toResourceImageCandidateUrls(ARTICLE_MARKDOWN, PAGE_URL)
	expect(candidateUrls).not.toContain("https://cdn.example.com/getty/2271000740.jpg?w=2560")
	expect(candidateUrls).not.toContain("https://cdn.example.com/writers/zach.jpg")
})

test("an image after a link is still the page's own", () => {
	const markdown = "[Read more](https://news.example.com/more) ![A chart](https://cdn.example.com/chart.png)"
	expect(toResourceImageCandidateUrls(markdown, PAGE_URL)).toEqual(["https://cdn.example.com/chart.png"])
})

test("an image inside a reference link is left out", () => {
	const markdown = "[![A teaser](https://cdn.example.com/teaser.jpg)][story]\n\n[story]: https://news.example.com/s"
	expect(toResourceImageCandidateUrls(markdown, PAGE_URL)).toEqual([])
})

test("a relative url is resolved against its page, and a repeated image is listed once", () => {
	const markdown = "![One](/uploads/one.jpg)\n\n![One again](/uploads/one.jpg)\n\n![Two](../two.jpg 'A title')"
	expect(toResourceImageCandidateUrls(markdown, PAGE_URL)).toEqual([
		"https://news.example.com/uploads/one.jpg",
		"https://news.example.com/two.jpg",
	])
})

test("a url that is not http or https is left out", () => {
	const markdown = "![Inline](data:image/png;base64,AAAA)\n\n![Local](file:///etc/passwd)"
	expect(toResourceImageCandidateUrls(markdown, PAGE_URL)).toEqual([])
})

test("an image whose url names a logo, an emoji, a badge, or a tracking pixel is left out", () => {
	const markdown = [
		"![tag](https://static.example.com/company_logos/anthropic.png)",
		"![Love](https://c.example.com/assets/img/emoji/love-512x512.png)",
		"![](https://www.example.com/_next/static/media/aced_badge.83568741.svg)",
		"![](https://live.example.com/pixel.gif?c=4656)",
		"![A photo](https://cdn.example.com/photo.jpg)",
	].join("\n\n")
	expect(toResourceImageCandidateUrls(markdown, PAGE_URL)).toEqual(["https://cdn.example.com/photo.jpg"])
})

test("a rejected word inside a longer word is not a rejected name", () => {
	expect(isRejectedImageUrl("https://cdn.example.com/silicon-valley.jpg")).toBe(false)
	expect(isRejectedImageUrl("https://cdn.example.com/google-pixel-9-review.jpg")).toBe(false)
	expect(isRejectedImageUrl("https://cdn.example.com/site-logo.png")).toBe(true)
	expect(isRejectedImageUrl("https://secure.gravatar.com/avatar/0f6b?s=71")).toBe(true)
})

test("an advert's url is left out in each of its word forms", () => {
	expect(isRejectedImageUrl("https://cdn.example.com/adverts/hero.jpg")).toBe(true)
	expect(isRejectedImageUrl("https://cdn.example.com/advertisement/hero.jpg")).toBe(true)
	expect(isRejectedImageUrl("https://cdn.example.com/advertising/hero.jpg")).toBe(true)
})

test("a page of unclosed images is read quickly and shows none", () => {
	const startMs = performance.now()
	expect(toResourceImageCandidateUrls("![](".repeat(60_000), PAGE_URL)).toEqual([])
	expect(performance.now() - startMs).toBeLessThan(5_000)
})

test("a page of many images lists the first 24, and an image far down a very long page is never read", () => {
	const manyImages = Array.from({ length: 40 }, (_, i) => `![](https://cdn.example.com/photo-${i}.jpg)`)
	const candidateUrls = toResourceImageCandidateUrls(manyImages.join("\n\n"), PAGE_URL)
	expect(candidateUrls).toHaveLength(24)
	expect(candidateUrls[23]).toBe("https://cdn.example.com/photo-23.jpg")

	// only the first 200,000 characters are read
	const longPage = `${"word ".repeat(40_000)}![](https://cdn.example.com/late.jpg)`
	expect(toResourceImageCandidateUrls(longPage, PAGE_URL)).toEqual([])
})
