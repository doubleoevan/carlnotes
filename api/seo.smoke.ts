// a live smoke test that loadPublicTopics and the sitemap list only public topics,
// and every public page arrives whole to a browser without JavaScript on its route's first render.
// a request with a session cookie gets the app as the browser renders it, and a crawler gets what a browser gets.
// the edge may share a signed-out page and the feed, and a card is immutable only at its version.
// bun run smoke:seo builds the ui, then runs this test under doppler
import { resolve } from "node:path"
import type { PageHead } from "@shared/contracts"
import { MINIMUM_SHOWN_FINDINGS } from "@shared/enums"
import { toTopicPath } from "@shared/seo"
import { eq, inArray, max } from "drizzle-orm"
import { connectionPool, db } from "../db"
import { findings, resources, scans, teamMembers, teams, topics, users } from "../db/schema"
import { deleteAttachment } from "../worker"
import { RENDERED_CACHE_TAG } from "./edgeCache"
import { loadPublicTopics, loadTopicFeedUpdatedAt, toSitemapXml } from "./seo"
import { toTopicPreview } from "./share/preview"
import { toTopicPreviewKey } from "./share/topicImage"

// where build:ui writes the ui's server entry
const UI_SERVER_ENTRY = "ui/dist/server/server.js"
// the summary each fixture scan writes, short enough to be its topic's whole description
const SCAN_SUMMARY = "Carl read everything the smoke run left."
// the api the ui's loaders read on the server
const API_ORIGIN = "http://localhost:3000"
// a desktop Safari user agent. the ui's stream handler sends a crawler each page whole and streams a page to a
// browser, so a browser is the stricter check
const BROWSER_USER_AGENT =
	"Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
// Google's crawler user agent, which the ui's stream handler sends each page whole
const CRAWLER_USER_AGENT = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
// a cookie header with a Better Auth session cookie. the ui only checks that the cookie is there, so any value works
const SESSION_COOKIE = "better-auth.session_token=smoke"
// the text a page shows while it loads, which a page that arrives whole never includes
const LOADING_TEXT = "Steeping"
// how long to wait for an api to respond before this run serves one itself
const API_WAIT_ATTEMPTS = 20
const API_WAIT_INTERVAL_MS = 500

// the ui server's request handler, as its entry exports it
type UiServer = { fetch: (request: Request) => Promise<Response> }
// a page as the browser gets it: its status, where a redirect goes, the whole html, and the html before the footer
type FetchedPage = { status: number; location: string | null; html: string; contentHtml: string }
// the page to fetch from the ui server, and the request headers that replace a browser's
type FetchPageOptions = { uiServer: UiServer; path: string; headers?: Record<string, string> }

// the fixtures this run writes and removes. one owner leading a public team, and a public and a private topic with
// the same tag and enough findings to be shown
const runId = `smoke-seo-${Date.now()}`
const ownerId = `${runId}-owner`
const teamId = crypto.randomUUID()
const teamName = `${runId} team`
const topicIds = { public: `${runId}-public`, private: `${runId}-private` }
// a public topic with no findings, below the minimum a listed topic needs
const unshownTopicId = `${runId}-thin`
const topicNames = { public: "public smoke topic", private: "private smoke topic" }
const resourceIds = [...Array(MINIMUM_SHOWN_FINDINGS).keys()].map((index) => `${runId}-resource-${index}`)

