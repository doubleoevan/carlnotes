// the server that owns the origin
import { extname } from "node:path"
import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider"
import { withTimeLimit } from "@carlnotes/contracts/time"
import { connectionPool, db, readPoolGauges, sizeConnectionPool } from "@carlnotes/db"
import { PersonalSourcesConversionError } from "@carlnotes/db/personalSourcesLocks"
import { runWithRequestMemo, runWithRowMemo } from "@carlnotes/db/requestMemo"
import { FetchedSourceLimitError } from "@carlnotes/db/topicSourceCapacity"
import { shutdownTelemetry, startTelemetry } from "@carlnotes/models/telemetry"
import { shutdownAnalytics } from "@carlnotes/server/analytics"
import { reportError, shutdownMonitoring, startMonitoring } from "@carlnotes/server/monitoring"
import { validatePersonalSourcesEmailSettings } from "@carlnotes/server/personalSourcesSettings"
import { startRuntimeGauges } from "@carlnotes/server/runtimeGauges"
import { readSuggestedReplyChats } from "@carlnotes/server/suggestedReplySettings"
import { sql } from "drizzle-orm"
import type { Context, Next } from "hono"
import { Hono } from "hono"
import { serveStatic } from "hono/bun"
import { HTTPException } from "hono/http-exception"
import { apiRoute } from "./api"
import { readApiExtraGauges } from "./apiGauges"
import { appVersionGate } from "./appVersionGate"
import { auth } from "./auth"
import { PROVIDER_PHOTO_ORIGINS } from "./avatars"
import { defaultBodyLimit } from "./bodyLimit"
import { trackBotFetches } from "./botAnalytics"
import { DOCS_BUNDLE_ROOT, UI_CLIENT_ROOT } from "./bundlePaths"
import { BLOG_INDEX_PATH, BLOG_PAGE_PATH, contentRoute } from "./content"
import { FRAME_SOURCE_DIRECTIVE, toContentSecurityPolicy } from "./contentSecurityPolicy"
import type { AppEnv } from "./currentUser"
import { documentsRoute } from "./documents"
import { drain, isDraining, readDrainSettings, rememberListeningServer } from "./drain"
import {
	IMMUTABLE_CACHE_CONTROL,
	NO_STORE_CACHE_CONTROL,
	PUBLIC_FILE_HEADERS,
	renderedCacheHeaders,
	setStaticFileCacheControl,
} from "./edgeCache"
import { faviconsRoute } from "./favicons"
import { validateMcpOrigin } from "./mcp/origins"
import { mcpRoute } from "./mcp/server"
import { resolveToolCaller } from "./mcp/toolCaller"
import { nightshiftRoute } from "./nightshift"
import { readApiProcessName } from "./processName"
import { mcpRateLimiter, pageRenderRateLimiter } from "./rateLimit"
import { RELEASE_PATH, RELEASES_PATH, releasesRoute } from "./releases"
import { traceRequest } from "./requestTracing"
import { checkTrustedProxies, toAuthRequest } from "./trustedProxies"
import { checkRenderReadiness, importUiServerAtStartup, renderUiPage } from "./uiServer"

// how long the deep health check waits for the database before it responds 503
const DEEP_HEALTH_TIMEOUT_MS = 2000

// how long one deep health result is shared by every check that reads it, so a flood of checks sends one query a second
const DEEP_HEALTH_SHARE_MS = 1000

// what one deep health query found: the database's latency, or that it failed
type DeepHealthResult = { status: "ok"; databaseLatencyMs: number } | { status: "unavailable" }

// the deep health result read in the last second, and when its query started
let sharedDeepHealth: { startedAt: number; deepHealthResult: Promise<DeepHealthResult> } | null = null

// the largest request body the server reads, above CHAT_BODY_LIMIT_BYTES, the largest any route accepts
const MAX_REQUEST_BODY_BYTES = 32 * 1024 * 1024

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
	"_hsenc",
	"_hsmi",
	"mkt_tok",
	"_bhlid",
	"ck_subscriber_id",
	"yclid",
])

// the page routes the api renders itself instead of the ui's server: the blog and the release pages. each names its
// route exactly, so a request passes the page guards once
const API_PAGE_ROUTE_PATHS = [BLOG_INDEX_PATH, BLOG_PAGE_PATH, RELEASES_PATH, RELEASE_PATH]

