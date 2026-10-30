// one browser page that captures stories, with a clock that starts at the fixture date and runs on, seeded randomness,
// the vendored fonts, and a closed network. for each story capture, it opens the story in one palette at one size,
// waits for Storybook to finish the story, checks for errors, and takes up to seven images until two in a row match
import { readFileSync } from "node:fs"
import { posix } from "node:path"
import { FIXTURE_DATE } from "@carlnotes/core/lib/storyFixtures"
import type { BrowserContext, Page, Route } from "playwright-core"
import { isMatchingImage } from "../compare/compareImageCaptures"
import { type AccessibilityResult, FONTS_FOLDER } from "../imageCaptures"
import { installStoryEventHooks, RANDOM_SEED, type StoryGlobals, seedRandomness } from "./capturePageScripts"

/** One story to capture, in one theme at one named size. */
export type StoryCapture = { storyId: string; theme: "light" | "dark"; sizeName: string; width: number; height: number }

/**
 * What capturing one story produced: a stable image with its accessibility result, an error, which says whether the
 * story stalled, two images that differ, or a skip because the story pins another size or theme.
 */
export type StoryCaptureResult = { blockedUrls: string[] } & (
	| { status: "stable"; image: Buffer; accessibilityResult: AccessibilityResult }
	| { status: "error"; errorText: string; isStalled: boolean }
	| { status: "unstable"; image: Buffer; retakeImage: Buffer }
	| { status: "skipped"; skipReason: string }
)

// the url path that an image capture fulfills the vendored fonts after,
// and the Google Fonts host whose stylesheet an image capture replaces
const FONT_PATH_PREFIX = "/ui-tests-fonts/"
const FONT_STYLESHEET_HOST = "fonts.googleapis.com"

// how long a story may take to finish, how many times a stalled story is loaded, how long the network may take to
// settle, and the room around the clip. a second load clears a story that stalled once on a busy machine
const STORY_TIMEOUT_MS = 30_000
const STORY_LOAD_ATTEMPT_COUNT = 2
const NETWORK_IDLE_TIMEOUT_MS = 5_000
const CLIP_PADDING_PX = 16

// how many more images a capture page takes before it calls the story unstable, and the wait before each image.
// a toolbar that settles its state a second after the story finishes settles inside this window
const STABILITY_ATTEMPT_COUNT = 5
const STABILITY_WAIT_MS = 250

// the requests that each page's current story capture blocked
const blockedUrlsByPage = new WeakMap<Page, string[]>()

/**
 * Prepares a browser context for capturing: the vendored fonts fulfill Google Fonts requests, every other request off
 * the server's origin is blocked and recorded, and each page starts with seeded randomness and Storybook's event log.
 */
export async function prepareCaptureContext(context: BrowserContext, serverOrigin: string): Promise<void> {
	// the font stylesheet, read once
	const fontStylesheet = readFileSync(posix.join(FONTS_FOLDER, "fonts.css"), "utf8")

	// route every request that the context makes
	await context.route("**/*", (route) => routeCaptureRequest({ route, serverOrigin, fontStylesheet }))

	// seed randomness and gather Storybook's story events in every document that the context opens
	await context.addInitScript(seedRandomness, RANDOM_SEED)
	await context.addInitScript(installStoryEventHooks)
}

/**
 * Opens a page whose clock starts at the fixture date and runs on from there, and whose WebSockets, which the context's
 * request routing never sees, are closed and recorded as blocked.
 */
export async function openCapturePage(context: BrowserContext): Promise<Page> {
	// the page and its clock
	const page = await context.newPage()
	await page.clock.install({ time: FIXTURE_DATE })

	// every WebSocket is closed before it connects, and recorded for the page's current story capture
	await page.routeWebSocket(/.*/, (webSocketRoute) => {
		blockedUrlsByPage.get(page)?.push(webSocketRoute.url())
		void webSocketRoute.close({ code: 1008, reason: "blocked by the UI test capture page" })
	})
	return page
}

