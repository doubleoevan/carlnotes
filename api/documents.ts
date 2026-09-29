// the documents served beside the pages, and the redirect from the old /pricing path.
// the documents are the feeds, the sitemap, the llms files, the IndexNow key, and security.txt
import { appUrl } from "@shared/appUrl"
import { Hono } from "hono"
import { loadPages } from "./content"
import { loadReleases, toReleasePath, toReleaseSummary } from "./releases"
import { loadDocsPages, loadPublicTopics, toLlmsFullTxt, toLlmsTxt, toSecurityTxt, toSitemapXml } from "./seo"
import { toSiteFeedXml, toTopicFeedXml } from "./share/feed"

// the header that keeps a document out of search results
const NOINDEX_HEADER = { "X-Robots-Tag": "noindex" }

// the document routes
export const documentsRoute = new Hono()
	// a public Topic's RSS feed, under the Topic's id without its slug
	.get("/topics/:id/feed.xml", async (context) => {
		const topicFeedXml = await toTopicFeedXml(context.req.param("id"), appUrl())
		if (!topicFeedXml) {
			return context.text("not found", 404)
		}
		return context.body(topicFeedXml, 200, toDocumentHeaders("application/rss+xml; charset=utf-8", 900))
	})
	// the plans page's old path, redirected permanently
	.get("/pricing", (context) => context.redirect("/plans", 301))
	// the llms.txt index: what this site is, its docs and blog, and the most recently changed public topics
	.get("/llms.txt", async (context) => {
		const llmsTxt = toLlmsTxt({
			appUrl: appUrl(),
			docsPages: loadDocsPages(),
			blogPages: loadPages("blog"),
			publicTopics: await loadPublicTopics(),
		})
		return context.body(llmsTxt, 200, { ...toDocumentHeaders("text/plain; charset=utf-8", 900), ...NOINDEX_HEADER })
	})
	// the long form of llms.txt, with the docs and blog bodies in full
	.get("/llms-full.txt", (context) => {
		const llmsFullTxt = toLlmsFullTxt({ appUrl: appUrl(), docsPages: loadDocsPages(), blogPages: loadPages("blog") })
		return context.body(llmsFullTxt, 200, {
			...toDocumentHeaders("text/plain; charset=utf-8", 900),
			...NOINDEX_HEADER,
		})
	})
	// the site-wide feed: the blog posts and the release notes
	.get("/feed.xml", async (context) => {
		const blogItems = loadPages("blog").map((page) => ({
			title: page.title,
			url: `${appUrl()}/blog/${page.slug}`,
			explanation: page.description,
			publishedAt: new Date(page.date),
		}))

		// each release reads as its own item, pointing at its own page and dated by when it went out.
		// a failed releases read is logged and dropped, so the feed still serves the blog
		const releaseItems = await loadReleases()
			.then((releases) =>
				releases.map((release) => ({
					title: release.name,
					url: `${appUrl()}${toReleasePath(release.tag)}`,
					explanation: toReleaseSummary(release.body).trim(),
					publishedAt: release.releasedAt,
				})),
			)
			.catch((error) => {
				console.error("feed releases read failed", error)
				return []
			})
		return context.body(
			toSiteFeedXml(appUrl(), [...blogItems, ...releaseItems]),
			200,
			toDocumentHeaders("application/rss+xml; charset=utf-8", 900),
		)
	})
	// the key file IndexNow reads to check a notification came from this site
	.get("/indexnow.txt", (context) => {
		const indexNowKey = Bun.env.INDEXNOW_KEY
		return indexNowKey ? context.text(indexNowKey) : context.notFound()
	})
	// the vulnerability contact file, with an expiry a year from each request
	.get("/.well-known/security.txt", (context) => {
		return context.body(toSecurityTxt(appUrl()), 200, {
			...toDocumentHeaders("text/plain; charset=utf-8", 3600),
			...NOINDEX_HEADER,
		})
	})
	// the crawler map of every public page, generated from live data on each request
	.get("/sitemap.xml", async (context) => {
		const blogPaths = ["/blog", ...loadPages("blog").map((blogPage) => `/blog/${blogPage.slug}`)]
		return context.body(
			await toSitemapXml(appUrl(), blogPaths),
			200,
			toDocumentHeaders("application/xml; charset=utf-8", 3600),
		)
	})

// the headers of a document response, cached publicly for maxAgeSeconds
function toDocumentHeaders(contentType: string, maxAgeSeconds: number): Record<string, string> {
	return { "Content-Type": contentType, "Cache-Control": `public, max-age=${maxAgeSeconds}` }
}
