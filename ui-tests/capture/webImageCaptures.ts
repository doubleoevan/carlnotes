// the web capture step, `bun run visual:web`: build the component browser, capture the selected stories in both palettes
// at both sizes, compare each image capture with its approved baseline, and write the platform's report. outside the
// image capture image it builds the image and runs itself inside it. `--story <id>` captures the named stories,
// `--skip-build` reuses the last build, and `--on-host` captures in the host's Chrome, an environment that no baseline
// is ever approved from
import { existsSync } from "node:fs"
import { availableParallelism } from "node:os"
import { posix } from "node:path"
import { parseArgs } from "node:util"
import { type Browser, type BrowserContext, chromium, type Page } from "playwright-core"
import { runVisibleCommand } from "../commands"
import { comparePlatform, toPlatformImageCaptureKeys, writeOutputImage } from "../compare/compareImageCaptures"
import { toErrorText } from "../errorText"
import {
	BASELINES_FOLDER,
	FAILING_STATUSES,
	type ImageCaptureKey,
	type ImageCaptureManifest,
	type ImageCaptureRecord,
	NO_SCREENSHOT_TAG,
	OUTPUT_FOLDER,
	PALETTES,
	SELECTION_PATH,
	toImageCaptureManifestPath,
	toOutputImagePath,
	toPlatformReportPath,
	WEB_IMAGE_CAPTURE_SIZES,
} from "../imageCaptures"
import { readJsonFile, writeJsonFile } from "../jsonFiles"
import type { ImageCaptureSelection } from "../selection/imageCaptureSelection"
import { isInsideCaptureContainer, runInCaptureContainer, toCaptureEnvironmentId } from "./captureContainer"
import { captureStory, openCapturePage, prepareCaptureContext, type StoryCaptureResult } from "./capturePage"
import { SITE_CAPTURE_SERVER_FOLDERS, startCaptureServer } from "./captureServer"

// one entry of the built component browser's index
type StoryIndexEntry = { type: "story" | "docs"; id: string; tags?: string[] }

// what every capture page shares
type CaptureQueueOptions = {
	// the browser, the server's origin, the queue, and the records
	browser: Browser
	serverOrigin: string
	captureQueue: ImageCaptureKey[]
	imageCaptureRecords: ImageCaptureRecord[]
	// the indexed stories, the stories that stalled, and the time after which no capture page takes another image capture
	indexedStoryIds: Set<string>
	stalledStoryIds: Set<string>
	captureDeadlineMs: number
}

// how many capture pages run at once, and the minutes that they take image captures for, without a setting
// that says otherwise. the 30 minutes leave room in the web job's 45-minute timeout to build the image and the
// component browser and write the report
const DEFAULT_CAPTURE_CONCURRENCY = 4
const DEFAULT_CAPTURE_MINUTES = 30

// the capture pages whose renderer crashed, which Playwright never marks closed
const crashedPages = new WeakSet<Page>()

// the command's options
const { values: commandOptions } = parseArgs({
	args: Bun.argv.slice(2),
	options: {
		story: { type: "string", multiple: true },
		"skip-build": { type: "boolean", default: false },
		"on-host": { type: "boolean", default: false },
	},
})
const isOnHost = commandOptions["on-host"]

// outside the capture container, run this same step inside it
if (!isOnHost && !isInsideCaptureContainer()) {
	process.exit(runInCaptureContainer(["bun", "ui-tests/capture/webImageCaptures.ts", ...Bun.argv.slice(2)]))
}

// build the component browser, unless the command reuses the last build
if (!commandOptions["skip-build"]) {
	buildComponentBrowser()
}

// the stories that the build indexes, the stories that the tag leaves out, and the image captures to take
const storyIndexEntries = readStoryIndex()
const indexedStoryIds = storyIndexEntries.map((storyIndexEntry) => storyIndexEntry.id)
const skippedStoryIds = storyIndexEntries
	.filter((storyIndexEntry) => storyIndexEntry.tags?.includes(NO_SCREENSHOT_TAG))
	.map((storyIndexEntry) => storyIndexEntry.id)
