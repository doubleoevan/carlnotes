// the image capture model that every UI test step shares: the platforms, palettes, and sizes that an image capture is
// taken in, the folders that each step reads and writes, the shapes of an image capture record, a report entry, and a
// baseline manifest, and the reader of a folder's platform reports
import { existsSync, readdirSync } from "node:fs"
import { posix } from "node:path"
import { readJsonFile } from "./jsonFiles"

/** The platforms that an image capture is taken on. Each platform has its own baselines. */
export const IMAGE_CAPTURE_PLATFORMS = ["web", "mcp", "android", "ios"] as const

/** A platform that an image capture is taken on. */
export type ImageCapturePlatform = (typeof IMAGE_CAPTURE_PLATFORMS)[number]

/** The Nightshift palettes, each with the theme global that turns it on in the component browser. */
export const PALETTES = [
	{ paletteName: "latte", theme: "light" },
	{ paletteName: "dark-roast", theme: "dark" },
] as const

/** A Nightshift palette's name in an image capture's file name. */
export type PaletteName = (typeof PALETTES)[number]["paletteName"]

/** The web image capture sizes: the app's phone viewport and a fixed desktop viewport. */
export const WEB_IMAGE_CAPTURE_SIZES = [
	{ sizeName: "phone", width: 375, height: 812 },
	{ sizeName: "desktop", width: 1280, height: 800 },
] as const

/** The folder that every step writes into. Git ignores the folder. */
export const OUTPUT_FOLDER = "ui-tests/output"

/** The approved baselines, one folder per platform. */
export const BASELINES_FOLDER = "ui-tests/baselines"

/**
 * The vendored fonts, which the capture page serves in place of Google Fonts, and whose files the environment id
 * hashes.
 */
export const FONTS_FOLDER = "ui-tests/fonts"

/** Where the selection step writes the image captures that it selected. */
export const SELECTION_PATH = posix.join(OUTPUT_FOLDER, "selection.json")

/** The tag that leaves a story out of every image capture. A comment beside the tag says why. */
export const NO_SCREENSHOT_TAG = "no-screenshot"

/** One image capture: a story on one platform, in one palette, at one size. */
export type ImageCaptureKey = {
	platform: ImageCapturePlatform
	storyId: string
	paletteName: PaletteName
	sizeName: string
}

/** One violated accessibility rule: its id, its help text, how many elements break it, and the first few of them. */
export type AccessibilityViolation = { ruleId: string; help: string; nodeCount: number; nodeSelectors: string[] }

/** The accessibility addon's result for an image capture: the violated rules, or no result at all. */
export type AccessibilityResult =
	| { status: "checked"; violations: AccessibilityViolation[] }
	| { status: "not-available" }

/** What a capture step recorded for one image capture. A story that pins a size or a palette skips the others. */
export type ImageCaptureRecord = ImageCaptureKey & { blockedUrls: string[] } & (
		| { status: "stable"; accessibilityResult: AccessibilityResult }
		| { status: "error"; errorText: string }
		| { status: "unstable" }
		| { status: "skipped"; skipReason: string }
	)

/**
 * What a capture step wrote: its environment, the story ids that it saw and skipped, the image captures that it was
 * given, and each record.
 */
export type ImageCaptureManifest = {
	platform: ImageCapturePlatform
	environmentId: string
	storyIds: string[]
	skippedStoryIds: string[]
	selectedImageCaptures: ImageCaptureKey[]
	imageCaptureRecords: ImageCaptureRecord[]
}

/** A width and a height in pixels. */
export type ImageSize = { width: number; height: number }

/** The images that a report entry names, each a path relative to the output folder. */
export type ReportImagePaths = { baselinePath?: string; currentPath?: string; diffPath?: string; retakePath?: string }

/** An image capture that differs from its baseline: the differing pixels, their share, and both images' sizes. */
export type ChangedOutcome = {
	status: "changed"
	accessibilityResult: AccessibilityResult
	differingPixelCount: number
	differingPixelRatio: number
	baselineSize: ImageSize
	currentSize: ImageSize
}

/**
 * An image capture's outcome: passed, changed, new, removed, an error, unstable, or skipped by the story's own
 * globals.
 */
export type ImageCaptureOutcome =
	| { status: "passed"; accessibilityResult: AccessibilityResult }
	| ChangedOutcome
	| { status: "new"; accessibilityResult: AccessibilityResult }
	| { status: "removed" }
	| { status: "error"; errorText: string }
	| { status: "unstable" }
	| { status: "skipped"; skipReason: string }

/** One image capture's outcome in a platform's report, with its blocked requests and its images. */
export type ReportEntry = ImageCaptureKey & {
	blockedUrls: string[]
	imagePaths: ReportImagePaths
} & ImageCaptureOutcome

/** A report entry's status. */
export type ReportStatus = ReportEntry["status"]

/** The statuses that fail a job. */
export const FAILING_STATUSES: ReadonlySet<ReportStatus> = new Set(["changed", "error", "unstable"])

/** The statuses that wait for a developer's approval, apart from the failures. */
export const WAITING_STATUSES: ReadonlySet<ReportStatus> = new Set(["new", "removed"])

/**
 * One platform's report: its environment, the baselines' environment, the skipped stories, and an entry per image
 * capture.
 */
export type PlatformReport = {
	platform: ImageCapturePlatform
	environmentId: string
	baselineEnvironmentId: string | null
	skippedStoryIds: string[]
	reportEntries: ReportEntry[]
}

