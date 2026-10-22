// the server that owns the origin
import { extname, resolve } from "node:path"
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider"
import { DEGRADED_RENDER_HEADER } from "@carlnotes/contracts/seo"
import { withTimeLimit } from "@carlnotes/contracts/time"
import { db, readPoolGauges, sizeConnectionPool } from "@carlnotes/db"
import { readRedisExtraGauges } from "@carlnotes/db/redisGauges"
import { runWithRequestMemo } from "@carlnotes/db/requestMemo"
import { startTelemetry } from "@carlnotes/models/telemetry"
import { toPositiveInteger } from "@carlnotes/server/envSettings"
import { reportError, startMonitoring } from "@carlnotes/server/monitoring"
import { startRuntimeGauges } from "@carlnotes/server/runtimeGauges"
import { getSessionCookie } from "better-auth/cookies"
import { sql } from "drizzle-orm"
import type { Context, Next } from "hono"
import { Hono } from "hono"
import { serveStatic } from "hono/bun"
import { HTTPException } from "hono/http-exception"
import { apiRoute } from "./api"
import { auth } from "./auth"
import { PROVIDER_PHOTO_ORIGINS } from "./avatars"
import { defaultBodyLimit } from "./bodyLimit"
import { trackBotFetches } from "./botAnalytics"
import { DOCS_BUNDLE_ROOT, UI_CLIENT_ROOT, UI_SERVER_ENTRY } from "./bundlePaths"
import { BLOG_INDEX_PATH, BLOG_PAGE_PATH, contentRoute } from "./content"
import { FRAME_SOURCE_DIRECTIVE, toContentSecurityPolicy } from "./contentSecurityPolicy"
import type { AppEnv } from "./currentUser"
import { documentsRoute } from "./documents"
import {
	IMMUTABLE_CACHE_CONTROL,
	NO_STORE_CACHE_CONTROL,
	PUBLIC_FILE_HEADERS,
	renderedCacheHeaders,
	setStaticFileCacheControl,
} from "./edgeCache"
import { faviconsRoute } from "./favicons"
import { mcpRoute } from "./mcp/server"
import { resolveToolCaller } from "./mcp/toolCaller"
import { nightshiftRoute } from "./nightshift"
import { pageRenderRateLimiter, toolCallerRateLimiter } from "./rateLimit"
import { RELEASE_PATH, RELEASES_PATH, releasesRoute } from "./releases"
import { traceRequest } from "./requestTracing"
import { checkTrustedProxies } from "./trustedProxies"

// how long a crawler waits before it retries a page rendered without a read it needs
const DEGRADED_RENDER_RETRY_AFTER_SECONDS = 60

// how long the deep health check waits for the database before it responds 503
const DEEP_HEALTH_TIMEOUT_MS = 2000

// the largest request body the server reads, above CHAT_BODY_LIMIT_BYTES, the largest any route accepts
const MAX_REQUEST_BODY_BYTES = 32 * 1024 * 1024

// how many visitor pages this replica renders at once unless RENDER_CONCURRENCY sets it. a visitor's render past it is
// shed
const DEFAULT_RENDER_CONCURRENCY = 16

// how long the browser waits before retrying a shed render, in seconds
const BUSY_RENDER_RETRY_AFTER_SECONDS = 2

// the click ids that ad and social platforms append to a shared link
const CLICK_ID_PARAMETERS = new Set([
	"fbclid",
	"gclid",
	"gclsrc",
	"dclid",
	"gbraid",
	"wbraid",
	"msclkid",
	"twclid",
	"ttclid",
	"igshid",
	"li_fat_id",
	"rdt_cid",
	"epik",
	"qclid",
	"sccid",
	"irclid",
	"_kx",
	"mc_eid",
])

// the page routes the api renders itself instead of the ui's server: the blog and the release pages. each names its
// route exactly, so a request passes the page guards once
const API_PAGE_ROUTE_PATHS = [BLOG_INDEX_PATH, BLOG_PAGE_PATH, RELEASES_PATH, RELEASE_PATH]

// how many visitor pages this replica is rendering now
let activeVisitorRenderCount = 0

// the ui's server handler, as the server entry exports it
type UiServer = { fetch: (request: Request) => Promise<Response> }

// how importing the ui's server bundle went: loaded with its handler, missing if build:ui never wrote it, or failed
type UiServerImport = { status: "loaded"; uiServer: UiServer } | { status: "missing" } | { status: "failed" }

// the ui builds its typed api client from this definition
export type AppType = typeof apiRoute

// start monitoring, then tracing for model calls, in that order so Langfuse keeps its own provider beside Sentry's.
// then size the connection pool from the database
startMonitoring()
startTelemetry()
await sizeConnectionPool()