const selectedStoryIds = toSelectedStoryIds(indexedStoryIds).filter((storyId) => !skippedStoryIds.includes(storyId))
const selectedImageCaptures = selectedStoryIds.flatMap((storyId) => toPlatformImageCaptureKeys("web", storyId))

// capture every selected story, then record the image captures with their environment
console.log(
	`visual:web: ${selectedStoryIds.length} stories selected, ${selectedImageCaptures.length} image captures to take`,
)
const imageCaptureRecords = await captureSelectedStories(selectedImageCaptures, new Set(indexedStoryIds))
const imageCaptureManifest: ImageCaptureManifest = {
	platform: "web",
	environmentId: toCaptureEnvironmentId(isOnHost),
	storyIds: indexedStoryIds,
	skippedStoryIds,
	selectedImageCaptures,
	imageCaptureRecords,
}
writeJsonFile(toImageCaptureManifestPath("web"), imageCaptureManifest)

// compare the image captures with their baselines and write the report
const platformReport = comparePlatform({
	imageCaptureManifest,
	comparisonFolders: { baselinesFolder: BASELINES_FOLDER, outputFolder: OUTPUT_FOLDER },
})
writeJsonFile(toPlatformReportPath("web"), platformReport)

// print each status's count, and fail on any image capture that changed, errored, or was unstable
const reportEntriesByStatus = Map.groupBy(platformReport.reportEntries, (reportEntry) => reportEntry.status)
const statusCountText = [...reportEntriesByStatus]
	.map(([status, reportEntries]) => `${reportEntries.length} ${status}`)
	.join(", ")
console.log(`visual:web: ${statusCountText || "nothing captured"}`)
const failureCount = platformReport.reportEntries.filter((reportEntry) =>
	FAILING_STATUSES.has(reportEntry.status),
).length
process.exit(failureCount > 0 ? 1 : 0)

// build the component browser, and stop the step if it does not build
function buildComponentBrowser(): void {
	const buildExitCode = runVisibleCommand(["bun", "run", "build:storybook"])
	if (buildExitCode !== 0) {
		console.error("visual:web: the component browser did not build")
		process.exit(buildExitCode)
	}
}

// the story entries of the built component browser's index
function readStoryIndex(): StoryIndexEntry[] {
	const indexPath = posix.join(SITE_CAPTURE_SERVER_FOLDERS.componentBrowserFolder, "index.json")
	const storyIndex = readJsonFile<{ entries: Record<string, StoryIndexEntry> }>(indexPath)
	return Object.values(storyIndex.entries).filter((storyIndexEntry) => storyIndexEntry.type === "story")
}

// the stories to capture: those that the command names, those that the selection chose,
// or every story without a selection
function toSelectedStoryIds(allStoryIds: string[]): string[] {
	// the command's own stories come first
	if (commandOptions.story) {
		return commandOptions.story
	}

	// a selection's web stories, or every story if no selection was made
	if (!existsSync(SELECTION_PATH)) {
		return allStoryIds
	}
	const imageCaptureSelection = readJsonFile<ImageCaptureSelection>(SELECTION_PATH)
	const webSelection = imageCaptureSelection.platforms.web
	return webSelection.mode === "all" ? allStoryIds : webSelection.storyIds
}

