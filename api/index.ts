// the server that owns the origin
import { extname } from "node:path"
import { startMonitoring } from "@shared/monitoring"
import { type Context, Hono } from "hono"
import { serveStatic } from "hono/bun"
import { compress } from "hono/compress"
import { startTelemetry } from "../worker"
import { apiRoute } from "./api"
import { reportForwardedChain } from "./auth"
import { contentRoute } from "./content"
import { pagesRoute, UI_BUNDLE_ROOT } from "./pages"

// where build:docs writes the Starlight site, relative to the repo root the server runs from
const DOCS_BUNDLE_ROOT = "./docs/dist"

// the ui builds its typed api client from this definition
export type AppType = typeof apiRoute

// start error monitoring, analytics tracking
startMonitoring()
startTelemetry()

// the policy every response includes. img-src limits images to this origin,
// and blob: is the local file a composer previews before it is uploaded
const CONTENT_SECURITY_POLICY =
	"img-src 'self' blob: data:; frame-src 'self' https://www.youtube-nocookie.com; object-src 'none'; frame-ancestors 'none'"

// one server serves the api, the pages, and the built ui
const server = new Hono()
	// gzip every text response over a kilobyte. the defaults skip images and anything already compressed
	.use(compress())
	// the content security policy, set on the way back out so every route includes it
	.use(async (context, next) => {
		await next()
		context.header("Content-Security-Policy", CONTENT_SECURITY_POLICY)
	})
	// one report of the forwarded chain, which names the proxies TRUSTED_PROXIES needs. a no-op once this is set
	.use(async (context, next) => {
		reportForwardedChain(context.req.header("x-forwarded-for") ?? null)
		await next()
	})
	// the platform health check. it sits ahead of the api tree, so it never runs the session lookup
	.get("/api/health", (context) => context.json({ status: "ok" }))
	.route("/", apiRoute)
	// an unmatched /api path is an api failure. a fetch client must read a 404, not fail parsing an HTML page
	.all("/api/*", (context) => context.json({ error: "not found" }, 404))
	// the server-rendered blog and docs pages
	.route("/", contentRoute)
	// the app's own pages and documents that are built per request, so a crawler gets real tags and headers
	.route("/", pagesRoute)
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
	// the bundle itself: hashed assets, the app shell, and whatever vite copied from the public folder
	.on(["GET", "HEAD"], "*", serveStatic({ root: UI_BUNDLE_ROOT, onFound: setBundleCacheControl }))
	// a client-routed path is not a file, so it gets the app shell, and the router resolves it
	.on(["GET", "HEAD"], "*", serveStatic({ path: `${UI_BUNDLE_ROOT}/index.html`, onFound: setBundleCacheControl }))

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

// a hashed filename never changes contents, so it caches for a year
function setBundleCacheControl(_path: string, context: Context): void {
	const isHashedAsset = context.req.path.startsWith("/assets/")
	context.header("Cache-Control", isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache")
}

// in dev this runs on port 3000 and vite forwards /api to it
export default { port: 3000, fetch: server.fetch, idleTimeout: 120 }