/**
 * Captures one story: opens it in its theme at its size, waits for Storybook to finish it, checks for errors, and takes
 * images until two in a row match.
 */
export async function captureStory({
	page,
	serverOrigin,
	storyCapture,
}: {
	page: Page
	serverOrigin: string
	storyCapture: StoryCapture
}): Promise<StoryCaptureResult> {
	// a fresh list of blocked requests, the size, and the clock back at the fixture date
	const blockedUrls: string[] = []
	blockedUrlsByPage.set(page, blockedUrls)
	await page.setViewportSize({ width: storyCapture.width, height: storyCapture.height })
	await page.clock.setSystemTime(FIXTURE_DATE)

	// open the story in its theme and wait for Storybook's render result
	const storyUrl = toStoryUrl(serverOrigin, storyCapture)
	const storyRenderResult = await openStory(page, storyUrl)

	// a story that pins another size or theme for itself skips this image capture, even if it failed at the wrong size
	const skipReason = toPinnedSkipReason(await page.evaluate(() => window.__uiTestsStoryGlobals ?? {}), storyCapture)
	if (skipReason) {
		return { status: "skipped", skipReason, blockedUrls }
	}
	if (storyRenderResult.status === "error") {
		return {
			status: "error",
			errorText: storyRenderResult.errorText,
			isStalled: storyRenderResult.isStalled,
			blockedUrls,
		}
	}

	// take images until two in a row match
	const takeStableImageResult = await takeStableImage(page)
	if (takeStableImageResult.status === "unstable") {
		return { ...takeStableImageResult, blockedUrls }
	}
	return {
		status: "stable",
		image: takeStableImageResult.image,
		accessibilityResult: storyRenderResult.accessibilityResult,
		blockedUrls,
	}
}

// route one request: pass the server's own, fulfill a font file or the font stylesheet from the repo,
// and block the rest
async function routeCaptureRequest({
	route,
	serverOrigin,
	fontStylesheet,
}: {
	route: Route
	serverOrigin: string
	fontStylesheet: string
}): Promise<void> {
	// the server's own requests pass
	const requestUrl = new URL(route.request().url())
	if (requestUrl.origin === serverOrigin) {
		return route.continue()
	}

	// a font file and the Google Fonts stylesheet come from the repo
	if (requestUrl.pathname.startsWith(FONT_PATH_PREFIX)) {
		return route.fulfill({ path: posix.join(FONTS_FOLDER, posix.basename(requestUrl.pathname)) })
	}
	if (requestUrl.hostname === FONT_STYLESHEET_HOST) {
		return route.fulfill({ body: fontStylesheet, contentType: "text/css" })
	}

	// every other request is blocked, and recorded for the page's current story capture if a page made the request
	const requestPage = toRequestPage(route)
	if (requestPage) {
		blockedUrlsByPage.get(requestPage)?.push(requestUrl.href)
	}
	return route.abort("blockedbyclient")
}

// the page that a request came from, or null for a request that a worker made, whose frame Playwright cannot name
function toRequestPage(route: Route): Page | null {
	try {
		return route.request().frame().page()
	} catch {
		return null
	}
}

/**
 * Returns why an image capture is skipped: the story pins a viewport other than the image capture's size, or a theme
 * other than its theme. null if the story pins neither.
 */
export function toPinnedSkipReason(storyGlobals: StoryGlobals, storyCapture: StoryCapture): string | null {
	// a pinned viewport whose name is not the image capture's size
	const pinnedViewportName = storyGlobals.viewport?.value
	if (pinnedViewportName && pinnedViewportName !== storyCapture.sizeName) {
		return `the story pins the ${pinnedViewportName} viewport`
	}

	// a pinned theme other than the image capture's
	return storyGlobals.theme && storyGlobals.theme !== storyCapture.theme
		? `the story pins the ${storyGlobals.theme} theme`
		: null
}

