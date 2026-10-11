// the server that owns the origin
import { extname, resolve } from "node:path"
import { reportError, startMonitoring } from "@shared/monitoring"
import { startRuntimeGauges } from "@shared/runtimeGauges"
import { withTimeLimit } from "@shared/time"
import { getSessionCookie } from "better-auth/cookies"
import { oAuthDiscoveryMetadata, oAuthProtectedResourceMetadata } from "better-auth/plugins"
import { sql } from "drizzle-orm"
import type { Context, Next } from "hono"
import { Hono } from "hono"
import { serveStatic } from "hono/bun"
import { HTTPException } from "hono/http-exception"
import { db, readPoolGauges, sizeConnectionPool, toPositiveInteger } from "../db"
import { readRedisExtraGauges } from "../db/redisGauges"
import { runWithRequestMemo } from "../db/requestMemo"
import { startTelemetry } from "../worker"
import { apiRoute } from "./api"
import { auth } from "./auth"
import { PROVIDER_PHOTO_ORIGINS } from "./avatars"
import { defaultBodyLimit } from "./bodyLimit"
import { trackBotFetches } from "./botAnalytics"
import { contentRoute } from "./content"
import type { AppEnv } from "./currentUser"
import { documentsRoute } from "./documents"
import { RENDERED_CACHE_TAG, renderedCacheHeaders } from "./edgeCache"
import { faviconsRoute } from "./favicons"
import { mcpRoute } from "./mcp/server"
import { resolveToolCaller } from "./mcp/toolCaller"
import { pageRenderRateLimiter, toolCallerRateLimiter } from "./rateLimit"
import { releasesRoute } from "./releases"
import { traceRequest } from "./requestTracing"
import { checkTrustedProxies } from "./trustedProxies"

// where build:docs writes the Starlight site, relative to the repo root the server runs from
const DOCS_BUNDLE_ROOT = "./docs/dist"

// where build:ui writes the client files, relative to the repo root the server runs from
const UI_CLIENT_ROOT = "./ui/dist/client"

// where build:ui writes the ui's server entry, which renders every page no other route serves
const UI_SERVER_ENTRY = "ui/dist/server/server.js"

// how long the deep health check waits for the database before it responds 503
const DEEP_HEALTH_TIMEOUT_MS = 2000

// the largest request body the server reads, above the largest any route accepts: a chat turn's 26 megabytes
const MAX_REQUEST_BODY_BYTES = 32 * 1024 * 1024

// how many visitor pages this replica renders at once unless RENDER_CONCURRENCY sets it. a visitor's render past it is
// shed
const DEFAULT_RENDER_CONCURRENCY = 16

// how long the browser waits before retrying a shed render, in seconds
const RENDER_RETRY_AFTER_SECONDS = "2"

// how long the browser and the edge keep an unhashed public file, such as the hero image and the icons
const PUBLIC_FILE_CACHE_CONTROL = "public, max-age=3600"
const PUBLIC_FILE_EDGE_CACHE_CONTROL = "max-age=86400"

