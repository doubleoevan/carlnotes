// the web app's server build as the api runs it: the import at startup, which stops a production boot that cannot
// render, the page render with its visitor concurrency limit, the wait for a free slot, and the page a shed visitor
// gets, the minute's render counts, and the readiness render
import { resolve } from "node:path"
import { DEGRADED_RENDER_HEADER } from "@carlnotes/contracts/seo"
import { withTimeLimit } from "@carlnotes/contracts/time"
import { toPositiveInteger, toWholeNumber } from "@carlnotes/server/envSettings"
import { exitOnFatalError, reportError } from "@carlnotes/server/monitoring"
import { getSessionCookie } from "better-auth/cookies"
import { UI_SERVER_ENTRY } from "./bundlePaths"

// how long a crawler waits before it retries a page rendered without a read it needs
const DEGRADED_RENDER_RETRY_AFTER_SECONDS = 60

// how many visitor pages this replica renders at once unless RENDER_CONCURRENCY sets it. a visitor's render past it
// waits for a free slot, and is shed if none frees in time
const DEFAULT_RENDER_CONCURRENCY = 16

// how long a visitor's render past the limit waits for a free slot before it is shed, unless RENDER_SLOT_WAIT_MS sets
// it
const DEFAULT_RENDER_SLOT_WAIT_MS = 2 * 1000

// the shortest and longest wait before the browser retries a shed render, in seconds. each shed response picks a
// wait between them, so shed visitors do not all return at once
export const BUSY_RENDER_MIN_RETRY_AFTER_SECONDS = 2
export const BUSY_RENDER_MAX_RETRY_AFTER_SECONDS = 6

// the page a shed visitor gets: it asks for the same address again after the retry wait, with no script, stays out of
// search results, and says that the site is busy and that the page will try again
function toBusyRenderPage(retryAfterSeconds: number): string {
	const head = [
		'<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">',
		`<meta http-equiv="refresh" content="${retryAfterSeconds}">`,
		'<meta name="color-scheme" content="light dark"><meta name="robots" content="noindex">',
		"<title>CarlNotes is busy</title>",
		"<style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:90vh;margin:0}</style>",
	].join("")
	return `<!doctype html><html lang="en"><head>${head}</head><body><main><h1>CarlNotes is busy</h1><p>This page will try again in a moment.</p></main></body></html>`
}

// the ui's server handler, as the server entry exports it
type UiServer = { fetch: (request: Request) => Promise<Response> }

// how importing the ui's server build went: loaded with its handler, missing if build:ui never wrote it, or failed
// with the error the import threw
type UiServerImport =
	| { status: "loaded"; uiServer: UiServer }
	| { status: "missing" }
	| { status: "failed"; error: unknown }

// the page the readiness check renders, how long it may take, and how long its result is reused
const READINESS_PAGE_URL = "http://localhost/privacy"
const READINESS_TIME_LIMIT_MS = 5 * 1000
const READINESS_REUSE_MS = 5 * 1000

// whether the ui's server can render a page, or the reason it cannot
export type RenderReadiness = { status: "ok" } | { status: "unavailable"; reason: string }

// a readiness check: the server build it rendered, when its render started, and its result
type ReadinessCheck = { uiServerEntryPath: string; startedAtMs: number; renderReadiness: Promise<RenderReadiness> }

// how many visitor pages this replica is rendering now
let activeVisitorRenderCount = 0

// the visitor renders waiting for a slot, oldest first. a finished render gives its slot to the oldest one
const renderSlotWaiters: Array<() => void> = []

// how many page renders this replica started, how many visitor renders waited for a slot, and how many it shed since
// the minute's last reading
let startedRenderCount = 0
let waitedRenderCount = 0
let shedRenderCount = 0

// the page renders a replica started in a minute, the visitor renders that waited for a slot, and the ones it shed
export type RenderGauges = { startedCount: number; waitedCount: number; shedCount: number }

/**
 * Returns the page renders this replica started, the visitor renders that waited for a slot, and the ones it shed
 * since the last reading, and starts the counts over.
 */
export function readAndResetRenderGauges(): RenderGauges {
	const renderGauges = { startedCount: startedRenderCount, waitedCount: waitedRenderCount, shedCount: shedRenderCount }
	startedRenderCount = 0
	waitedRenderCount = 0
	shedRenderCount = 0
	return renderGauges
}

/**
 * Waits up to the slot wait for a visitor render's slot to free, and returns whether the render got one. A render
 * that gets a slot takes the finished render's count, so the active count never passes the limit.
 */