// the iframe url of one story in one theme
function toStoryUrl(serverOrigin: string, storyCapture: StoryCapture): string {
	const storyQuery = new URLSearchParams({ id: storyCapture.storyId, viewMode: "story" })
	return `${serverOrigin}/nightshift/iframe.html?${storyQuery}&globals=theme:${storyCapture.theme}`
}

// open a story and wait for Storybook to finish it: an error, or the accessibility result
async function openStory(
	page: Page,
	storyUrl: string,
): Promise<
	| { status: "error"; errorText: string; isStalled: boolean }
	| { status: "finished"; accessibilityResult: AccessibilityResult }
> {
	// load the story until an event ends it, once more if it stalls, and never more than that
	let hasStoryFinished = false
	for (let i = 0; i < STORY_LOAD_ATTEMPT_COUNT && !hasStoryFinished; i++) {
		hasStoryFinished = await loadStory(page, storyUrl)
	}
	if (!hasStoryFinished) {
		const timeoutText = `${STORY_TIMEOUT_MS / 1000} seconds, ${STORY_LOAD_ATTEMPT_COUNT} times`
		return { status: "error", errorText: `the story did not finish within ${timeoutText}`, isStalled: true }
	}

	// an error that the story raised, or the empty render or error display that Storybook drew
	const storyRenderResult = await page.evaluate(() => window.__uiTestsStoryRenderResult)
	if (storyRenderResult?.status === "error") {
		return { ...storyRenderResult, isStalled: false }
	}
	const renderErrorText = await page.evaluate(() => window.__uiTestsReadRenderError())
	if (renderErrorText) {
		return { status: "error", errorText: renderErrorText, isStalled: false }
	}

	// let the fonts load and the network settle. a story that keeps polling is judged by the stability check instead
	await page.evaluate(() => document.fonts.ready.then(() => undefined))
	await page.waitForLoadState("networkidle", { timeout: NETWORK_IDLE_TIMEOUT_MS }).catch(() => undefined)
	return {
		status: "finished",
		accessibilityResult: storyRenderResult?.accessibilityResult ?? { status: "not-available" },
	}
}

// load a story and wait for Storybook's event that ends it. false if the load or the story stalls past the timeout
async function loadStory(page: Page, storyUrl: string): Promise<boolean> {
	try {
		// the page, then the render result that the story events gather
		await page.goto(storyUrl, { waitUntil: "load", timeout: STORY_TIMEOUT_MS })
		await page.waitForFunction(() => window.__uiTestsStoryRenderResult !== undefined, null, {
			timeout: STORY_TIMEOUT_MS,
		})
		return true
	} catch {
		return false
	}
}

// take pairs of images a moment apart until a pair matches, or report the last pair as unstable
async function takeStableImage(
	page: Page,
): Promise<{ status: "stable"; image: Buffer } | { status: "unstable"; image: Buffer; retakeImage: Buffer }> {
	// the first image
	let image = await takeClippedImage(page)
	for (let i = 0; i < STABILITY_ATTEMPT_COUNT; i++) {
		// another image a moment later, compared with the one before it under the comparison's own tolerance
		await page.waitForTimeout(STABILITY_WAIT_MS)
		const nextImage = await takeClippedImage(page)
		if (isMatchingImage(image, nextImage)) {
			return { status: "stable", image }
		}
		image = nextImage
	}

	// no two images in a row matched, so report the last one beside one more
	return { status: "unstable", image, retakeImage: await takeClippedImage(page) }
}

// an image of the page's full width with motion settled, down to the lowest edge of the story and of each open portal
async function takeClippedImage(page: Page): Promise<Buffer> {
	const clipSize = await page.evaluate((clipPaddingPx) => window.__uiTestsMeasureClip(clipPaddingPx), CLIP_PADDING_PX)
	return page.screenshot({
		clip: { x: 0, y: 0, width: clipSize.width, height: clipSize.height },
		fullPage: true,
		animations: "disabled",
		caret: "hide",
		scale: "css",
	})
}
