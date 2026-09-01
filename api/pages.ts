// the pages this origin serves as paths with a custom app shell and page-specific header preview tags
import { Hono } from "hono"
import { loadPages } from "./content"
import { loadReleases, toReleaseSummary } from "./releases"
import {
	lastScan,
	loadDocsPages,
	publicTopicRows,
	scanFindings,
	toCreativeWorkLd,
	toFindingListHtml,
	toFindingListLd,
	toJsonLdTag,
	toLlmsFullTxt,
	toLlmsTxt,
	toOrganizationLd,
	toSecurityTxt,
	toSitemapXml,
	toSoftwareApplicationLd,
} from "./seo"
import { toSiteFeedXml, toTopicFeedXml } from "./share/feed"
import {
	toProfilePreview,
	toProfilePreviewHtml,
	toShellWithHeadTags,
	toTeamPreview,
	toTeamPreviewHtml,
	toTopicDescription,
	toTopicPreview,
	toTopicPreviewHtml,
} from "./share/preview"

// where build:ui writes the bundle, relative to the repo root the server runs from
export const UI_BUNDLE_ROOT = "./ui/dist"

// the pages the SPA draws entirely on its own, named here with the title that each one serves
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
	// a public Topic's RSS feed, appended to the Topic's path
	.get("/topics/:id/feed.xml", async (context) => {
		const topicFeedXml = await toTopicFeedXml(context.req.param("id"), appUrl())
		if (!topicFeedXml) {
			return context.text("not found", 404)
		}
		// a public feed may be held briefly
		return context.body(topicFeedXml, 200, {
			"Content-Type": "application/rss+xml; charset=utf-8",
			"Cache-Control": "public, max-age=900",
		})
	})
	// the plans page moved from /pricing. the redirect covers any link or crawl of the old path
	.get("/pricing", (context) => context.redirect("/plans", 301))
	// the llms.txt index: what this site is, its docs and blog, and the newest public topics. it reads the sitemap's own public-topic query
	.get("/llms.txt", async (context) => {
		const llmsTxt = toLlmsTxt(appUrl(), loadDocsPages(), loadPages("blog"), await publicTopicRows())
		// cached for fifteen minutes
		return context.body(llmsTxt, 200, {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=900",
		})
	})
	// the long form: the docs and blog bodies whole, for a model that wants the text and not just the links
	.get("/llms-full.txt", (context) => {
		return context.body(toLlmsFullTxt(appUrl(), loadDocsPages(), loadPages("blog")), 200, {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=900",
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
		// a feed reader is better served the blog alone than a 500, so a failed read is logged and dropped
		const releaseItems = await loadReleases()
			.then((releases) =>
				releases.map((release) => ({
					title: release.name,
					url: `${appUrl()}/releases/${encodeURIComponent(release.tag)}`,
					explanation: toReleaseSummary(release.body).trim(),
					publishedAt: release.releasedAt,
				})),
			)
			.catch((error) => {
				console.error("feed releases read failed", error)
				return []
			})
		return context.body(toSiteFeedXml(appUrl(), [...blogItems, ...releaseItems]), 200, {
			"Content-Type": "application/rss+xml; charset=utf-8",
			"Cache-Control": "public, max-age=900",
		})
	})
	// the vulnerability contact file, served from the route. no dot-directory sits in the static bundle
	.get("/.well-known/security.txt", (context) => {
		return context.body(toSecurityTxt(appUrl()), 200, {
			"Content-Type": "text/plain; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
		})
	})
	// the crawler map of every public page, generated from live data on each request
	.get("/sitemap.xml", async (context) => {
		const contentPaths = ["/blog", ...loadPages("blog").map((page) => `/blog/${page.slug}`)]
		// a crawler may hold the map for an hour, which spares the live queries for each build
		return context.body(await toSitemapXml(appUrl(), contentPaths), 200, {
			"Content-Type": "application/xml; charset=utf-8",
			"Cache-Control": "public, max-age=3600",
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
	// the SPA-drawn pages, each answering with its own title and canonical url
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
	// a topic's page path gets the app shell with its topic-specific preview tags hydrated
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
				// a public topic's seo content also includes its last scan's findings as a ranked hasPart list in CreativeWork
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
	// a team's page path gets the app shell with its team-specific preview tags hydrated
	.get("/teams/:teamId", async (context, next) => {
		try {
			const teamPreview = await toTeamPreview(context.req.param("teamId"))
			const appShell = Bun.file(`${UI_BUNDLE_ROOT}/index.html`)
			// a private or missing team, or an unbuilt bundle, falls through to the plain shell
			if (teamPreview && (await appShell.exists())) {
				return context.html(toTeamPreviewHtml(await appShell.text(), teamPreview, appUrl()))
			}
		} catch (error) {
			console.error("team preview tags skipped", error)
		}
		return next()
	})
	// a profile's page path gets the app shell with its profile-specific preview tags hydrated
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
