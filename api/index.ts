// the server that owns the origin. it composes the api tree, the page routes, and the built ui into one fetch handler
import { startMonitoring } from "@shared/monitoring"
import { type Context, Hono } from "hono"
import { serveStatic } from "hono/bun"
import { compress } from "hono/compress"
import { startTelemetry } from "../worker"
import { apiRoute } from "./api"
import { contentRoute } from "./content"
import { pagesRoute, UI_BUNDLE_ROOT } from "./pages"

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
	// the bundle itself: hashed assets, the app shell, and whatever vite copied from the public folder
	.on(["GET", "HEAD"], "*", serveStatic({ root: UI_BUNDLE_ROOT, onFound: setBundleCacheControl }))
	// a client-routed path is not a file, so it gets the app shell, and the router resolves it.
	// without a bundle built, this finds nothing and falls through to a 404, which is the normal state in dev
	.on(["GET", "HEAD"], "*", serveStatic({ path: `${UI_BUNDLE_ROOT}/index.html`, onFound: setBundleCacheControl }))

// a hashed filename never changes contents, so it caches for a year. everything else must revalidate to pick up a new bundle
function setBundleCacheControl(_path: string, context: Context): void {
	const isHashedAsset = context.req.path.startsWith("/assets/")
	context.header("Cache-Control", isHashedAsset ? "public, max-age=31536000, immutable" : "no-cache")
}

// in dev this runs on port 3000 and vite forwards /api to it. in prod, one service serves both the ui and the api.
// Bun's 10-second idle default would drop a quiet streaming chat turn, so idleTimeout matches the model timeout
export default { port: 3000, fetch: server.fetch, idleTimeout: 120 }