// load the ui's server bundle before serving, so a new replica's first page never waits on the import
await importUiServer()

// log the process's connection pool, event loop delay, and Redis gauges once a minute
startRuntimeGauges({ processName: "api", readPoolGauges, readExtraGauges: readRedisExtraGauges })

// the default policy, used unless a route sets its own. images may come from a composer's local preview,
// github, and an avatar's photo host. frames may come from the shared frame sources
const CONTENT_SECURITY_POLICY = toContentSecurityPolicy([
	`img-src 'self' blob: data: https://raw.githubusercontent.com ${[...PROVIDER_PHOTO_ORIGINS].join(" ")}`,
	FRAME_SOURCE_DIRECTIVE,
	"frame-ancestors 'none'",
])

// the headers every response includes unless its route set its own: the policy, the referrer a cross-origin link sees
// as the origin alone, and a browser that never sniffs a response's type
const DEFAULT_RESPONSE_HEADERS = {
	"Content-Security-Policy": CONTENT_SECURITY_POLICY,
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"X-Content-Type-Options": "nosniff",
}

// the page guards every rendered page passes ahead of its route: the rendered cache headers, the page render limit,
// and the click id redirect
const PAGE_GUARDS = [renderedCacheHeaders, pageRenderRateLimiter, redirectClickIdUrl] as const

// one server serves the api, the pages, and the built ui
const server = new Hono<AppEnv>()
	// report an error no route handles to Sentry, and respond 500 as Hono's own handler does
	.onError(reportRouteError)
	// give each request its own memo, first so every later middleware and route reads through the memo
	.use((_context, next) => runWithRequestMemo(next))
	// name each traced request by its route and count its queries,
	// ahead of the rest so the count includes every other middleware's queries
	.use(traceRequest)
	// the default response headers, set on the way back out so every route includes them. a route that set its own
	// keeps it
	.use(async (context, next) => {
		await next()
		// set each default header the route did not set
		for (const [headerName, headerValue] of Object.entries(DEFAULT_RESPONSE_HEADERS)) {
			if (!context.res.headers.has(headerName)) {
				context.header(headerName, headerValue)
			}
		}
	})
	// check once per process that TRUSTED_PROXIES resolves the x-forwarded-for header, and warn if not
	.use(async (context, next) => {
		checkTrustedProxies(context.req.raw)
		await next()
	})
	// the platform health check. it sits ahead of the api tree, so it never runs the session lookup
	.get("/api/health", (context) => context.json({ status: "ok" }))
	// the deep health check a monitor polls, with one trivial query and no session lookup either
	.get("/api/health/deep", checkDatabaseHealth)
	// an icon request reads one row and never a session, so it sits ahead of the api tree too
	.route("/api", faviconsRoute)
	// the oauth discovery documents an mcp client reads under /.well-known, with or without a path appended. every
	// protected resource path, the topic-bound /mcp/t/:topicId included, reads the one document for /mcp
	.get("/.well-known/oauth-authorization-server", (context) => oauthProviderAuthServerMetadata(auth)(context.req.raw))
	.get("/.well-known/oauth-authorization-server/*", (context) => oauthProviderAuthServerMetadata(auth)(context.req.raw))
	.get("/.well-known/oauth-protected-resource", (context) => toProtectedResourceMetadata(context.req.raw))
	.get("/.well-known/oauth-protected-resource/*", (context) => toProtectedResourceMetadata(context.req.raw))
	// report what a known bot fetched, once the route below has answered: a page, a document, a card, or a feed
	.use("*", trackBotFetches)
	// the tool caller resolves ahead of the limiter, which keys by the user a token names. the wildcard matches /mcp itself
	.use("/mcp/*", async (context, next) => {
		context.set("toolCaller", await resolveToolCaller(context.req.raw))
		await next()
	})
	.use("/mcp/*", toolCallerRateLimiter, defaultBodyLimit)
	.route("/", mcpRoute)
	.route("/", apiRoute)
	// the blog and release pages pass the page guards ahead of their routes
	.on(["GET", "HEAD"], API_PAGE_ROUTE_PATHS, ...PAGE_GUARDS)
	// the release pages and the GitHub webhook that writes the rows they read. the webhook's path comes
	// after /api, so it is mounted ahead of the catch-all below instead of beside the other page routes
	.route("/", releasesRoute)
	// an unmatched /api path is an api failure. a fetch client must read a 404, not fail parsing an HTML page
	.all("/api/*", (context) => context.json({ error: "not found" }, 404))
	// the server-rendered blog and docs pages
	.route("/", contentRoute)
	// the documents built per request, and the redirects from the old /pricing and /topics paths
	.route("/", documentsRoute)
	// the statically built docs site, which owns every /docs path. the docs assets under _astro have a content hash in
	// their name, so they get cached like the ui bundle's
	.on(
		["GET", "HEAD"],
		["/docs", "/docs/*"],
		serveStatic({
			root: DOCS_BUNDLE_ROOT,
			rewriteRequestPath: toDocsFilePath,
			onFound: (_path, context) =>
				setStaticFileCacheControl({ context, isHashedAsset: context.req.path.startsWith("/docs/_astro/") }),
		}),
	)
	// a docs path matching no statically built file gets the docs site's own 404 page
	.on(["GET", "HEAD"], ["/docs", "/docs/*"], async (context) => {
		const notFoundPage = Bun.file(`${DOCS_BUNDLE_ROOT}/404.html`)
		if (!(await notFoundPage.exists())) {
			return context.text("Not found", 404)
		}
		return context.html(await notFoundPage.text(), 404)
	})
	// the statically built Nightshift component browser, which owns every /nightshift path
	.route("/", nightshiftRoute)
	// the built ui's files: hashed assets and whatever vite copied from the public folder
	.on(["GET", "HEAD"], "*", serveStatic({ root: UI_CLIENT_ROOT, onFound: setBundleCacheControl }))
	// every request past this point renders a page with the ui's server, so it passes the page guards here
	.on(["GET", "HEAD"], "*", ...PAGE_GUARDS)
	// redirect a page url that ends in a slash permanently to the url without it, kept on this site
	.on(["GET", "HEAD"], "*", (context, next) => {
		const { pathname, search } = new URL(context.req.url)
		const pagePath = toSameSitePath(pathname.replace(/\/+$/, ""))
		return pathname.length > 1 && pathname.endsWith("/") ? context.redirect(`${pagePath}${search}`, 301) : next()
	})
	// render every other GET as a page with the ui's server
	.on(["GET", "HEAD"], "*", (context) => renderUiPage(context.req.raw))