// take every selected image capture on several capture pages at once, each in its own browser context
async function captureSelectedStories(
	imageCaptureKeys: ImageCaptureKey[],
	indexedStoryIdSet: Set<string>,
): Promise<ImageCaptureRecord[]> {
	// the server and the browser. a browser that does not start makes every image capture an error that says why
	const captureServer = startCaptureServer(SITE_CAPTURE_SERVER_FOLDERS)
	let browser: Browser
	try {
		browser = await chromium.launch(isOnHost ? { channel: "chrome" } : {})
	} catch (error) {
		captureServer.stop()
		return imageCaptureKeys.map((imageCaptureKey) =>
			toErrorRecord(imageCaptureKey, `the browser did not start: ${toErrorText(error)}`),
		)
	}

	// one queue that every capture page takes image captures from, until the capture minutes run out
	const captureMinutes = Number(Bun.env.UI_TESTS_CAPTURE_MINUTES) || DEFAULT_CAPTURE_MINUTES
	const captureQueueOptions: CaptureQueueOptions = {
		browser,
		serverOrigin: captureServer.origin,
		captureQueue: [...imageCaptureKeys],
		imageCaptureRecords: [],
		indexedStoryIds: indexedStoryIdSet,
		stalledStoryIds: new Set(),
		captureDeadlineMs: Date.now() + captureMinutes * 60_000,
	}

	// take image captures until the queue is empty. a capture page that fails stops, and the others keep taking them
	const captureConcurrency =
		Number(Bun.env.UI_TESTS_CAPTURE_CONCURRENCY) || Math.min(DEFAULT_CAPTURE_CONCURRENCY, availableParallelism())
	const capturePageFailures: string[] = []
	await Promise.all(
		Array.from({ length: captureConcurrency }, () =>
			takeQueuedImageCaptures(captureQueueOptions).catch((error: unknown) => {
				capturePageFailures.push(toErrorText(error))
			}),
		),
	)

	// an image capture that no capture page took is an error that says why: the capture minutes ran out, or every page
	// failed
	const isPastDeadline = Date.now() >= captureQueueOptions.captureDeadlineMs
	const notTakenText = isPastDeadline
		? `the capture step's ${captureMinutes} minutes ran out before this image capture`
		: `no capture page took this image capture: ${capturePageFailures[0] ?? "every capture page stopped"}`
	for (const imageCaptureKey of captureQueueOptions.captureQueue.splice(0)) {
		captureQueueOptions.imageCaptureRecords.push(toErrorRecord(imageCaptureKey, notTakenText))
	}

	// stop the browser, which may already be gone, and the server
	await browser.close().catch(() => undefined)
	captureServer.stop()
	return captureQueueOptions.imageCaptureRecords
}

// take image captures from the queue until it is empty or the capture minutes run out, replacing the capture page if an
// image capture closes or crashes it
async function takeQueuedImageCaptures(captureQueueOptions: CaptureQueueOptions): Promise<void> {
	let capturePage = await openCapturePageInContext(captureQueueOptions)
	for (
		let imageCaptureKey = takeNextImageCapture(captureQueueOptions);
		imageCaptureKey;
		imageCaptureKey = takeNextImageCapture(captureQueueOptions)
	) {
		// the image capture's record
		captureQueueOptions.imageCaptureRecords.push(
			await takeQueuedImageCapture(captureQueueOptions, capturePage.page, imageCaptureKey),
		)

		// a page that closed or crashed during a story capture is replaced before the next one
		if (capturePage.page.isClosed() || crashedPages.has(capturePage.page)) {
			await capturePage.context.close()
			capturePage = await openCapturePageInContext(captureQueueOptions)
		}
	}
	await capturePage.context.close()
}

// the next image capture in the queue, or none once the capture minutes have run out
function takeNextImageCapture(captureQueueOptions: CaptureQueueOptions): ImageCaptureKey | undefined {
	return Date.now() < captureQueueOptions.captureDeadlineMs ? captureQueueOptions.captureQueue.shift() : undefined
}

// one image capture's record: an error for a story that the build does not index, or for a story that stalled while
// capturing an earlier image, and otherwise the record of the image capture. a stall is kept, so the story's other
// image captures do not wait for it again
async function takeQueuedImageCapture(
	captureQueueOptions: CaptureQueueOptions,
	page: Page,
	imageCaptureKey: ImageCaptureKey,
): Promise<ImageCaptureRecord> {
	// a story that the build does not index, and a story that already stalled
	if (!captureQueueOptions.indexedStoryIds.has(imageCaptureKey.storyId)) {
		return toErrorRecord(imageCaptureKey, "the built component browser has no story with this id")
	}
	if (captureQueueOptions.stalledStoryIds.has(imageCaptureKey.storyId)) {
		return toErrorRecord(
			imageCaptureKey,
			"the story stalled while capturing an earlier image, so this one was not taken",
		)
	}

	// the image capture, remembering a stall
	const serverOrigin = captureQueueOptions.serverOrigin
	const { imageCaptureRecord, isStalled } = await captureOneStory({ page, serverOrigin, imageCaptureKey })
	if (isStalled) {
		captureQueueOptions.stalledStoryIds.add(imageCaptureKey.storyId)
	}
	return imageCaptureRecord
}

