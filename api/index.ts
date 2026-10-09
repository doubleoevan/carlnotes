// the server that owns the origin
import { extname, resolve } from "node:path"
import { reportError, startMonitoring } from "@shared/monitoring"
import { startRuntimeGauges } from "@shared/runtimeGauges"
import { oAuthDiscoveryMetadata, oAuthProtectedResourceMetadata } from "better-auth/plugins"
import { sql } from "drizzle-orm"
import type { Context } from "hono"
import { Hono } from "hono"
import { serveStatic } from "hono/bun"
import { HTTPException } from "hono/http-exception"
import { db, readPoolGauges } from "../db"
import { readRedisExtraGauges } from "../db/redis"
import { runWithRequestMemo } from "../db/requestMemo"
import { startTelemetry } from "../worker"
import { apiRoute } from "./api"
import { auth, checkTrustedProxies } from "./auth"
import { PROVIDER_PHOTO_ORIGINS } from "./avatars"
import { trackBotFetches } from "./botAnalytics"
import { contentRoute } from "./content"
import type { AppEnv } from "./currentUser"
import { documentsRoute } from "./documents"
import { setRenderedCacheHeaders } from "./edgeCache"
import { faviconsRoute } from "./favicons"
import { mcpRoute } from "./mcp/server"
import { resolveToolCaller } from "./mcp/toolCaller"
import { toolCallerRateLimiter } from "./rateLimit"
import { releasesRoute } from "./releases"
import { traceRequest } from "./requestTracing"

// where build:docs writes the Starlight site, relative to the repo root the server runs from
const DOCS_BUNDLE_ROOT = "./docs/dist"

// where build:ui writes the client files, relative to the repo root the server runs from
const UI_CLIENT_ROOT = "./ui/dist/client"

// where build:ui writes the ui's server entry, which renders every page no other route serves
const UI_SERVER_ENTRY = "ui/dist/server/server.js"

// how long the deep health check waits for the database before it responds 503
const DEEP_HEALTH_TIMEOUT_MS = 2000

// the ui's server handler, as the server entry exports it
type UiServer = { fetch: (request: Request) => Promise<Response> }

// the ui builds its typed api client from this definition
export type AppType = typeof apiRoute

// start monitoring, then tracing for model calls, in that order so Langfuse keeps its own provider beside Sentry's
startMonitoring()
startTelemetry()

// log the process's connection pool, event loop delay, and Redis gauges once a minute
startRuntimeGauges({ processName: "api", readPoolGauges, readExtraGauges: readRedisExtraGauges })

// the default policy, used unless a route sets its own. images may come from a composer's local preview,
// github, and an avatar's photo host. frames may come from YouTube and Cloudflare's Turnstile challenge
const CONTENT_SECURITY_POLICY = [
	`img-src 'self' blob: data: https://raw.githubusercontent.com ${[...PROVIDER_PHOTO_ORIGINS].join(" ")}`,
	"frame-src 'self' https://www.youtube-nocookie.com https://challenges.cloudflare.com",
	"object-src 'none'",
	"frame-ancestors 'none'",
].join("; ")

// one server serves the api, the pages, and the built ui
const server = new Hono<AppEnv>()
	// report an error no route handles to Sentry, and respond 500 as Hono's own handler does
	.onError(reportRouteError)
	// give each request its own memo, first so every later middleware and route reads through the memo
	.use((_context, next) => runWithRequestMemo(next))
	// name each traced request by its route and count its queries,
	// ahead of the rest so the count includes every other middleware's queries
	.use(traceRequest)
	// the content security policy, set on the way back out so every route includes it. a route that set its own keeps it
	.use(async (context, next) => {
		await next()
		if (!context.res.headers.has("Content-Security-Policy")) {
			context.header("Content-Security-Policy", CONTENT_SECURITY_POLICY)
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
	.use("/mcp/*", toolCallerRateLimiter)
	.route("/", mcpRoute)
	.route("/", apiRoute)
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
	// redirect a page url that ends in a slash permanently to the url without it. the leading slashes collapse to
	// one, so the redirect stays on this site
	.on(["GET", "HEAD"], "*", (context, next) => {
		const { pathname, search } = new URL(context.req.url)
		const pagePath = `/${pathname.replace(/^\/+|\/+$/g, "")}`
		return pathname.length > 1 && pathname.endsWith("/") ? context.redirect(`${pagePath}${search}`, 301) : next()
	})
	// render every other GET as a page with the ui's server
	.on(["GET", "HEAD"], "*", (context) => renderUiPage(context.req.raw))

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

	// render the page. the browser revalidates every time, and the edge shares a signed-out page for a minute
	const page = await uiServer.fetch(request)
	const response = new Response(page.body, { status: page.status, statusText: page.statusText, headers: page.headers })
	setRenderedCacheHeaders(request, response)
	return response
}

// respond with one trivial query's latency and the pool's counts, or with 503 if the query fails or takes too long.
// a monitor must never read a cached result
async function checkDatabaseHealth(context: Context): Promise<Response> {
	context.header("Cache-Control", "no-store")
	const startedAt = performance.now()

	// the query, or a failure once the time limit passes, whichever comes first
	let timeLimitTimer: ReturnType<typeof setTimeout> | undefined
	const timeLimit = new Promise<never>((_resolve, reject) => {
		timeLimitTimer = setTimeout(() => reject(new Error("the database took over two seconds")), DEEP_HEALTH_TIMEOUT_MS)
	})

	// a failure or a timeout responds 503, and the time limit's timer is cleared however the query ends
	try {
		await Promise.race([db.execute(sql`select 1`), timeLimit])
	} catch (error) {
		console.error("the deep health check's query failed", error)
		return context.json({ status: "unavailable", pool: readPoolGauges() }, 503)
	} finally {
		clearTimeout(timeLimitTimer)
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

// a hashed filename never changes contents, so it caches for a year
function setBundleCacheControl(_path: string, context: Context): void {
	const isHashedAsset = context.req.path.startsWith("/assets/")
	context.header("Cache-Control", isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache")
}

// Bun serves on the port in PORT, or on 3000 if PORT is unset.
// in dev, vite forwards /api, /mcp, and the api's own pages and documents to port 3000
export default { fetch: server.fetch, idleTimeout: 120 }
