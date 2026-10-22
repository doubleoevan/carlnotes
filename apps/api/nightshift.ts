// the route that serves the built Nightshift component browser, a static Storybook, at /nightshift/
import type { Context } from "hono"
import { Hono } from "hono"
import { serveStatic } from "hono/bun"
import { etag } from "hono/etag"
import { NIGHTSHIFT_BUNDLE_ROOT } from "./bundlePaths"
import { FRAME_SOURCE_DIRECTIVE, toContentSecurityPolicy } from "./contentSecurityPolicy"
import { setStaticFileCacheControl } from "./edgeCache"
import { NOINDEX_HEADER } from "./responseHeaders"

// the component browser's own policy. Storybook's manager frames its preview, iframe.html, from this origin, which the
// default policy's frame-ancestors 'none' would block. a story frames the same sources as the app
export const NIGHTSHIFT_CONTENT_SECURITY_POLICY = toContentSecurityPolicy([
	FRAME_SOURCE_DIRECTIVE,
	"frame-ancestors 'self'",
])

// a built Storybook preview takes channel messages from any window that holds a handle to it. isolating the component
// browser from its opener leaves another site no handle to post to, since frame-ancestors already keeps it out of a frame
const NIGHTSHIFT_OPENER_POLICY = "same-origin"

// every response's own headers: the component browser's policy, its opener isolation, and the noindex header
const NIGHTSHIFT_HEADERS: Record<string, string> = {
	"Content-Security-Policy": NIGHTSHIFT_CONTENT_SECURITY_POLICY,
	"Cross-Origin-Opener-Policy": NIGHTSHIFT_OPENER_POLICY,
	...NOINDEX_HEADER,
}

// the validator a fixed-name file revalidates with, a hash of the file the route served
const fixedNameFileEtag = etag()

// a file Vite named by its content: assets/<name>-<eight-character hash>.<extension>. every other file Storybook
// writes, such as its manager and its addons, keeps a fixed name across builds
const HASHED_ASSET_PATTERN = /^\/nightshift\/assets\/[^/]+-[\w-]{8}\.\w+$/

/**
 * The component browser's routes. /nightshift redirects to the folder and keeps its query, since the folder's files
 * name each other by relative urls. Every file after it is served from the built output, or responds 404.
 */
export const nightshiftRoute = new Hono()
	// every response is the component browser's own: its policy, its opener isolation, and kept out of search results
	.use("/nightshift/*", setNightshiftHeaders)
	// a fixed-name file gets a validator, so a repeat visit revalidates to a 304 instead of the whole file
	.use("/nightshift/*", (context, next) =>
		HASHED_ASSET_PATTERN.test(context.req.path) ? next() : fixedNameFileEtag(context, next),
	)
	.on(["GET", "HEAD"], "/nightshift", (context) =>
		context.redirect(`/nightshift/${new URL(context.req.url).search}`, 301),
	)
	.on(
		["GET", "HEAD"],
		"/nightshift/*",
		// a hashed asset is cached for a year. every other file revalidates and is never cached at the edge, so a deploy
		// never leaves a stale manager behind
		serveStatic({
			root: NIGHTSHIFT_BUNDLE_ROOT,
			rewriteRequestPath: toNightshiftFilePath,
			onFound: (_path, context) =>
				setStaticFileCacheControl({ context, isHashedAsset: HASHED_ASSET_PATTERN.test(context.req.path) }),
		}),
	)
	// a path matching no built file, or every path if the component browser was never built
	.on(["GET", "HEAD"], "/nightshift/*", (context) => context.text("Not found", 404))

// the built file a /nightshift url names: the prefix removed, and the folder's own index.html for the folder itself
function toNightshiftFilePath(path: string): string {
	const filePath = path.slice("/nightshift".length)
	return filePath.endsWith("/") ? `${filePath}index.html` : filePath
}

// set the component browser's policy, its opener isolation, and the noindex header once the route has responded
async function setNightshiftHeaders(context: Context, next: () => Promise<void>): Promise<void> {
	await next()
	for (const [headerName, headerValue] of Object.entries(NIGHTSHIFT_HEADERS)) {
		context.header(headerName, headerValue)
	}
}