// the per-click ids that ad and social platforms append to a shared link
const PER_CLICK_QUERY_KEYS = new Set([
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
const API_PAGE_ROUTE_PATHS = ["/blog", "/blog/:slug", "/releases", "/releases/:tag"]

// how many visitor pages this replica is rendering now
let activeVisitorRenderCount = 0

// the ui's server handler, as the server entry exports it
type UiServer = { fetch: (request: Request) => Promise<Response> }

// the ui builds its typed api client from this definition
export type AppType = typeof apiRoute

// start monitoring, then tracing for model calls, in that order so Langfuse keeps its own provider beside Sentry's.
// then size the connection pool from the database
startMonitoring()
startTelemetry()
await sizeConnectionPool()

// log the process's connection pool, event loop delay, and Redis gauges once a minute
startRuntimeGauges({ processName: "api", readPoolGauges, readExtraGauges: readRedisExtraGauges })

// the default policy, used unless a route sets its own. images may come from a composer's local preview,
// github, and an avatar's photo host. frames may come from YouTube and Cloudflare's Turnstile challenge.
// a base url and a form's action stay on this origin
const CONTENT_SECURITY_POLICY = [
	`img-src 'self' blob: data: https://raw.githubusercontent.com ${[...PROVIDER_PHOTO_ORIGINS].join(" ")}`,
	"frame-src 'self' https://www.youtube-nocookie.com https://challenges.cloudflare.com",
	"object-src 'none'",
	"frame-ancestors 'none'",
	"base-uri 'self'",
	"form-action 'self'",
].join("; ")

// the headers every response includes beside the policy: the referrer a cross-origin link sees is the origin alone,
// and a browser never sniffs a response's type
const BASELINE_RESPONSE_HEADERS = {
	"Referrer-Policy": "strict-origin-when-cross-origin",
	"X-Content-Type-Options": "nosniff",
}

// one server serves the api, the pages, and the built ui
const server = new Hono<AppEnv>()
	// report an error no route handles to Sentry, and respond 500 as Hono's own handler does
	.onError(reportRouteError)
	// give each request its own memo, first so every later middleware and route reads through the memo
	.use((_context, next) => runWithRequestMemo(next))
	// name each traced request by its route and count its queries,
	// ahead of the rest so the count includes every other middleware's queries
	.use(traceRequest)
	// the content security policy and the baseline headers, set on the way back out so every route includes them.
	// a route that set its own keeps it
	.use(async (context, next) => {
		await next()
		// the policy, unless the route set its own
		if (!context.res.headers.has("Content-Security-Policy")) {
			context.header("Content-Security-Policy", CONTENT_SECURITY_POLICY)
		}
		// the baseline headers, each unless the route set its own
		for (const [headerName, headerValue] of Object.entries(BASELINE_RESPONSE_HEADERS)) {
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
	// the oauth discovery documents an mcp client reads under /.well-known, with or without a path appended
	.get("/.well-known/oauth-authorization-server", (context) => oAuthDiscoveryMetadata(auth)(context.req.raw))
	.get("/.well-known/oauth-authorization-server/*", (context) => oAuthDiscoveryMetadata(auth)(context.req.raw))
	.get("/.well-known/oauth-protected-resource", (context) => oAuthProtectedResourceMetadata(auth)(context.req.raw))
	.get("/.well-known/oauth-protected-resource/*", (context) => oAuthProtectedResourceMetadata(auth)(context.req.raw))
	// report what a known bot fetched, once the route below has answered: a page, a document, a card, or a feed
	.use("*", trackBotFetches)
	// the tool caller resolves ahead of the limiter, which keys by the user a token names. the wildcard matches /mcp itself
	.use("/mcp/*", async (context, next) => {
		context.set("toolCaller", await resolveToolCaller(context.req.raw.headers))
		await next()
	})
	.use("/mcp/*", toolCallerRateLimiter, defaultBodyLimit)
	.route("/", mcpRoute)
	.route("/", apiRoute)
	// the blog and release pages pass the page guards ahead of their routes: the rendered cache headers, the page render
	// limit, and the per-click redirect
	.on(["GET", "HEAD"], API_PAGE_ROUTE_PATHS, renderedCacheHeaders, pageRenderRateLimiter, redirectPerClickUrl)
	// the release pages and the GitHub webhook that writes the rows they read. the webhook's path comes
	// after /api, so it is mounted ahead of the catch-all below instead of beside the other page routes
	.route("/", releasesRoute)
	// an unmatched /api path is an api failure. a fetch client must read a 404, not fail parsing an HTML page
	.all("/api/*", (context) => context.json({ error: "not found" }, 404))
	// the server-rendered blog and docs pages
	.route("/", contentRoute)
	// the documents built per request, and the redirects from the old /pricing and /topics paths
	.route("/", documentsRoute)
	// the statically built docs site, which owns every /docs path
	.on(
		["GET", "HEAD"],
		["/docs", "/docs/*"],
		serveStatic({ root: DOCS_BUNDLE_ROOT, rewriteRequestPath: toDocsFilePath, onFound: setDocsCacheControl }),
	)
	// a docs path matching no statically built file gets the docs site's own 404 page
	.on(["GET", "HEAD"], ["/docs", "/docs/*"], async (context) => {
		const notFoundPage = Bun.file(`${DOCS_BUNDLE_ROOT}/404.html`)
		if (!(await notFoundPage.exists())) {
			return context.text("Not found", 404)
		}
		return context.html(await notFoundPage.text(), 404)
	})
	// the built ui's files: hashed assets and whatever vite copied from the public folder
	.on(["GET", "HEAD"], "*", serveStatic({ root: UI_CLIENT_ROOT, onFound: setBundleCacheControl }))
	// every request past this point renders a page with the ui's server, so it passes the page guards here
	.on(["GET", "HEAD"], "*", renderedCacheHeaders, pageRenderRateLimiter, redirectPerClickUrl)
	// redirect a page url that ends in a slash permanently to the url without it. the leading slashes collapse to
	// one, so the redirect stays on this site
	.on(["GET", "HEAD"], "*", (context, next) => {
		const { pathname, search } = new URL(context.req.url)
		const pagePath = `/${pathname.replace(/^\/+|\/+$/g, "")}`
		return pathname.length > 1 && pathname.endsWith("/") ? context.redirect(`${pagePath}${search}`, 301) : next()
	})
	// render every other GET as a page with the ui's server
	.on(["GET", "HEAD"], "*", (context) => renderUiPage(context.req.raw))

// redirect a page url with a per-click id permanently to the url without it, which is the one the edge caches
async function redirectPerClickUrl(context: Context, next: Next): Promise<Response | undefined> {
	// a url with no per-click id goes on to the page
	const pathWithoutPerClickIds = toPathWithoutPerClickIds(new URL(context.req.url))
	if (!pathWithoutPerClickIds) {
		await next()
		return
	}
	return context.redirect(pathWithoutPerClickIds, 301)
}

// the url's path and query without its per-click ids, kept on this site, or null if it has none
function toPathWithoutPerClickIds(url: URL): string | null {
	// find the per-click keys, and return null if there are none
	const perClickKeys = [...url.searchParams.keys()].filter((key) => PER_CLICK_QUERY_KEYS.has(key))
	if (perClickKeys.length === 0) {
		return null
	}

	// drop them from a copy of the url, and collapse the leading slashes so a path such as //evil.com stays on this site
	const urlWithoutPerClickIds = new URL(url)
	for (const key of perClickKeys) {
		urlWithoutPerClickIds.searchParams.delete(key)
	}
	return `/${urlWithoutPerClickIds.pathname.replace(/^\/+/, "")}${urlWithoutPerClickIds.search}`
}

// how many visitor pages this replica renders at once, from RENDER_CONCURRENCY or the default
function toRenderConcurrency(): number {
	return toPositiveInteger(Bun.env.RENDER_CONCURRENCY, DEFAULT_RENDER_CONCURRENCY)
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

// the docs assets under _astro have a content hash in their name, so they get cached like the ui bundle's
function setDocsCacheControl(_path: string, context: Context): void {
	const isHashedAsset = context.req.path.startsWith("/docs/_astro/")
	context.header("Cache-Control", isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache")
}

// render a page with the ui's server. a missing bundle is a 404, and a bundle that fails to import is a 503
async function renderUiPage(request: Request): Promise<Response> {
	// a missing bundle is a 404 that names build:ui
	const uiServerEntryPath = resolve(UI_SERVER_ENTRY)
	if (!(await Bun.file(uiServerEntryPath).exists())) {
		return new Response("the ui is not built. run bun run build:ui", { status: 404 })
	}

	// import the ui's server handler. bun caches the module after the first import. a bundle that fails to import is
	// reported, and the page responds 503 so a crawler retries it later
	const uiServer = await import(uiServerEntryPath)
		.then((uiServerEntry) => uiServerEntry.default as UiServer)
		.catch((error: unknown) => {
			console.error("the ui's server bundle failed to import", error)
			reportError(error, "page-render")
			return null
		})
	// respond 503 if the import failed
	if (!uiServer) {
		return new Response("the ui failed to load", { status: 503 })
	}

	// shed a visitor's render past the concurrency limit, with a short retry. a signed-in render is never counted or shed
	const isVisitorRender = !getSessionCookie(request)
	if (isVisitorRender && activeVisitorRenderCount >= toRenderConcurrency()) {
		return new Response("the site is busy, try again in a moment", {
			status: 503,
			headers: { "Retry-After": RENDER_RETRY_AFTER_SECONDS, "Cache-Control": "private, no-cache" },
		})
	}

	// render the page, counting a visitor's render until the ui's server returns the page's headers
	if (isVisitorRender) {
		activeVisitorRenderCount++
	}
	try {
		// copy the page into a response whose headers the page guards may set
		const page = await uiServer.fetch(request)
		return new Response(page.body, { status: page.status, statusText: page.statusText, headers: page.headers })
	} finally {
		// the render is done, whether it returned or threw
		if (isVisitorRender) {
			activeVisitorRenderCount--
		}
	}
}

// respond with one trivial query's latency and the pool's counts, or with 503 if the query fails or takes too long.
// a monitor must never read a cached result
async function checkDatabaseHealth(context: Context): Promise<Response> {
	context.header("Cache-Control", "no-store")
	const startedAt = performance.now()

	// the query under the time limit, where a failure or a timeout responds 503
	try {
		await withTimeLimit(
			db.execute(sql`select 1`),
			DEEP_HEALTH_TIMEOUT_MS,
			() => new Error("the database took over two seconds"),
		)
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

// cache a hashed asset for a year, and a public file for an hour in the browser and a day at the edge under the
// rendered tag
function setBundleCacheControl(_path: string, context: Context): void {
	// the hashed assets
	const isHashedAsset = context.req.path.startsWith("/assets/")
	if (isHashedAsset) {
		context.header("Cache-Control", "public, max-age=31536000, immutable")
		return
	}

	// the public files
	context.header("Cache-Control", PUBLIC_FILE_CACHE_CONTROL)
	context.header("CDN-Cache-Control", PUBLIC_FILE_EDGE_CACHE_CONTROL)
	context.header("Cache-Tag", RENDERED_CACHE_TAG)
}

// Bun serves on the port in PORT, or on 3000 if PORT is unset, and rejects a body past the largest a route accepts.
// in dev, vite forwards /api, /mcp, and the api's own pages and documents to port 3000
export default { fetch: server.fetch, idleTimeout: 120, maxRequestBodySize: MAX_REQUEST_BODY_BYTES }