/** The roles of a run's images, each the name of its folder under the output folder. */
export type OutputImageRole = "current" | "retake" | "diff" | "baseline"

/** The size names that each platform captures a story at. */
export const PLATFORM_SIZE_NAMES: Record<ImageCapturePlatform, string[]> = {
	web: WEB_IMAGE_CAPTURE_SIZES.map((imageCaptureSize) => imageCaptureSize.sizeName),
	mcp: ["phone", "chat"],
	android: ["phone"],
	ios: ["phone"],
}

/** Where an approved image came from: the workflow run, its commit, the environment that captured it, and its hash. */
export type BaselineImageSource = { workflowRunId: string; commit: string; environmentId: string; sha256: string }

/** A platform's baseline manifest: the environment that its baselines are approved in, and each image's source. */
export type BaselineManifest = { environmentId: string; baselineImages: Record<string, BaselineImageSource> }

// a story, card, palette, or size name: lowercase words and digits joined by hyphens, which never names another folder
const PLAIN_NAME_PATTERN = /^[a-z0-9][a-z0-9-]*$/

/**
 * Returns whether an image capture key names a known platform, and plain story, palette, and size names. A path
 * built from a safe image capture key stays inside its platform's folder, even for a size that the platform no longer
 * captures.
 */
export function isSafeImageCaptureKey(imageCaptureKey: ImageCaptureKey): boolean {
	return (
		IMAGE_CAPTURE_PLATFORMS.some((platform) => platform === imageCaptureKey.platform) &&
		[imageCaptureKey.storyId, imageCaptureKey.paletteName, imageCaptureKey.sizeName].every((name) =>
			PLAIN_NAME_PATTERN.test(name),
		)
	)
}

/**
 * Returns an image capture's image path inside the output folder for one role: its current image, its retake, its diff,
 * or the copy of its baseline.
 */
export function toOutputImagePath(imageRole: OutputImageRole, imageCaptureKey: ImageCaptureKey): string {
	return toImageCapturePath(imageRole, imageCaptureKey)
}

/**
 * Returns an image capture's image path under a folder: the platform, the story id, then the palette and size.
 */
export function toImageCapturePath(folder: string, imageCaptureKey: ImageCaptureKey): string {
	return posix.join(folder, imageCaptureKey.platform, imageCaptureKey.storyId, toImageCaptureFileName(imageCaptureKey))
}

/**
 * Returns an image capture's image file name: its palette and size.
 */
export function toImageCaptureFileName(imageCaptureKey: Pick<ImageCaptureKey, "paletteName" | "sizeName">): string {
	return `${imageCaptureKey.paletteName}-${imageCaptureKey.sizeName}.png`
}

/**
 * Returns the path of a platform's report under the output folder.
 */
export function toPlatformReportPath(platform: ImageCapturePlatform): string {
	return posix.join(OUTPUT_FOLDER, `report-${platform}.json`)
}

// a platform report's file name in a folder
const PLATFORM_REPORT_FILE_PATTERN = new RegExp(`^report-(${IMAGE_CAPTURE_PLATFORMS.join("|")})\\.json$`)

/**
 * Returns every platform report in a folder, or none for a folder that does not exist.
 */
export function readPlatformReports(folder: string): PlatformReport[] {
	if (!existsSync(folder)) {
		return []
	}
	return readdirSync(folder)
		.filter((fileName) => PLATFORM_REPORT_FILE_PATTERN.test(fileName))
		.map((fileName) => readJsonFile<PlatformReport>(posix.join(folder, fileName)))
}

/**
 * Returns the path of a platform's image capture manifest under the output folder.
 */
export function toImageCaptureManifestPath(platform: ImageCapturePlatform): string {
	return posix.join(OUTPUT_FOLDER, `captures-${platform}.json`)
}

/**
 * Returns the path of a platform's baseline manifest under a baselines folder.
 */
export function toBaselineManifestPath(platform: ImageCapturePlatform, baselinesFolder: string): string {
	return posix.join(baselinesFolder, platform, "manifest.json")
}

/**
 * Returns the image capture key that a file name names on a platform, or null for a file name that no image capture
 * has.
 */
export function toImageCaptureKeyFromFileName({
	platform,
	storyId,
	fileName,
}: {
	platform: ImageCapturePlatform
	storyId: string
	fileName: string
}): ImageCaptureKey | null {
	// the palette that the name starts with, and the size after the palette
	const palette = PALETTES.find((candidate) => fileName.startsWith(`${candidate.paletteName}-`))
	const sizeName = palette ? fileName.slice(palette.paletteName.length + 1).replace(/\.png$/, "") : ""
	return palette && fileName.endsWith(".png") ? { platform, storyId, paletteName: palette.paletteName, sizeName } : null
}

/**
 * Returns an image capture's key in its platform's baseline manifest: the story id and the image's file name.
 */
export function toBaselineImageKey(imageCaptureKey: ImageCaptureKey): string {
	return posix.join(imageCaptureKey.storyId, toImageCaptureFileName(imageCaptureKey))
}

/**
 * Returns a readable label for an image capture: the platform, story, palette, and size.
 */
export function toImageCaptureLabel(imageCaptureKey: ImageCaptureKey): string {
	return `${imageCaptureKey.platform} ${imageCaptureKey.storyId} ${imageCaptureKey.paletteName} ${imageCaptureKey.sizeName}`
}