// the api this run serves itself if none is running, stopped at the end
let apiServer: ReturnType<typeof Bun.serve> | null = null
try {
	// insert the owner and the public team they lead
	await db.insert(users).values({
		id: ownerId,
		name: "owner",
		email: `${ownerId}@carlnotes.test`,
		username: ownerId,
		usernameNormalized: ownerId.replace(/-/g, ""),
	})
	await db.insert(teams).values({ id: teamId, name: teamName, isPublic: true })
	await db.insert(teamMembers).values({ teamId, userId: ownerId, role: "leader" })

	// insert the three topics and the resources the findings point at
	await db.insert(topics).values([
		{ id: topicIds.public, ownerId, name: topicNames.public, visibility: "public", tags: [runId] },
		{ id: topicIds.private, ownerId, name: topicNames.private, visibility: "private", tags: [runId] },
		{ id: unshownTopicId, ownerId, name: "thin smoke topic", visibility: "public", tags: [runId] },
	])
	await db
		.insert(resources)
		.values(resourceIds.map((id) => ({ id, url: `https://carlnotes.test/${id}`, kind: "read" as const })))

	// write the same summarized scan and findings on both topics, as a real scan leaves them, so only the visibility
	// tells the two topics apart
	for (const topicId of Object.values(topicIds)) {
		// insert the scan first, then the findings that reference the scan
		const [scan] = await db
			.insert(scans)
			.values({
				topicId,
				ownerId,
				status: "succeeded",
				scanSummary: SCAN_SUMMARY,
				keptCount: resourceIds.length,
			})
			.returning()
		failUnless(scan !== undefined, `the scan insert on ${topicId} returned no row`)
		await db
			.insert(findings)
			.values(resourceIds.map((resourceId) => ({ topicId, resourceId, scanId: scan.id, relevanceScore: 0.9 })))
	}

	// loadPublicTopics lists the public topic, and neither the private topic nor the thin one
	const publicTopics = await loadPublicTopics()
	const listedTopicIds = new Set(publicTopics.map((publicTopic) => publicTopic.id))
	failUnless(listedTopicIds.has(topicIds.public), "loadPublicTopics leaves out the public topic")
	failUnless(!listedTopicIds.has(topicIds.private), "loadPublicTopics lists the private topic")
	failUnless(!listedTopicIds.has(unshownTopicId), "loadPublicTopics lists a public topic with too few findings")

	// the public topic is described by its scan's summary and dated by its newest finding
	const listedPublicTopic = publicTopics.find((publicTopic) => publicTopic.id === topicIds.public)
	const [newestFindingRow] = await db
		.select({ createdAt: max(findings.createdAt) })
		.from(findings)
		.where(eq(findings.topicId, topicIds.public))
	const newestFindingTime = newestFindingRow?.createdAt?.getTime()
	failUnless(
		listedPublicTopic?.description === SCAN_SUMMARY,
		"loadPublicTopics does not describe the topic by its summary",
	)
	failUnless(
		Date.parse(listedPublicTopic?.feedUpdatedAt ?? "") === newestFindingTime,
		"loadPublicTopics does not date the topic by its newest finding",
	)
	failUnless(
		(await loadTopicFeedUpdatedAt(topicIds.public))?.getTime() === newestFindingTime,
		"loadTopicFeedUpdatedAt does not date the topic by its newest finding",
	)
	console.log("seo smoke: loadPublicTopics lists only public topics, described and dated by their content")

	// the ui server, imported fresh so each page below is its route's first render in this process. the ui server's
	// loaders read the api, which this run serves itself if no api is already running
	const uiServer = (await import(resolve(UI_SERVER_ENTRY))).default as UiServer
	apiServer = (await waitForApi()) ? null : Bun.serve((await import("./index")).default)

	// a public topic with too few findings has a head that is not indexed and names no canonical url
	const unshownTopicHead = (await (await fetch(`${API_ORIGIN}/api/topics/${unshownTopicId}/head`)).json()) as PageHead
	failUnless(
		!unshownTopicHead.isIndexed && unshownTopicHead.canonicalUrl === null,
		"a thin public topic's head is indexed",
	)

	// the public pages, and the private topic page, which renders too but may never show its findings
	const publicTopicPath = toTopicPath({ id: topicIds.public, name: topicNames.public })
	const privateTopicPath = toTopicPath({ id: topicIds.private, name: topicNames.private })
	const profilePath = `/profiles/${ownerId}`
	const teamPath = `/teams/${teamId}`
	const pagePaths = [
		"/",
		"/topics",
		"/plans",
		"/terms",
		"/privacy",
		publicTopicPath,
		privateTopicPath,
		profilePath,
		teamPath,
	]

	// every page arrives whole, with nothing streamed in after the footer and nothing still loading
	const pages = new Map<string, FetchedPage>()
	for (const pagePath of pagePaths) {
		const page = await fetchPage({ uiServer, path: pagePath })
		failUnless(page.status === 200, `${pagePath} responds ${page.status}`)
		failUnless(!page.html.includes('<div hidden id="S:'), `${pagePath} streams part of its content in after the footer`)
		failUnless(!page.contentHtml.includes(LOADING_TEXT), `${pagePath} arrives still loading`)
		pages.set(pagePath, page)
	}

	// a public topic's page has its name as the heading and every finding as a link marked as user content, in the
	// html itself
	const publicTopicHtml = pages.get(publicTopicPath)?.contentHtml ?? ""
	failUnless(hasHeading(publicTopicHtml, topicNames.public), "the public topic page has no heading")
	for (const resourceId of resourceIds) {
		const findingLink = publicTopicHtml.match(new RegExp(`<a [^>]*href="https://carlnotes\\.test/${resourceId}"[^>]*>`))
		failUnless(findingLink !== null, `no link to ${resourceId}`)
		failUnless(findingLink[0].includes('rel="noopener ugc"'), `the link to ${resourceId} is not user content`)
	}

	// a private topic's page is never indexed and shows none of its findings, to a crawler or anyone else
	const privateTopicHtml = pages.get(privateTopicPath)?.html ?? ""
	failUnless(privateTopicHtml.includes('name="robots" content="noindex'), "the private topic page is indexable")
	failUnless(!privateTopicHtml.includes("https://carlnotes.test/"), "the private topic page shows its findings")

	// the profile and team pages have their own name as the heading
	failUnless(hasHeading(pages.get(profilePath)?.contentHtml ?? "", ownerId), "the profile page has no heading")
	failUnless(hasHeading(pages.get(teamPath)?.contentHtml ?? "", teamName), "the team page has no heading")

	// the public topics page links the public topic, and the homepage links at least one topic
	failUnless(pages.get("/topics")?.contentHtml.includes(`href="${publicTopicPath}"`) ?? false, "/topics misses a topic")
	failUnless(/href="\/topics\/[^"]+"/.test(pages.get("/")?.contentHtml ?? ""), "the homepage links no topic")

	// the sitemap lists the public topic's url with its slug, and neither the private topic nor the team, which has
	// no public topic
	const sitemapXml = await toSitemapXml(API_ORIGIN)
	failUnless(sitemapXml.includes(`<loc>${API_ORIGIN}${publicTopicPath}</loc>`), "the sitemap misses the public topic")
	failUnless(!sitemapXml.includes(privateTopicPath), "the sitemap lists the private topic")
	failUnless(!sitemapXml.includes(teamPath), "the sitemap lists a team with no public topic")

	// a public topic's feed responds under its id, and the feed's self link names that path
	const topicFeedResponse = await fetch(`${API_ORIGIN}/topics/${topicIds.public}/feed.xml`)
	failUnless(topicFeedResponse.status === 200, `the public topic's feed responds ${topicFeedResponse.status}`)
	const topicFeedXml = await topicFeedResponse.text()
	failUnless(topicFeedXml.includes(`/topics/${topicIds.public}/feed.xml"`), "the feed's self link names another path")

	// a topic's url by its id alone redirects permanently to the url with its slug
	const bareIdPage = await fetchPage({ uiServer, path: `/topics/${topicIds.public}` })
	failUnless(bareIdPage.status === 301, `a bare topic id responds ${bareIdPage.status}`)
	failUnless(bareIdPage.location === publicTopicPath, `a bare topic id redirects to ${bareIdPage.location}`)
	console.log("seo smoke: every public page arrives whole to a browser without JavaScript, on its first render")

	// a request with a session cookie gets the app as the browser renders it, with no footer in the html. the same
	// page without the cookie has its footer, so the check cannot pass on a page that renders nothing
	const signedInPages = new Map<string, FetchedPage>()
	for (const pagePath of ["/", publicTopicPath]) {
		const signedInPage = await fetchPage({ uiServer, path: pagePath, headers: { cookie: SESSION_COOKIE } })
		failUnless(signedInPage.status === 200, `${pagePath} responds ${signedInPage.status} to a session cookie`)
		failUnless(!signedInPage.html.includes("<footer"), `${pagePath} renders on the server for a session cookie`)
		failUnless(pages.get(pagePath)?.html.includes("<footer") ?? false, `${pagePath} has no footer without a cookie`)
		signedInPages.set(pagePath, signedInPage)
	}

	// the public topic's page for a session cookie has neither the heading nor the finding links the page without the
	// cookie has above
	const signedInTopicHtml = signedInPages.get(publicTopicPath)?.html ?? ""
	failUnless(!hasHeading(signedInTopicHtml, topicNames.public), "the topic page has its heading for a session cookie")
	failUnless(!signedInTopicHtml.includes('href="https://carlnotes.test/'), "the topic page links findings for a cookie")
	console.log("seo smoke: a request with a session cookie gets the app as the browser renders it")

	// a crawler gets the same public topic page as a browser
	const crawlerTopicPage = await fetchPage({
		uiServer,
		path: publicTopicPath,
		headers: { "user-agent": CRAWLER_USER_AGENT },
	})
	failUnless(crawlerTopicPage.status === 200, `${publicTopicPath} responds ${crawlerTopicPage.status} to a crawler`)
	failUnless(
		crawlerTopicPage.contentHtml === publicTopicHtml,
		"a crawler gets another public topic page than a browser",
	)
	console.log("seo smoke: a crawler gets the same page as a browser")

	// through the api, the public topic page and the signed-out feed are sent uncompressed
	// and shared at the edge under the tag that the release purge clears.
	// the same urls with a session cookie are private
	for (const renderedPath of [publicTopicPath, "/api/topic-feed"]) {
		const signedOutResponse = await fetch(`${API_ORIGIN}${renderedPath}`, {
			headers: { "user-agent": BROWSER_USER_AGENT },
		})
		const signedInResponse = await fetch(`${API_ORIGIN}${renderedPath}`, { headers: { cookie: SESSION_COOKIE } })
		failUnless(
			signedOutResponse.headers.get("cdn-cache-control") === "max-age=60, stale-while-revalidate=60",
			`${renderedPath} is not shared at the edge`,
		)
		failUnless(signedOutResponse.headers.get("cache-tag") === RENDERED_CACHE_TAG, `${renderedPath} has no purge tag`)
		failUnless(
			signedOutResponse.headers.get("content-encoding") === null,
			`${renderedPath} is compressed at the origin`,
		)
		failUnless(
			signedInResponse.headers.get("cache-control") === "private, no-cache" &&
				signedInResponse.headers.get("cdn-cache-control") === null,
			`${renderedPath} is shared for a session cookie`,
		)
	}

	// the public topic's card url names its version, and the card is immutable only at that version
	const publicTopicHead = (await (await fetch(`${API_ORIGIN}/api/topics/${topicIds.public}/head`)).json()) as PageHead
	const cardUrl = new URL(publicTopicHead.imageUrl)
	failUnless(cardUrl.searchParams.has("v"), "the public topic's card url names no version")
	const currentCardResponse = await fetch(`${API_ORIGIN}${cardUrl.pathname}${cardUrl.search}`)
	const oldCardResponse = await fetch(`${API_ORIGIN}${cardUrl.pathname}?v=old`)
	failUnless(
		currentCardResponse.headers.get("cache-control") === "public, max-age=31536000, immutable",
		"the card at its current version is not immutable",
	)
	failUnless(
		oldCardResponse.headers.get("cache-control") === "public, max-age=60",
		"the card at an old version is not cached for a minute",
	)
	console.log("seo smoke: the edge shares a signed-out page and the feed, and a card is immutable at its version")
} finally {
	// delete the card that this run rendered, while its topic still names the card's key
	const publicTopicPreview = await toTopicPreview(topicIds.public)
	if (publicTopicPreview) {
		await deleteAttachment(toTopicPreviewKey(publicTopicPreview))
	}

	// stop the api this run served, then delete the fixtures. the findings cascade with the topics, the members with
	// the team, and the scans with the owner
	apiServer?.stop(true)
	await db.delete(topics).where(inArray(topics.id, [...Object.values(topicIds), unshownTopicId]))
	await db.delete(teams).where(inArray(teams.id, [teamId]))
	await db.delete(resources).where(inArray(resources.id, resourceIds))
	await db.delete(users).where(inArray(users.id, [ownerId]))
	await connectionPool.end()
}

