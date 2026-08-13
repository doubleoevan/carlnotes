// the pages this origin serves as paths with a custom app shell and page-specific header preview tags.
// each page route gives a crawler a title, a canonical url, preview tags, and structured data.
// a crawler runs no script and the SPA can only add those once React has mounted, so these pages must be customized for seo.
import { Hono } from "hono"
import { loadPages } from "./content"
import {
	lastScan,
	scanFindings,
	toCreativeWorkLd,
	toFindingListHtml,
	toFindingListLd,
	toJsonLdTag,
	toOrganizationLd,
	toSitemapXml,
	toSoftwareApplicationLd,
} from "./seo"
import { toTopicFeedXml } from "./share/feed"
import {
	toProfilePreview,
	toProfilePreviewHtml,
	toShellWithHeadTags,
	toTopicDescription,
	toTopicPreview,
	toTopicPreviewHtml,
} from "./share/preview"

// where build:ui writes the bundle, relative to the repo root the server runs from.
// the page routes read the shell from it, and the server serves the rest of it as static files
export const UI_BUNDLE_ROOT = "./ui/dist"

// the pages the SPA draws entirely on its own, named here with the title that each one serves.
// they hold no server-loaded content, so their route only has to answer with a title and a canonical url
const SPA_PAGE_TITLES: Record<string, string> = {
	"/plans": "Plans",
	"/terms": "Terms",
	"/privacy": "Privacy",
}

/**
 * The app's own origin. A social crawler reading the preview tags and an RSS reader both need absolute urls.
 */
export function appUrl(): string {
	return Bun.env.BETTER_AUTH_URL ?? "http://localhost:5173"
}

// the page routes, mounted on the server ahead of the static bundle so that each can inject its own tags first.
export const pagesRoute = new Hono()
	// a public Topic's RSS feed, appended to the Topic's path instead of under /api
	// it is a document that a user pastes into their feed reader
	.get("/topics/:id/feed.xml", async (context) => {
		const topicFeedXml = await toTopicFeedXml(context.req.param("id"), appUrl())
		if (!topicFeedXml) {
			return context.text("not found", 404)
		}
		return context.body(topicFeedXml, 200, { "Content-Type": "application/rss+xml; charset=utf-8" })
	})
	// the plans page moved from /pricing. the redirect covers any link or crawl of the old path
	.get("/pricing", (context) => context.redirect("/plans", 301))
	// the crawler map of every public page, generated from live data on each request
	.get("/sitemap.xml", async (context) => {
		const contentPaths = [
			"/blog",
			"/docs",
			...loadPages("blog").map((page) => `/blog/${page.slug}`),
			...loadPages("docs").map((page) => `/docs/${page.slug}`),
		]
		return context.body(await toSitemapXml(appUrl(), contentPaths), 200, {
			"Content-Type": "application/xml; charset=utf-8",
		})
	})
	// the homepage shell with the app's structured data, its own title and canonical url intact
	.get("/", async (context, next) => {
		// a dev machine with no bundle built falls through to the plain shell handling
		try {
			const appShell = Bun.file(`${UI_BUNDLE_ROOT}/index.html`)
			if (await appShell.exists()) {
				const headTags = [
					`<title>CarlNotes — He already read it. All of it.</title>`,
					`<link rel="canonical" href="${appUrl()}">`,
					toJsonLdTag(toOrganizationLd(appUrl())),
					toJsonLdTag(toSoftwareApplicationLd(appUrl())),
				].join("")
				return context.html(toShellWithHeadTags(await appShell.text(), headTags))
			}
		} catch (error) {
			console.error("homepage structured data skipped", error)
		}
		return next()
	})
	// the SPA-drawn pages, each answering with its own title and canonical url,
	// so a crawler reads the page it asked for instead of the shell's homepage defaults
	.on("GET", Object.keys(SPA_PAGE_TITLES), async (context, next) => {
		// a dev machine with no bundle built falls through to the plain shell handling
		try {
			const pageTitle = SPA_PAGE_TITLES[context.req.path]
			const appShell = Bun.file(`${UI_BUNDLE_ROOT}/index.html`)
			if (pageTitle && (await appShell.exists())) {
				const headTags = [
					`<title>${pageTitle} — CarlNotes</title>`,
					`<link rel="canonical" href="${appUrl()}${context.req.path}">`,
				].join("")
				return context.html(toShellWithHeadTags(await appShell.text(), headTags))
			}
		} catch (error) {
			console.error("page tags skipped", error)
		}
		return next()
	})
	// a topic's page path gets the app shell with its topic-specific preview tags hydrated.
	// one response serves every client: a browser runs the SPA, a social platform reads the preview tags,
	// and a crawler reads the title, canonical url, structured data, and noscript body
	.get("/topics/:id", async (context, next) => {
		// a failed topic preview tags lookup falls through to the preview tags in the global layout
		try {
			const topicPreview = await toTopicPreview(context.req.param("id"))
			const appShell = Bun.file(`${UI_BUNDLE_ROOT}/index.html`)
			// a missing topic, or a dev machine with no bundle built, falls through to the global static preview tags layout
			if (topicPreview && (await appShell.exists())) {
				// a private or invite topic serves its card tags only: title, username, and counts, never its findings
				if (topicPreview.visibility !== "public") {
					return context.html(toTopicPreviewHtml(await appShell.text(), topicPreview, appUrl()))
				}
				// a public topic's seo content also carries its last brew's findings as a ranked hasPart list in CreativeWork structured data,
				// as well as a noscript body for crawlers that run no script
				const scan = await lastScan(topicPreview.topicId)
				const findingRows = scan ? await scanFindings(scan.id) : []
				const creativeWork = toJsonLdTag(
					toCreativeWorkLd({
						name: topicPreview.title,
						description: toTopicDescription(topicPreview),
						url: `${appUrl()}/topics/${topicPreview.topicId}`,
						dateModified: scan?.startedAt ?? null,
						authorUsername: topicPreview.ownerUsername,
						findingList: toFindingListLd(findingRows),
						appUrl: appUrl(),
					}),
				)
				const findingListHtml = toFindingListHtml(topicPreview.title, toTopicDescription(topicPreview), findingRows)
				return context.html(
					toTopicPreviewHtml(await appShell.text(), topicPreview, appUrl(), creativeWork, findingListHtml),
				)
			}
		} catch (error) {
			console.error("topic preview tags skipped", error)
		}
		return next()
	})
	// a profile's page path gets the app shell with its profile-specific preview tags hydrated.
	// one response serves every client: a browser runs the SPA, a social platform reads the preview tags,
	// and a crawler reads the title, canonical url, structured data, and noscript body
	.get("/profiles/:userId", async (context, next) => {
		try {
			const profilePreview = await toProfilePreview(context.req.param("userId"))
			const appShell = Bun.file(`${UI_BUNDLE_ROOT}/index.html`)
			// a missing user or an unbuilt bundle falls through to the plain shell
			if (profilePreview && (await appShell.exists())) {
				return context.html(toProfilePreviewHtml(await appShell.text(), profilePreview, appUrl()))
			}
		} catch (error) {
			console.error("profile preview tags skipped", error)
		}
		return next()
	})
