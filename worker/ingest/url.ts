// the url ingester. returns its own page content plus the page content from its links
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { resources } from "../../db/schema"
import { FIRECRAWL_COST_PER_FETCH } from "../budget"
import { CONTENT_TTL_MS, fetchContent, isContentStale, toFetchableUrl } from "../scrape"
import { getResourceContent } from "../store"
import type { FetchedBody, IngestedResource, IngestResult, Source, SourceIngester } from "./ingester"
import { toCanonicalUrl, toResourceKind } from "./normalize"

// how many links a page may contribute. index pages lead with their strongest material,
// so the limit keeps the first ones in document order
export const MAX_RESULTS = 25

// a Markdown inline link. the label runs to the first closing bracket and the target to the closing paren
// or the space before a title, which is how a link with a "quoted title" is written
const MARKDOWN_LINK = /\[([^\]]*)\]\(\s*<?([^\s<>)]+)>?[^)]*\)/g

// a Markdown image. it is written like a link but points at a picture instead of a page, and a picture
// wrapped in a link leaves its own brackets inside the link's label, so images come out before links go in
const MARKDOWN_IMAGE = /!\[([^\]]*)\]\([^)]*\)/g

// the page's body and what it cost to get. a body already stored costs nothing,
// and one that could not be read at all leaves the page to review, which fetches it on its own terms
export type PageBody = { markdown: string; costDollars: number; fetchedBody?: FetchedBody }

// one link the page lists, with the words it was written as
export type PageLink = { url: string; anchorText: string | null }

/**
 * The Source's page as a Resource, plus one Resource per link the page lists. The page's title is included for the fallback rule,
 * and each link includes its anchor text so the embed gate can judge it before any paid fetch is spent on it.
 */
export const urlIngester: SourceIngester = async (source: Source): Promise<IngestResult> => {
	// the page url lives in the Source config. a non-string url is a misconfigured Source that gets skipped as a failure
	const pageUrl = source.config.url
	if (typeof pageUrl !== "string") {
		throw new Error(`url source ${source.id} has no string config.url`)
	}

	// reject a malformed, non-http, or internal url before it reaches the fetch.
	// the canonical url is what a stored resource row is keyed by, so looking up by anything else would miss
	const fetchableUrl = toCanonicalUrl(toFetchableUrl(pageUrl).toString())

	// read the page, then map it and its links to Resources
	const pageBody = await readPageBody(fetchableUrl)
	return { resources: toUrlSourceResources(fetchableUrl, pageBody), costDollars: pageBody.costDollars }
}

/**
 * The Resources one url Source contributes: its own page as a Resource, then a Resource per link in the page's body.
 * An empty body yields no links, so a page whose fetch failed still arrives as a Resource on its own.
 */
export function toUrlSourceResources(pageUrl: string, pageBody: PageBody): IngestedResource[] {
	// the page's title is left unset, since the page isn't fetched yet and the body could be from a previously stored Resource
	const pageResource: IngestedResource = { url: pageUrl, kind: "read", fetchedBody: pageBody.fetchedBody }

	// each link on the page becomes a Resource of the with the resourceKind determined by its host,
	// so a linked video goes to the YouTube ingester, for example
	const linkResources = toPageLinks(pageBody.markdown, pageUrl).map(
		(link): IngestedResource => ({ url: link.url, kind: toResourceKind(link.url), snippet: link.anchorText }),
	)
	return [pageResource, ...linkResources]
}

/**
 * The links a page's Markdown lists, canonical and deduped, in document order and capped.
 * Same-page anchors, non-http schemes, and the page's own url are dropped, since none of them is a new page.
 */
export function toPageLinks(markdown: string, pageUrl: string): PageLink[] {
	// filter out a page's links to itself
	const canonicalPageUrl = toCanonicalUrl(pageUrl)
	const linkByUrl = new Map<string, PageLink>()

	// filter out images and match all links
	for (const link of markdown.replace(MARKDOWN_IMAGE, "$1").matchAll(MARKDOWN_LINK)) {
		// only keep links with http or https schemes that don't point back to the page itself
		const url = toLinkUrl(link[2] ?? "", pageUrl)
		if (!url || url === canonicalPageUrl || linkByUrl.has(url)) {
			continue
		}

		// the label in the link is what the embed gate uses to judge it
		const anchorText = (link[1] ?? "").trim()
		linkByUrl.set(url, { url, anchorText: anchorText || null })
		if (linkByUrl.size >= MAX_RESULTS) {
			break
		}
	}
	return [...linkByUrl.values()]
}

// the page's Markdown, from storage if it isn't stale and from a paid scrape otherwise.
// a body that cannot be read at all comes back empty, which yields no links and charges nothing
async function readPageBody(pageUrl: string): Promise<PageBody> {
	// a Resource stored by an earlier Scan and still inside the ttl window is the same page, so return it for free
	const storedMarkdown = await readStoredPage(pageUrl)
	if (storedMarkdown !== null) {
		return { markdown: storedMarkdown, costDollars: 0 }
	}

	// scrape the page and send back the body, so ingestion can store it and review can reuse it instead of scraping again
	try {
		const { markdown, etag, lastModified } = await fetchContent(pageUrl)
		return { markdown, costDollars: FIRECRAWL_COST_PER_FETCH, fetchedBody: { markdown, etag, lastModified } }
	} catch (error) {
		// the page had an error, so review will try to fetch it again
		console.error(`url source could not read the page at ${pageUrl}`, error)
		return { markdown: "", costDollars: 0 }
	}
}

// return the page's stored Markdown when a Resource already holds it, and it has not gone stale, otherwise null.
// a cache miss falls back to a paid scrape
async function readStoredPage(pageUrl: string): Promise<string | null> {
	const [storedResource] = await db
		.select({ contentKey: resources.contentKey, fetchedAt: resources.fetchedAt })
		.from(resources)
		.where(eq(resources.url, pageUrl))
	if (!storedResource?.contentKey || isContentStale(storedResource.fetchedAt, new Date(), CONTENT_TTL_MS)) {
		return null
	}

	try {
		return await getResourceContent(storedResource.contentKey)
	} catch (error) {
		console.error(`url source could not read stored content for ${pageUrl}`, error)
		return null
	}
}

// a link target as a canonical http(s) url, or null if it doesn't point to a page.
// a relative target resolves against the page that wrote it, the same way a browser would
function toLinkUrl(target: string, pageUrl: string): string | null {
	// a fragment-only target names a place inside this page, so there is nothing to fetch
	if (!target || target.startsWith("#")) {
		return null
	}

	// resolve against the page, which also parses an absolute target
	let resolvedUrl: URL
	try {
		resolvedUrl = new URL(target, pageUrl)
	} catch {
		return null
	}

	// a page can link anywhere, including at an internal address, and every link here becomes a Resource
	// that review later fetches. toFetchableUrl rejects a non-http scheme and an internal address alike
	try {
		return toCanonicalUrl(toFetchableUrl(resolvedUrl.toString()).toString())
	} catch {
		return null
	}
}