function waitForRenderSlot(slotWaitMs: number): Promise<boolean> {
	// no wait sheds at once
	if (slotWaitMs === 0) {
		return Promise.resolve(false)
	}

	// a finished render gives this render its slot
	const { promise, resolve } = Promise.withResolvers<boolean>()
	const takeRenderSlot = (): void => {
		clearTimeout(slotWaitTimeout)
		resolve(true)
	}

	// join the line, and leave it with no slot once the wait ends
	const slotWaitTimeout = setTimeout(() => {
		const waiterIndex = renderSlotWaiters.indexOf(takeRenderSlot)
		if (waiterIndex !== -1) {
			renderSlotWaiters.splice(waiterIndex, 1)
		}
		resolve(false)
	}, slotWaitMs)
	// wait in line for the next free slot
	renderSlotWaiters.push(takeRenderSlot)
	return promise
}

/**
 * Gives a finished visitor render's slot to the oldest waiting render, or frees it if none waits.
 */
function releaseRenderSlot(): void {
	const nextRenderSlotWaiter = renderSlotWaiters.shift()
	if (nextRenderSlotWaiter) {
		nextRenderSlotWaiter()
		return
	}
	activeVisitorRenderCount--
}

// the latest readiness check, which every check within five seconds of its start reuses
let latestReadinessCheck: ReadinessCheck | null = null

/**
 * Imports the ui's server before the api serves, so a new replica's first page never waits on the import. In
 * production, a server build that is missing or fails to import is reported, and the process exits before it listens.
 */
export async function importUiServerAtStartup(): Promise<void> {
	// a loaded server build serves, and so does a missing one outside production, where vite serves the ui
	const uiServerImport = await importUiServer()
	const isProduction = Bun.env.NODE_ENV === "production"
	if (uiServerImport.status === "loaded" || (uiServerImport.status === "missing" && !isProduction)) {
		return
	}

	// the error that says why the build cannot load
	const startupError =
		uiServerImport.status === "missing"
			? new Error(`the ui's server build is missing at ${UI_SERVER_ENTRY}`)
			: uiServerImport.error

	// outside production, a build that fails to import is logged, and its pages respond 503
	if (!isProduction) {
		console.error("the ui's server build failed to import", startupError)
		return
	}

	// in production, report why no page can render, wait for the report to send, and exit before listening
	await exitOnFatalError({
		error: startupError,
		stage: "startup",
		message: "the ui's server build cannot load, so the api exits",
	})
}

/**
 * Renders a page with the ui's server. A missing bundle is a 404, and a bundle that fails to import or a page rendered
 * without a read it needs is a 503.
 */
export async function renderUiPage(request: Request): Promise<Response> {
	// a missing bundle is a 404 that names build:ui
	const uiServerImport = await importUiServer()
	if (uiServerImport.status === "missing") {
		return new Response("the ui is not built. run bun run build:ui", { status: 404 })
	}

	// a bundle that fails to import is logged, reported, and responds 503 so a crawler retries it later
	if (uiServerImport.status === "failed") {
		console.error("the ui's server build failed to import", uiServerImport.error)
		reportError(uiServerImport.error, "page-render")
		return new Response("the ui failed to load", { status: 503 })
	}
	const { uiServer } = uiServerImport

	// a visitor's render past the concurrency limit waits for a slot, and is shed with a page that retries shortly if
	// none frees in time. a signed-in render is never counted against the limit or shed. the page guards mark the 503
	// private
	const isVisitorRender = !getSessionCookie(request)
	const renderConcurrency = toPositiveInteger(Bun.env.RENDER_CONCURRENCY, DEFAULT_RENDER_CONCURRENCY)
	if (isVisitorRender && activeVisitorRenderCount >= renderConcurrency) {
		// count the wait, then take a freed slot or shed the render
		waitedRenderCount++
		const slotWaitMs = toWholeNumber(Bun.env.RENDER_SLOT_WAIT_MS, DEFAULT_RENDER_SLOT_WAIT_MS)
		if (!(await waitForRenderSlot(slotWaitMs))) {
			return toBusyRenderResponse()
		}
	}
	// a visitor's render under the limit takes a free slot
	else if (isVisitorRender) {
		activeVisitorRenderCount++
	}

	// render the page, holding a visitor's slot until the ui's server returns the page's headers
	startedRenderCount++
	try {
		const page = await uiServer.fetch(request)
		return toRenderedPageResponse(request, page)
	} finally {
		// give the slot up, whether the render returned or threw
		if (isVisitorRender) {
			releaseRenderSlot()
		}
	}
}

/**
 * Counts a shed render and returns the busy page, with a retry wait picked between the shortest and longest.
 */
function toBusyRenderResponse(): Response {
	// count the shed render and pick its retry wait
	shedRenderCount++
	const retryAfterSeconds =
		BUSY_RENDER_MIN_RETRY_AFTER_SECONDS +
		Math.floor(Math.random() * (BUSY_RENDER_MAX_RETRY_AFTER_SECONDS - BUSY_RENDER_MIN_RETRY_AFTER_SECONDS + 1))
	return new Response(toBusyRenderPage(retryAfterSeconds), {
		status: 503,
		headers: { "Content-Type": "text/html; charset=utf-8", "Retry-After": String(retryAfterSeconds) },
	})
}

