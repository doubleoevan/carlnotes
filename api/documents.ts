// the documents served beside the pages, and the redirect from the old /pricing path.
// the documents are the feeds, the sitemap, the llms files, the IndexNow key, and security.txt
import { appUrl } from "@shared/appUrl"
import { isPodcastEpisodeRenderingConfigured } from "@shared/podcastEpisodes"
import { eq } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../db"
import { topics } from "../db/schema"
import { loadPages } from "./content"
import { setRenderedCacheHeaders } from "./edgeCache"
import {
	loadPodcastFeedTokenListener,
	loadRenderedPodcastFeed,
	toPodcastFeedResponse,
} from "./podcast/podcastFeedTokens"
import { loadPublicPodcastEpisodeRows } from "./podcast/podcastSeo"
import { loadReleases, toReleasePath, toReleaseSummary } from "./releases"
import { loadDocsPages, loadPublicTopics, toLlmsFullTxt, toLlmsTxt, toSecurityTxt, toSitemapXml } from "./seo"
import { toSiteFeedXml, toTopicFeedXml } from "./share/feed"

// the header that keeps a document out of search results
const NOINDEX_HEADER = { "X-Robots-Tag": "noindex" }

// the document routes
export const documentsRoute = new Hono()
	// a public Topic's RSS feed, at a path after the Topic's id without its slug
	.get("/topics/:id/feed.xml", async (context) => {
		const topicFeedXml = await toTopicFeedXml(context.req.param("id"), appUrl())
		if (!topicFeedXml) {
			return context.text("not found", 404)
		}
		return context.body(topicFeedXml, 200, toDocumentHeaders("application/rss+xml; charset=utf-8", 900))
	})
	// a public Topic's podcast feed, after the Topic's id without its slug, shared at the edge like a rendered page
	.get("/topics/:id/podcast.xml", async (context) => {
		const [topic] = await db
			.select()
			.from(topics)
			.where(eq(topics.id, context.req.param("id")))

		// only a public topic with a published podcast episode has a public feed
		const renderedPodcastFeed =
			topic?.visibility === "public" ? await loadRenderedPodcastFeed({ topic, listener: null }) : null
		if (!isPodcastEpisodeRenderingConfigured() || !renderedPodcastFeed?.xml.includes("<item>")) {
			return context.text("not found", 404)
		}

		// respond with a 304 if the request's copy is current, and let the edge share the feed
		const podcastFeedResponse = toPodcastFeedResponse({ context, renderedPodcastFeed, routeHeaders: {} })
		setRenderedCacheHeaders(context.req.raw, podcastFeedResponse)
		return podcastFeedResponse
	})
	// a listener's own podcast feed of a private or invite Topic.
	// the podcast feed token alone grants access, and nothing caches or indexes the feed
	.get("/podcast-feeds/:tokenFile", async (context) => {
		// read the podcast feed token from the file name, and look up its listener
		const podcastFeedToken = context.req.param("tokenFile").replace(/\.xml$/, "")
		const podcastFeedTokenListener = isPodcastEpisodeRenderingConfigured()
			? await loadPodcastFeedTokenListener(podcastFeedToken)
			: null

		// load the Topic that the podcast feed token opens, or respond 404
		const [topic] = podcastFeedTokenListener
			? await db.select().from(topics).where(eq(topics.id, podcastFeedTokenListener.topicId))
			: []
		if (!podcastFeedTokenListener || !topic) {
			return context.text("not found", 404)
		}

		// respond with the listener's own feed, or a 304 if the listener's copy is current
		const listener = { userId: podcastFeedTokenListener.userId, token: podcastFeedToken }
		const renderedPodcastFeed = await loadRenderedPodcastFeed({ topic, listener })
		const routeHeaders = { ...NOINDEX_HEADER, "Cache-Control": "private, no-store" }
		return toPodcastFeedResponse({ context, renderedPodcastFeed, routeHeaders })
	})
	// the plans page's old path, redirected permanently
	.get("/pricing", (context) => context.redirect("/plans", 301))
	// the llms.txt index of the site, its docs and blog, the most recently changed public topics,
	// and the newest podcast episodes of the public topics
	.get("/llms.txt", async (context) => {
		// build llms.txt from the docs, the blog, the public topics, and the public topics' podcast episodes
		const [docsPages, blogPages, publicTopics] = await Promise.all([
			loadDocsPages(),
			loadPages("blog"),
			loadPublicTopics(),
		])
		const publicPodcastEpisodeRows = await loadPublicPodcastEpisodeRows(
			publicTopics.map((publicTopic) => publicTopic.id),
		)
		const llmsTxt = toLlmsTxt({ appUrl: appUrl(), docsPages, blogPages, publicTopics, publicPodcastEpisodeRows })
		return context.body(llmsTxt, 200, { ...toDocumentHeaders("text/plain; charset=utf-8", 900), ...NOINDEX_HEADER })
	})
	// the long form of llms.txt, with the docs and blog bodies in full
	.get("/llms-full.txt", async (context) => {
		const [docsPages, blogPages] = await Promise.all([loadDocsPages(), loadPages("blog")])
		const llmsFullTxt = toLlmsFullTxt({ appUrl: appUrl(), docsPages, blogPages })
		return context.body(llmsFullTxt, 200, {
			...toDocumentHeaders("text/plain; charset=utf-8", 900),
			...NOINDEX_HEADER,
		})
	})
	// the site-wide feed: the blog posts and the release notes
	.get("/feed.xml", async (context) => {
		const blogItems = (await loadPages("blog")).map((page) => ({
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
		const blogPaths = ["/blog", ...(await loadPages("blog")).map((blogPage) => `/blog/${blogPage.slug}`)]
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
