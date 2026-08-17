// the server that owns the origin. it composes the api tree, the page routes, the statically built docs, and the built ui into one fetch handler
import { extname } from "node:path"
import { startMonitoring } from "@shared/monitoring"
import { type Context, Hono } from "hono"
import { serveStatic } from "hono/bun"
import { compress } from "hono/compress"
import { startTelemetry } from "../worker"
import { apiRoute } from "./api"
import { contentRoute } from "./content"
import { pagesRoute, UI_BUNDLE_ROOT } from "./pages"

// where build:docs writes the Starlight site, relative to the repo root the server runs from
const DOCS_BUNDLE_ROOT = "./docs/dist"

// the ui builds its typed api client from this definition
export type AppType = typeof apiRoute

// start error monitoring, analytics tracking, and model-call tracing before the api starts serving
// all are no-op without their keys set as environment variables
startMonitoring()
startTelemetry()

// one server serves the api, the pages, and the built ui. a request tries these in order and stops at the first one that answers.
// anything that falls through all of them gets the SPA
const server = new Hono()
	// gzip every text response over a kilobyte. the defaults skip images and anything already compressed
	.use(compress())
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
	// a docs path matching no statically built file gets the docs site's own 404 page.
	// it must answer here instead of falling through, or a mistyped docs url would render the app shell
	.on(["GET", "HEAD"], ["/docs", "/docs/*"], async (context) => {
		const notFoundPage = Bun.file(`${DOCS_BUNDLE_ROOT}/404.html`)
		if (!(await notFoundPage.exists())) {
			return context.text("Not found", 404)
		}
		return context.html(await notFoundPage.text(), 404)
	})
	// the bundle itself: hashed assets, the app shell, and whatever vite copied from the public folder
	.on(["GET", "HEAD"], "*", serveStatic({ root: UI_BUNDLE_ROOT, onFound: setBundleCacheControl }))
	// a client-routed path is not a file, so it gets the app shell, and the router resolves it.
	// without a bundle built, this finds nothing and falls through to a 404, which is the normal state in dev
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

// the docs assets under _astro have a content hash in their name, so they get cached like the ui bundle's.
// a page and the search index keep their names across builds, so they must revalidate to pick up updated docs
function setDocsCacheControl(_path: string, context: Context): void {
	const isHashedAsset = context.req.path.startsWith("/docs/_astro/")
	context.header("Cache-Control", isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache")
}

// a hashed filename never changes contents, so it caches for a year. everything else must revalidate to pick up a new bundle
function setBundleCacheControl(_path: string, context: Context): void {
	const isHashedAsset = context.req.path.startsWith("/assets/")
	context.header("Cache-Control", isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache")
}

// in dev this runs on port 3000 and vite forwards /api to it. in prod, one service serves both the ui and the api.
// Bun's 10-second idle default would drop a quiet streaming chat turn, so idleTimeout matches the model timeout
export default { port: 3000, fetch: server.fetch, idleTimeout: 120 }
