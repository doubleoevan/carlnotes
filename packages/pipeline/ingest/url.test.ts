// url ingester tests: what one url Source contributes
import { expect, test } from "bun:test"
import type { Source } from "./ingester"
import { MAX_RESULTS, type PageBody, toPageLinks, toUrlSourceResources, urlIngester } from "./url"

const PAGE_URL = "https://news.example.com/front"

// a page body as the ingester hands it to the mapper, defaulting to a scrape that succeeded
function pageBody(markdown: string, fetchedBody?: PageBody["fetchedBody"]): PageBody {
	return { markdown, costDollars: 0, fetchedBody }
}

// a url Source's worth is the material its page indexes, not the index itself
test("a url Source finds its page and the links the page lists", () => {
	const markdown = "Today: [Async runtimes](https://a.com/async) and [A talk](https://www.youtube.com/watch?v=abc)."
	const resources = toUrlSourceResources(PAGE_URL, pageBody(markdown))

	// the page leads, then one Resource per link in document order
	expect(resources.map((resource) => resource.url)).toEqual([
		PAGE_URL,
		"https://a.com/async",
		"https://www.youtube.com/watch?v=abc",
	])
})

// the page is what the owner pointed at, and its title is the fallback rule's job
test("the page Resource is a read with no title", () => {
	const [pageResource] = toUrlSourceResources(PAGE_URL, pageBody("[One](https://a.com/1)"))
	expect(pageResource?.kind).toBe("read")
	expect(pageResource?.title).toBeUndefined()
})

// anchor text is all the embed gate has to judge a link on before anything is paid to fetch it
test("a link carries its anchor text as its snippet", () => {
	const resources = toUrlSourceResources(PAGE_URL, pageBody("[Async runtimes](https://a.com/async)"))
	expect(resources[1]?.snippet).toBe("Async runtimes")
})

// a linked video is the same Resource the youtube ingester would find, so the two collapse instead of doubling
test("a linked video is found as a watch Resource", () => {
	const resources = toUrlSourceResources(PAGE_URL, pageBody("[A talk](https://www.youtube.com/watch?v=abc)"))
	expect(resources[1]?.kind).toBe("watch")
	expect(resources[1]?.url).toBe("https://www.youtube.com/watch?v=abc")
})

// only the page was fetched, so only the page can hand a body over to be stored
test("only the page carries the fetched body", () => {
	const fetchedBody = { markdown: "# Front", etag: null, lastModified: null }
	const resources = toUrlSourceResources(PAGE_URL, pageBody("[One](https://a.com/1)", fetchedBody))
	expect(resources[0]?.fetchedBody).toEqual(fetchedBody)
	expect(resources[1]?.fetchedBody).toBeUndefined()
})

// a page that could not be read still reaches review, which fetches it the way it always has
test("a body that could not be read still finds the page alone", () => {
	const resources = toUrlSourceResources(PAGE_URL, pageBody(""))
	expect(resources).toEqual([{ url: PAGE_URL, kind: "read", fetchedBody: undefined }])
})

// a Source the ingester reads only two fields from, so a case names those two and leaves the row's rest out
const toUrlSource = (config: Record<string, unknown>): Source => ({ id: "src_1", config }) as Source

// a Source with no url is misconfigured, and the Scan isolates the failure instead of scanning nothing
test("a Source with no string config.url throws an error", async () => {
	await expect(urlIngester(toUrlSource({}))).rejects.toThrow("no string config.url")
})

// an internal url is rejected before anything fetches it
test("an internal url is rejected", async () => {
	const source = toUrlSource({ url: "http://169.254.169.254/latest/meta-data" })
	await expect(urlIngester(source)).rejects.toThrow("is an internal address")
})

// a page is not trusted to name only public addresses. every link it lists becomes a Resource that review fetches later
test("links pointing at an internal address are dropped", () => {
	const markdown = [
		"[Metadata](http://169.254.169.254/latest/meta-data)",
		"[Admin](http://localhost:8080/admin)",
		"[Intranet](https://wiki.internal/page)",
		"[Real](https://a.com/post)",
	].join(" ")
	expect(toPageLinks(markdown, PAGE_URL)).toEqual([{ url: "https://a.com/post", anchorText: "Real" }])
})