// a capture page in its own browser context, with the fixed locale, time zone, reduced motion, and scale, prepared
// for capturing
async function openCapturePageInContext(
	captureQueueOptions: CaptureQueueOptions,
): Promise<{ context: BrowserContext; page: Page }> {
	const firstImageCaptureSize = WEB_IMAGE_CAPTURE_SIZES[0]
	const context = await captureQueueOptions.browser.newContext({
		viewport: { width: firstImageCaptureSize.width, height: firstImageCaptureSize.height },
		deviceScaleFactor: 1,
		locale: "en-US",
		timezoneId: "UTC",
		reducedMotion: "reduce",
		colorScheme: "light",
		serviceWorkers: "block",
	})
	await prepareCaptureContext(context, captureQueueOptions.serverOrigin)

	// the page, marked crashed if its renderer crashes
	const page = await openCapturePage(context)
	page.on("crash", () => crashedPages.add(page))
	return { context, page }
}

// capture one story in its theme at its size, turning a thrown error into an error record, and say whether it stalled
async function captureOneStory({
	page,
	serverOrigin,
	imageCaptureKey,
}: {
	page: Page
	serverOrigin: string
	imageCaptureKey: ImageCaptureKey
}): Promise<{ imageCaptureRecord: ImageCaptureRecord; isStalled: boolean }> {
	// the image capture's theme and size
	const theme = PALETTES.find((palette) => palette.paletteName === imageCaptureKey.paletteName)?.theme ?? "light"
	const imageCaptureSize =
		WEB_IMAGE_CAPTURE_SIZES.find((size) => size.sizeName === imageCaptureKey.sizeName) ?? WEB_IMAGE_CAPTURE_SIZES[0]
	const storyCapture = { storyId: imageCaptureKey.storyId, theme, ...imageCaptureSize }

	// capture the story and keep its images
	try {
		const storyCaptureResult = await captureStory({ page, serverOrigin, storyCapture })
		const isStalled = storyCaptureResult.status === "error" && storyCaptureResult.isStalled
		return { imageCaptureRecord: toImageCaptureRecord(imageCaptureKey, storyCaptureResult), isStalled }
	} catch (error) {
		return { imageCaptureRecord: toErrorRecord(imageCaptureKey, toErrorText(error)), isStalled: false }
	}
}

// an image capture's record, writing its image and, if it was unstable, its retake beside it
function toImageCaptureRecord(
	imageCaptureKey: ImageCaptureKey,
	storyCaptureResult: StoryCaptureResult,
): ImageCaptureRecord {
	// an error and a skip have no image
	const { blockedUrls } = storyCaptureResult
	if (storyCaptureResult.status === "error") {
		return { ...imageCaptureKey, blockedUrls, status: "error", errorText: storyCaptureResult.errorText }
	}
	if (storyCaptureResult.status === "skipped") {
		return { ...imageCaptureKey, blockedUrls, status: "skipped", skipReason: storyCaptureResult.skipReason }
	}

	// the image capture's image, and the retake of an unstable image capture
	writeOutputImage(posix.join(OUTPUT_FOLDER, toOutputImagePath("current", imageCaptureKey)), storyCaptureResult.image)
	if (storyCaptureResult.status === "unstable") {
		writeOutputImage(
			posix.join(OUTPUT_FOLDER, toOutputImagePath("retake", imageCaptureKey)),
			storyCaptureResult.retakeImage,
		)
		return { ...imageCaptureKey, blockedUrls, status: "unstable" }
	}
	return {
		...imageCaptureKey,
		blockedUrls,
		status: "stable",
		accessibilityResult: storyCaptureResult.accessibilityResult,
	}
}

// an error record for an image capture, with no image
function toErrorRecord(imageCaptureKey: ImageCaptureKey, errorText: string): ImageCaptureRecord {
	return { ...imageCaptureKey, blockedUrls: [], status: "error", errorText }
}