// the ui builds its typed api client from this definition
export type AppType = typeof apiRoute

// the name this process runs under: api for the app service, and web for the web service, which starts this same entry
const processName = readApiProcessName()

// a typo in the suggested reply's rollout setting fails the start, where a deploy shows it, instead of every chat load
readSuggestedReplyChats()

// start monitoring, then tracing for model calls, in that order so Langfuse keeps its own provider beside Sentry's.
// then size the connection pool from the database, at the one pool share an api or a web replica takes
startMonitoring()
startTelemetry()
validatePersonalSourcesEmailSettings()
await sizeConnectionPool()

// load the ui's server build before serving. a production boot that cannot load it exits here
await importUiServerAtStartup()

// log the process's connection pool, event loop delay, Redis gauges, and page render counts once a minute, under its
// own name
startRuntimeGauges({ processName, readPoolGauges, readExtraGauges: readApiExtraGauges })

// the hosts the Specials map loads its images from
const GOOGLE_MAPS_IMAGE_ORIGINS =
	"https://*.googleapis.com https://*.gstatic.com https://*.google.com https://*.googleusercontent.com"

// the default policy, used unless a route sets its own. images may come from a composer's local preview,
// github, an avatar's photo host, and Google Maps' tiles, icons, and cursors. frames may come from the shared frame
// sources
const CONTENT_SECURITY_POLICY = toContentSecurityPolicy([
	`img-src 'self' blob: data: https://raw.githubusercontent.com ${GOOGLE_MAPS_IMAGE_ORIGINS} ${[...PROVIDER_PHOTO_ORIGINS].join(" ")}`,
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
	// give each request its own memo, first so every later middleware and route reads through the memo, and a GET
	// request, which only reads, a memo of the rows it read by id too
	.use((context, next) => runWithRequestMemo(() => (context.req.method === "GET" ? runWithRowMemo(next) : next())))
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
	// respond 404 to a path with a NUL byte, ahead of every route that would send the byte to Postgres
	.use(rejectNulBytePath)
	// check once per process that TRUSTED_PROXIES resolves the x-forwarded-for header, and warn if not
	.use(async (context, next) => {
		checkTrustedProxies(context.req.raw)
		await next()
	})
	// the platform health check. it sits ahead of the api tree, so it never runs the session lookup. its body names
	// the process, which says whether the app service or the web service served a path
	.get("/api/health", (context) => context.json({ status: "ok", process: processName }))
	// the deep health check a monitor polls, with one trivial query and no session lookup either
	.get("/api/health/deep", checkDatabaseHealth)
	// the readiness check the platform polls to route traffic to a replica. it renders a page with no database
	.get("/api/health/ready", checkReadiness)
	// an outdated build is told to update on every api path after the health checks, ahead of the session lookup
	.use("/api/*", appVersionGate)
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
	// reject foreign browser origins on the transport endpoints before resolving the caller or counting a request
	.use("/mcp", validateMcpOrigin)
	.use("/mcp/t/:topicId", validateMcpOrigin)
	// the tool caller resolves ahead of the limiter, which keys by the user a token names. the wildcard matches /mcp itself
	.use("/mcp/*", async (context, next) => {
		context.set("toolCaller", await resolveToolCaller(context.req.raw))
		await next()
	})
	// bound the body first, because the limiter reads it to count a tool call apart from a protocol message
	.use("/mcp/*", defaultBodyLimit, mcpRateLimiter)
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
	// the documents built per request, and the redirect from the old /pricing path
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
	// a bundle file the build does not have is a plain 404, never a rendered page, so a stale asset url costs no render
	.on(["GET", "HEAD"], "/assets/*", (context) => context.text("Not found", 404))
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

// respond with a json 404 to a path with a NUL byte, percent-encoded or decoded. Postgres rejects the byte in a text
// value
async function rejectNulBytePath(context: Context, next: Next): Promise<Response | undefined> {
	if (new URL(context.req.url).pathname.includes("%00") || context.req.path.includes("\0")) {
		return context.json({ error: "not found" }, 404)
	}
	await next()
}

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

// the protected resource metadata for /mcp, which the mcp plugin serves at its own well-known path through the auth
// handler. a request for any path after it reads the same document
function toProtectedResourceMetadata(request: Request): Promise<Response> {
	return auth.handler(toAuthRequest(request, new URL("/.well-known/oauth-protected-resource", request.url)))
}

// respond with one trivial query's latency and the connection pool's counts, or with 503 if the query fails or takes too long.
// the checks in one second share one query's result inside this process
async function checkDatabaseHealth(context: Context): Promise<Response> {
	context.header("Cache-Control", NO_STORE_CACHE_CONTROL)

	// start a query if the shared result is a second old, and respond with the result and the connection pool's counts now
	const now = performance.now()
	if (!sharedDeepHealth || now - sharedDeepHealth.startedAt >= DEEP_HEALTH_SHARE_MS) {
		sharedDeepHealth = { startedAt: now, deepHealthResult: queryDeepHealth() }
	}
	const deepHealthResult = await sharedDeepHealth.deepHealthResult
	return context.json({ ...deepHealthResult, pool: readPoolGauges() }, deepHealthResult.status === "ok" ? 200 : 503)
}

// run the trivial query under the time limit, and return its latency, or that it failed or timed out
async function queryDeepHealth(): Promise<DeepHealthResult> {
	const startedAt = performance.now()
	try {
		await withTimeLimit({
			work: db.execute(sql`select 1`),
			timeLimitMs: DEEP_HEALTH_TIMEOUT_MS,
			toError: () => new Error("the database took over two seconds"),
		})
	} catch (error) {
		console.error("the deep health check's query failed", error)
		return { status: "unavailable" }
	}
	return { status: "ok", databaseLatencyMs: Math.round(performance.now() - startedAt) }
}

/**
 * Drops the shared deep health result, so the next check runs its own query.
 */
export function clearSharedDeepHealth(): void {
	sharedDeepHealth = null
}

// respond 200 if the ui's server renders a page, or 503 with the reason. a draining replica responds 503 at once, so
// the platform routes no new request to it. the response is never cached
async function checkReadiness(context: Context): Promise<Response> {
	context.header("Cache-Control", NO_STORE_CACHE_CONTROL)
	if (isDraining()) {
		return context.json({ status: "draining" }, 503)
	}
	const renderReadiness = await checkRenderReadiness()
	return context.json(renderReadiness, renderReadiness.status === "ok" ? 200 : 503)
}

// log and report an error no route handles, and respond 500 as Hono's own handler does
function reportRouteError(error: Error, context: Context): Response {
	// report expected privacy and Source-limit conflicts without sending private request bodies to monitoring
	if (error instanceof PersonalSourcesConversionError || error instanceof FetchedSourceLimitError) {
		return context.json({ error: error.message }, 409)
	}
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

// send the reports, events, and spans the process has buffered, then close the connection pool. each flush settles by
// itself, so one that fails never keeps the others from sending
async function flushProcess(): Promise<void> {
	await Promise.allSettled([shutdownTelemetry(), shutdownAnalytics(), shutdownMonitoring()])
	await connectionPool.end().catch(() => undefined)
}

// the platform stops a replica with SIGTERM on every deploy. drain it, so a request in flight finishes and a stream's
// client reconnects elsewhere, then exit. the api and the web service both start this entry, and a test that imports
// it installs no handler
if (import.meta.main) {
	process.once("SIGTERM", () => {
		void drain({ ...readDrainSettings(), flush: flushProcess }).finally(() => process.exit(0))
	})
}

// the server Bun passes with each request, as far as the entry reads it
type BunServer = Parameters<typeof rememberListeningServer>[0]

// Bun serves on the port in PORT, or on 3000 if PORT is unset, and rejects a body past the largest a route accepts.
// in dev, vite forwards /api, /mcp, and the api's own pages and documents to port 3000. each request names the server
// that listens, which a drain stops
export default {
	fetch: (request: Request, bunServer?: BunServer): Response | Promise<Response> => {
		rememberListeningServer(bunServer)
		return server.fetch(request, bunServer)
	},
	idleTimeout: 120,
	maxRequestBodySize: MAX_REQUEST_BODY_BYTES,
}