// the api this run may have served keeps its timers running, so a passing run ends itself
process.exit(0)

// a page as a browser without JavaScript gets it from the ui server, with the html before the footer kept apart
async function fetchPage({ uiServer, path, headers = {} }: FetchPageOptions): Promise<FetchedPage> {
	const request = new Request(`${API_ORIGIN}${path}`, {
		headers: { accept: "text/html", "user-agent": BROWSER_USER_AGENT, ...headers },
	})
	const response = await uiServer.fetch(request)
	const html = await response.text()
	const footerIndex = html.indexOf("<footer")
	return {
		status: response.status,
		location: response.headers.get("location"),
		html,
		contentHtml: footerIndex < 0 ? html : html.slice(0, footerIndex),
	}
}

// whether a page's html has an h1 that includes the given text
function hasHeading(contentHtml: string, text: string): boolean {
	return [...contentHtml.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)].some((match) => match[1]?.includes(text))
}

// whether an api responds on the port the ui's loaders read within a few seconds. a dev api that watches the ui
// bundle restarts when build:ui rewrites the bundle, and takes the port before the api responds
async function waitForApi(): Promise<boolean> {
	for (let attempt = 0; attempt < API_WAIT_ATTEMPTS; attempt += 1) {
		try {
			if ((await fetch(`${API_ORIGIN}/api/health`)).ok) {
				return true
			}
		} catch {
			// nothing responds yet
		}
		await Bun.sleep(API_WAIT_INTERVAL_MS)
	}
	return false
}

// fail the run with a message if a condition is false
function failUnless(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(`seo smoke: ${message}`)
	}
}