// redirect a page url with a click id permanently to the url without it, which is the one the edge caches
async function redirectClickIdUrl(context: Context, next: Next): Promise<Response | undefined> {
	// pass a url with no click id on to the page
	const url = new URL(context.req.url)
	const clickIdParameters = [...url.searchParams.keys()].filter((key) => CLICK_ID_PARAMETERS.has(key))
	if (clickIdParameters.length === 0) {
		await next()
		return
	}

	// delete the click ids from the url, and redirect to its path and query kept on this site
	for (const clickIdParameter of clickIdParameters) {
		url.searchParams.delete(clickIdParameter)
	}
	return context.redirect(`${toSameSitePath(url.pathname)}${url.search}`, 301)
}

// the path with its leading slashes collapsed to one, so a path such as //evil.com stays on this site
function toSameSitePath(path: string): string {
	return `/${path.replace(/^\/+/, "")}`
}

/**
 * The file a docs url names. Astro prefixes /docs onto every link it generates but does not nest the build
 * output under it, so the prefix gets removed to resolve a file. A path without a file extension is a page,
 * and every page builds as its own directory's index.html, which is what a url without a trailing slash would otherwise miss.
 */
function toDocsFilePath(path: string): string {
	const filePath = path.slice("/docs".length) || "/"
	return extname(filePath) ? filePath : `${filePath.replace(/\/$/, "")}/index.html`
}

// import the ui's server handler. bun caches the module after the first import, and a bundle that fails to import is
// logged and reported
async function importUiServer(): Promise<UiServerImport> {
	// a bundle that build:ui never wrote is missing
	const uiServerEntryPath = resolve(UI_SERVER_ENTRY)
	if (!(await Bun.file(uiServerEntryPath).exists())) {
		return { status: "missing" }
	}

	// import the handler, and log and report a bundle that throws
	return import(uiServerEntryPath)
		.then((uiServerEntry): UiServerImport => ({ status: "loaded", uiServer: uiServerEntry.default as UiServer }))
		.catch((error: unknown): UiServerImport => {
			console.error("the ui's server bundle failed to import", error)
			reportError(error, "page-render")
			return { status: "failed" }
		})
}