/**
 * Returns whether the ui's server rendered the privacy page 200 within five seconds, or the reason it did not. Checks
 * within five seconds of a render's start share its result, so the request rate never sets the render rate.
 */
export function checkRenderReadiness(): Promise<RenderReadiness> {
	// reuse a recent render of the same server build
	const uiServerEntryPath = resolve(UI_SERVER_ENTRY)
	const nowMs = Date.now()
	if (
		latestReadinessCheck?.uiServerEntryPath === uiServerEntryPath &&
		nowMs - latestReadinessCheck.startedAtMs < READINESS_REUSE_MS
	) {
		return latestReadinessCheck.renderReadiness
	}

	// start a new readiness render
	const renderReadiness = renderReadinessPage()
	latestReadinessCheck = { uiServerEntryPath, startedAtMs: nowMs, renderReadiness }
	return renderReadiness
}

// render the privacy page through the ui's server with no cookie, page guards, or render limit
async function renderReadinessPage(): Promise<RenderReadiness> {
	// a missing or broken build cannot render
	const uiServerImport = await importUiServer()
	if (uiServerImport.status === "missing") {
		return { status: "unavailable", reason: "the ui's server build is missing" }
	}
	if (uiServerImport.status === "failed") {
		return { status: "unavailable", reason: "the ui's server build failed to import" }
	}

	// render the privacy page, which reads no database and no session, under the time limit. Promise.try turns a handler
	// that throws before it returns a promise into a rejected render
	const { uiServer } = uiServerImport
	const pageRender = Promise.try(() => uiServer.fetch(new Request(READINESS_PAGE_URL)))
	const timeLimitError = new Error("the readiness render took over five seconds")
	try {
		const page = await withTimeLimit({
			work: pageRender,
			timeLimitMs: READINESS_TIME_LIMIT_MS,
			toError: () => timeLimitError,
		})
		await page.body?.cancel()

		// a page rendered without a read it needs is a 503 to a visitor, so it is not ready either
		if (page.headers.has(DEGRADED_RENDER_HEADER)) {
			return { status: "unavailable", reason: "the readiness render was missing a read it needs" }
		}
		return page.status === 200
			? { status: "ok" }
			: { status: "unavailable", reason: `the readiness render returned ${page.status}` }
	} catch (error) {
		// a render past the time limit is not ready, and its page is dropped if it finishes later
		// ponytail: a render that never settles stays in memory, at most one every five seconds
		if (error === timeLimitError) {
			pageRender.then(
				(page) => page.body?.cancel(),
				() => {},
			)
			return { status: "unavailable", reason: timeLimitError.message }
		}

		// a render that threw is not ready. the error is logged and reported, and never sent to the caller
		console.error("the readiness render threw", error)
		reportError(error, "page-render", { path: new URL(READINESS_PAGE_URL).pathname })
		return { status: "unavailable", reason: "the readiness render threw an error" }
	}
}

// import the ui's server handler. bun caches the module after the first import
async function importUiServer(): Promise<UiServerImport> {
	// a bundle that build:ui never wrote is missing
	const uiServerEntryPath = resolve(UI_SERVER_ENTRY)
	if (!(await Bun.file(uiServerEntryPath).exists())) {
		return { status: "missing" }
	}

	// import the handler, and keep the error of a bundle that throws
	return import(uiServerEntryPath)
		.then((uiServerEntry): UiServerImport => ({ status: "loaded", uiServer: uiServerEntry.default as UiServer }))
		.catch((error: unknown): UiServerImport => ({ status: "failed", error }))
}

// copy a rendered page into a response whose headers the page guards may set. a page rendered without a read it needs
// returns a 503 with a Retry-After header, and a degraded page or a server error is reported
function toRenderedPageResponse(request: Request, page: Response): Response {
	// read and drop the marker of a page rendered without a read it needs
	const pageHeaders = new Headers(page.headers)
	const isDegradedRender = pageHeaders.has(DEGRADED_RENDER_HEADER)
	pageHeaders.delete(DEGRADED_RENDER_HEADER)

	// report a degraded render, and ask the client to retry it
	const path = new URL(request.url).pathname
	if (isDegradedRender) {
		pageHeaders.set("Retry-After", String(DEGRADED_RENDER_RETRY_AFTER_SECONDS))
		reportError(new Error("a page rendered without a read it needs"), "page-render", { path })
	}

	// report a page the ui's server rendered as a server error
	if (!isDegradedRender && page.status >= 500) {
		reportError(new Error(`a page rendered with status ${page.status}`), "page-render", { path })
	}
	return new Response(page.body, {
		status: isDegradedRender ? 503 : page.status,
		statusText: isDegradedRender ? "Service Unavailable" : page.statusText,
		headers: pageHeaders,
	})
}