// an index page's worth is the links it lists, each with the words it was written as
test("a page's links come back in document order with their anchor text", () => {
	const markdown = "Read [Async runtimes](https://a.com/async) then [Judging models](https://b.com/judge)."
	expect(toPageLinks(markdown, PAGE_URL)).toEqual([
		{ url: "https://a.com/async", anchorText: "Async runtimes" },
		{ url: "https://b.com/judge", anchorText: "Judging models" },
	])
})

// a relative target names a page on the same site, which is the whole point of an index like github.com/trending
test("a relative link resolves against the page that wrote it", () => {
	const links = toPageLinks("[Trending](/owner/repo)", "https://github.com/trending")
	expect(links).toEqual([{ url: "https://github.com/owner/repo", anchorText: "Trending" }])
})

// a link with no words still points somewhere, so it is judged on its url instead of dropped
test("a link with no anchor text is kept with a null anchor", () => {
	expect(toPageLinks("[](https://a.com/bare)", PAGE_URL)).toEqual([{ url: "https://a.com/bare", anchorText: null }])
})

// none of these addresses a page worth fetching, so none becomes a Resource
test("fragments, non-http schemes, and the page's own url are dropped", () => {
	const markdown = [
		"[Top](#top)",
		"[Mail](mailto:hi@example.com)",
		"[Run](javascript:void 0)",
		"[Home](https://news.example.com/front)",
		"[Real](https://a.com/real)",
	].join(" ")
	expect(toPageLinks(markdown, PAGE_URL)).toEqual([{ url: "https://a.com/real", anchorText: "Real" }])
})

// the page's own url is recognized however it was written, where canonicalization decides sameness
test("the page's own url is dropped even when it is written differently", () => {
	const markdown = "[Home](https://news.example.com/front?utm_source=x#section)"
	expect(toPageLinks(markdown, PAGE_URL)).toEqual([])
})

// two links to one page are one page, matching how the Scan dedupes everything else
test("repeated links collapse to the first one seen", () => {
	const markdown = "[First](https://a.com/x) and [Second](https://a.com/x/)"
	expect(toPageLinks(markdown, PAGE_URL)).toEqual([{ url: "https://a.com/x", anchorText: "First" }])
})

// one page cannot dominate a Scan's named source set, and what it does contribute is the top of the page
test("a page past the limit contributes exactly the limit, in document order", () => {
	const markdown = Array.from({ length: MAX_RESULTS + 10 }, (_, index) => `[L${index}](https://a.com/${index})`)
	const links = toPageLinks(markdown.join("\n"), PAGE_URL)
	expect(links).toHaveLength(MAX_RESULTS)
	expect(links[0]?.url).toBe("https://a.com/0")
	expect(links.at(-1)?.url).toBe(`https://a.com/${MAX_RESULTS - 1}`)
})

// a page with nothing to link to contributes nothing, instead of erroring
test("a page with no links contributes none", () => {
	expect(toPageLinks("Just words, no links at all.", PAGE_URL)).toEqual([])
})

// an image is a picture, not a page, so its src never becomes something to go read
test("images are not found as links", () => {
	const markdown = "![A chart](https://a.com/chart.png) then [The article](https://a.com/article)"
	expect(toPageLinks(markdown, PAGE_URL)).toEqual([{ url: "https://a.com/article", anchorText: "The article" }])
})

// a logo wrapped in a link is a link to that page, and the image inside it must not leak into the anchor text
test("a linked image finds the link, not the image", () => {
	const links = toPageLinks("[![](https://a.com/logo.svg)](https://a.com/home)", PAGE_URL)
	expect(links).toEqual([{ url: "https://a.com/home", anchorText: null }])
})

// an image with alt text inside a link leaves those words as what the user was told the link is
test("a linked image's alt text becomes the anchor text", () => {
	const links = toPageLinks("[![Rust logo](https://a.com/logo.svg)](https://a.com/rust)", PAGE_URL)
	expect(links).toEqual([{ url: "https://a.com/rust", anchorText: "Rust logo" }])
})