// render a page with the ui's server. a missing bundle is a 404, and a bundle that fails to import or a page rendered
// without a read it needs is a 503
async function renderUiPage(request: Request): Promise<Response> {
	// a missing bundle is a 404 that names build:ui, and a bundle that fails to import responds 503 so a crawler retries
	// it later
	const uiServerImport = await importUiServer()
	if (uiServerImport.status === "missing") {
		return new Response("the ui is not built. run bun run build:ui", { status: 404 })
	}
	if (uiServerImport.status === "failed") {
		return new Response("the ui failed to load", { status: 503 })
	}
	const { uiServer } = uiServerImport

	// shed a visitor's render past the concurrency limit, with a short retry. a signed-in render is never counted or shed.
	// the page guards mark the 503 private
	const isVisitorRender = !getSessionCookie(request)
	const renderConcurrency = toPositiveInteger(Bun.env.RENDER_CONCURRENCY, DEFAULT_RENDER_CONCURRENCY)
	if (isVisitorRender && activeVisitorRenderCount >= renderConcurrency) {
		return new Response("the site is busy, try again in a moment", {
			status: 503,
			headers: { "Retry-After": String(BUSY_RENDER_RETRY_AFTER_SECONDS) },
		})
	}

	// render the page, counting a visitor's render until the ui's server returns the page's headers
	if (isVisitorRender) {
		activeVisitorRenderCount++
	}
	try {
		const page = await uiServer.fetch(request)
		return toRenderedPageResponse(request, page)
	} finally {
		// stop counting the render, whether it returned or threw
		if (isVisitorRender) {
			activeVisitorRenderCount--
		}
	}
}

// copy a rendered page into a response whose headers the page guards may set. a page rendered without a read it needs
// returns a 503 with a Retry-After header
function toRenderedPageResponse(request: Request, page: Response): Response {
	// read and drop the marker of a page rendered without a read it needs
	const pageHeaders = new Headers(page.headers)
	const isDegradedRender = pageHeaders.has(DEGRADED_RENDER_HEADER)
	pageHeaders.delete(DEGRADED_RENDER_HEADER)

	// report a degraded render, and ask the client to retry it
	if (isDegradedRender) {
		pageHeaders.set("Retry-After", String(DEGRADED_RENDER_RETRY_AFTER_SECONDS))
		reportError(new Error("a page rendered without a read it needs"), "page-render", {
			path: new URL(request.url).pathname,
		})
	}
	return new Response(page.body, {
		status: isDegradedRender ? 503 : page.status,
		statusText: isDegradedRender ? "Service Unavailable" : page.statusText,
		headers: pageHeaders,
	})
}

// the protected resource metadata for /mcp, which the mcp plugin serves at its own well-known path through the auth
// handler. a request for any path after it reads the same document
function toProtectedResourceMetadata(request: Request): Promise<Response> {
	return auth.handler(new Request(new URL("/.well-known/oauth-protected-resource", request.url), request))
}

// respond with one trivial query's latency and the pool's counts, or with 503 if the query fails or takes too long.
// a monitor must never read a cached result
async function checkDatabaseHealth(context: Context): Promise<Response> {
	context.header("Cache-Control", NO_STORE_CACHE_CONTROL)
	const startedAt = performance.now()

	// run the query under the time limit, and respond 503 to a failure or a timeout
	try {
		await withTimeLimit({
			work: db.execute(sql`select 1`),
			timeLimitMs: DEEP_HEALTH_TIMEOUT_MS,
			toError: () => new Error("the database took over two seconds"),
		})
	} catch (error) {
		console.error("the deep health check's query failed", error)
		return context.json({ status: "unavailable", pool: readPoolGauges() }, 503)
	}

	// a result responds with the query's latency and the pool's counts
	const databaseLatencyMs = Math.round(performance.now() - startedAt)
	return context.json({ status: "ok", databaseLatencyMs, pool: readPoolGauges() })
}

// log and report an error no route handles, and respond 500 as Hono's own handler does
function reportRouteError(error: Error, context: Context): Response {
	// an HTTPException is the response a route chose, returned as is
	if (error instanceof HTTPException) {
		const response = error.getResponse()
		return context.newResponse(response.body, response)
	}

	// any other error is logged and reported, and the request gets Hono's plain 500
	console.error(error)
	reportError(error, "api-route")
	return context.text("Internal Server Error", 500)
}

// cache a hashed asset for a year, and a public file with the public file headers
function setBundleCacheControl(_path: string, context: Context): void {
	// cache a hashed asset for a year
	const isHashedAsset = context.req.path.startsWith("/assets/")
	if (isHashedAsset) {
		context.header("Cache-Control", IMMUTABLE_CACHE_CONTROL)
		return
	}

	// set the public file headers on every other file
	for (const [headerName, headerValue] of Object.entries(PUBLIC_FILE_HEADERS)) {
		context.header(headerName, headerValue)
	}
}

// Bun serves on the port in PORT, or on 3000 if PORT is unset, and rejects a body past the largest a route accepts.
// in dev, vite forwards /api, /mcp, and the api's own pages and documents to port 3000
export default { fetch: server.fetch, idleTimeout: 120, maxRequestBodySize: MAX_REQUEST_BODY_BYTES }
