// the comparison step: each stable image capture against its approved baseline, pixel by pixel, with a diff image for
// each change, then the platform's report with every image capture's outcome and each baseline that no longer has an
// image capture
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { posix } from "node:path"
import pixelmatch from "pixelmatch"
import { PNG } from "pngjs"
import { toErrorText } from "../errorText"
import {
	type AccessibilityResult,
	type BaselineManifest,
	type ImageCaptureKey,
	type ImageCaptureManifest,
	type ImageCapturePlatform,
	type ImageCaptureRecord,
	type ImageSize,
	PALETTES,
	PLATFORM_SIZE_NAMES,
	type PlatformReport,
	type ReportEntry,
	toBaselineManifestPath,
	toImageCaptureFileName,
	toImageCaptureKeyFromFileName,
	toImageCaptureLabel,
	toImageCapturePath,
	toOutputImagePath,
} from "../imageCaptures"
import { readJsonFile } from "../jsonFiles"

/** How far a pixel's color may move before it counts as changed: pixelmatch's color distance, from 0 to 1. */
export const PIXEL_COLOR_THRESHOLD = 0.1

/**
 * What comparing two images found: the differing pixels and their share, both sizes, and the diff image, encoded only
 * when asked for.
 */
export type ImageComparison = {
	differingPixelCount: number
	differingPixelRatio: number
	baselineSize: ImageSize
	currentSize: ImageSize
	toDiffImage: () => Buffer
}

/** The folders that a comparison reads baselines from and writes its images into. */
export type ComparisonFolders = { baselinesFolder: string; outputFolder: string }

// a stable image capture's fields before its comparison decides its status
type StableImageCaptureFields = ImageCaptureKey & { blockedUrls: string[]; accessibilityResult: AccessibilityResult }

/**
 * Compares two PNG images pixel by pixel. The smaller one is padded with transparent pixels, so a size change differs.
 */
export function compareImages(baselineImage: Buffer, currentImage: Buffer): ImageComparison {
	// both images decoded, and the larger of their sizes
	const baselinePng = PNG.sync.read(baselineImage)
	const currentPng = PNG.sync.read(currentImage)
	const comparedSize = {
		width: Math.max(baselinePng.width, currentPng.width),
		height: Math.max(baselinePng.height, currentPng.height),
	}

	// the differing pixels at that size, drawn into the diff image, with anti-aliased pixels ignored
	const diffPng = new PNG(comparedSize)
	const differingPixelCount = pixelmatch(
		toPaddedPixels(baselinePng, comparedSize),
		toPaddedPixels(currentPng, comparedSize),
		diffPng.data,
		comparedSize.width,
		comparedSize.height,
		{ threshold: PIXEL_COLOR_THRESHOLD, includeAA: false },
	)
	return {
		differingPixelCount,
		differingPixelRatio: differingPixelCount / (comparedSize.width * comparedSize.height),
		baselineSize: { width: baselinePng.width, height: baselinePng.height },
		currentSize: { width: currentPng.width, height: currentPng.height },
		toDiffImage: () => PNG.sync.write(diffPng),
	}
}

/**
 * Returns whether two PNG images match: the same bytes, or no pixel differing beyond the tolerance at the same size.
 */
export function isMatchingImage(firstImage: Buffer, secondImage: Buffer): boolean {
	return firstImage.equals(secondImage) || isMatchingComparison(compareImages(firstImage, secondImage))
}

/**
 * Compares a platform's image captures with their baselines, writes each diff and changed baseline beside the image
 * captures, and returns the platform's report.
 */
export function comparePlatform({
	imageCaptureManifest,
	comparisonFolders,
}: {
	imageCaptureManifest: ImageCaptureManifest
	comparisonFolders: ComparisonFolders
}): PlatformReport {
	// each selected image capture's record, found by its label
	const imageCaptureRecordsByLabel = new Map(
		imageCaptureManifest.imageCaptureRecords.map((imageCaptureRecord) => [
			toImageCaptureLabel(imageCaptureRecord),
			imageCaptureRecord,
		]),
	)

	// an outcome for every selected image capture, or an error for an image capture that could not be compared, such as an
	// image that does not decode, then one for every baseline with no image capture to compare it with
	const capturedEntries = imageCaptureManifest.selectedImageCaptures.map((imageCaptureKey): ReportEntry => {
		const imageCaptureRecord = imageCaptureRecordsByLabel.get(toImageCaptureLabel(imageCaptureKey))
		try {
			return toReportEntry({ imageCaptureKey, imageCaptureRecord, comparisonFolders })
		} catch (error) {
			const errorText = `the image capture could not be compared: ${toErrorText(error)}`
			return {
				...imageCaptureKey,
				blockedUrls: imageCaptureRecord?.blockedUrls ?? [],
				imagePaths: {},
				status: "error",
				errorText,
			}
		}
	})
	const removedEntries = toRemovedEntries({ imageCaptureManifest, baselinesFolder: comparisonFolders.baselinesFolder })

	// the report, with the environment that the baselines were approved in
	const baselineManifest = readBaselineManifest(imageCaptureManifest.platform, comparisonFolders.baselinesFolder)
	return {
		platform: imageCaptureManifest.platform,
		environmentId: imageCaptureManifest.environmentId,
		baselineEnvironmentId: baselineManifest?.environmentId ?? null,
		skippedStoryIds: imageCaptureManifest.skippedStoryIds,
		reportEntries: [...capturedEntries, ...removedEntries],
	}
}

/**
 * Returns a platform's baseline manifest, or null for a platform with no approved baselines yet.
 */
export function readBaselineManifest(platform: ImageCapturePlatform, baselinesFolder: string): BaselineManifest | null {
	const manifestPath = toBaselineManifestPath(platform, baselinesFolder)
	return existsSync(manifestPath) ? readJsonFile<BaselineManifest>(manifestPath) : null
}

/**
 * Returns every image capture that a platform takes of one story: each palette at each size.
 */
export function toPlatformImageCaptureKeys(platform: ImageCapturePlatform, storyId: string): ImageCaptureKey[] {
	return PALETTES.flatMap((palette) =>
		PLATFORM_SIZE_NAMES[platform].map((sizeName) => ({
			platform,
			storyId,
			paletteName: palette.paletteName,
			sizeName,
		})),
	)
}

// one selected image capture's outcome: an image capture never taken, an error, unstable, new, passed, or changed
function toReportEntry({
	imageCaptureKey,
	imageCaptureRecord,
	comparisonFolders,
}: {
	imageCaptureKey: ImageCaptureKey
	imageCaptureRecord: ImageCaptureRecord | undefined
	comparisonFolders: ComparisonFolders
}): ReportEntry {
	// a selected image capture with no record was never taken
	if (!imageCaptureRecord) {
		return {
			...imageCaptureKey,
			blockedUrls: [],
			imagePaths: {},
			status: "error",
			errorText: "the image capture was not taken",
		}
	}

	// an error is reported without a baseline
	const { blockedUrls } = imageCaptureRecord
	const currentPath = toOutputImagePath("current", imageCaptureKey)
	if (imageCaptureRecord.status === "error") {
		return { ...imageCaptureKey, blockedUrls, imagePaths: {}, status: "error", errorText: imageCaptureRecord.errorText }
	}

	// so is an image capture that the story's own globals skip
	if (imageCaptureRecord.status === "skipped") {
		return {
			...imageCaptureKey,
			blockedUrls,
			imagePaths: {},
			status: "skipped",
			skipReason: imageCaptureRecord.skipReason,
		}
	}

	// two images that never matched are reported side by side, without a baseline
	if (imageCaptureRecord.status === "unstable") {
		const imagePaths = { currentPath, retakePath: toOutputImagePath("retake", imageCaptureKey) }
		return { ...imageCaptureKey, blockedUrls, imagePaths, status: "unstable" }
	}

	// a stable image capture with no baseline is new, and one with a baseline is compared
	const stableImageCaptureFields = {
		...imageCaptureKey,
		blockedUrls,
		accessibilityResult: imageCaptureRecord.accessibilityResult,
	}
	const baselineSourcePath = toImageCapturePath(comparisonFolders.baselinesFolder, imageCaptureKey)
	if (!existsSync(baselineSourcePath)) {
		return { ...stableImageCaptureFields, imagePaths: { currentPath }, status: "new" }
	}
	return toComparedEntry({ stableImageCaptureFields, baselineSourcePath, comparisonFolders })
}

// a stable image capture compared with its baseline: passed, or changed with its diff and a copy of the baseline
function toComparedEntry({
	stableImageCaptureFields,
	baselineSourcePath,
	comparisonFolders,
}: {
	stableImageCaptureFields: StableImageCaptureFields
	baselineSourcePath: string
	comparisonFolders: ComparisonFolders
}): ReportEntry {
	// the image capture and its baseline. the same bytes pass without decoding either image
	const currentPath = toOutputImagePath("current", stableImageCaptureFields)
	const currentImage = readFileSync(posix.join(comparisonFolders.outputFolder, currentPath))
	const baselineImage = readFileSync(baselineSourcePath)
	if (baselineImage.equals(currentImage)) {
		return { ...stableImageCaptureFields, imagePaths: { currentPath }, status: "passed" }
	}

	// compared pixel by pixel, an image capture within the tolerance passes
	const imageComparison = compareImages(baselineImage, currentImage)
	if (isMatchingComparison(imageComparison)) {
		return { ...stableImageCaptureFields, imagePaths: { currentPath }, status: "passed" }
	}

	// a change keeps its diff and a copy of its baseline beside the image capture
	const diffPath = toOutputImagePath("diff", stableImageCaptureFields)
	const baselinePath = toOutputImagePath("baseline", stableImageCaptureFields)
	writeOutputImage(posix.join(comparisonFolders.outputFolder, diffPath), imageComparison.toDiffImage())
	copyOutputImage(baselineSourcePath, posix.join(comparisonFolders.outputFolder, baselinePath))
	return {
		...stableImageCaptureFields,
		imagePaths: { baselinePath, currentPath, diffPath },
		status: "changed",
		differingPixelCount: imageComparison.differingPixelCount,
		differingPixelRatio: imageComparison.differingPixelRatio,
		baselineSize: imageComparison.baselineSize,
		currentSize: imageComparison.currentSize,
	}
}

// every approved image with no image capture to compare it with: its story is gone or skipped, or its file is no longer
// captured
function toRemovedEntries({
	imageCaptureManifest,
	baselinesFolder,
}: {
	imageCaptureManifest: ImageCaptureManifest
	baselinesFolder: string
}): ReportEntry[] {
	// the stories that are still captured, and the file names that each one writes
	const platform = imageCaptureManifest.platform
	const skippedStoryIds = new Set(imageCaptureManifest.skippedStoryIds)
	const capturedStoryIds = new Set(imageCaptureManifest.storyIds.filter((storyId) => !skippedStoryIds.has(storyId)))
	const imageCaptureFileNames = new Set(toPlatformImageCaptureKeys(platform, "").map(toImageCaptureFileName))

	// each baseline image in a story folder whose story is no longer captured, or whose file name no image capture has
	const platformFolder = posix.join(baselinesFolder, platform)
	const storyFolders = existsSync(platformFolder)
		? readdirSync(platformFolder, { withFileTypes: true }).filter((folderEntry) => folderEntry.isDirectory())
		: []
	return storyFolders.flatMap((storyFolder) => {
		const storyId = storyFolder.name
		const fileNames = readdirSync(posix.join(platformFolder, storyId))
		const removedFileNames = fileNames.filter(
			(fileName) => !capturedStoryIds.has(storyId) || !imageCaptureFileNames.has(fileName),
		)

		// a removed entry for each file that is named like an image capture
		return removedFileNames.flatMap((fileName) => {
			const imageCaptureKey = toImageCaptureKeyFromFileName({ platform, storyId, fileName })
			return imageCaptureKey
				? [{ ...imageCaptureKey, blockedUrls: [], imagePaths: {}, status: "removed" as const }]
				: []
		})
	})
}

// whether a comparison found two images to match: no pixel differing beyond the tolerance, at the same size
function isMatchingComparison(imageComparison: ImageComparison): boolean {
	return (
		imageComparison.differingPixelCount === 0 && isSameSize(imageComparison.baselineSize, imageComparison.currentSize)
	)
}

// whether two images have the same size
function isSameSize(firstSize: ImageSize, secondSize: ImageSize): boolean {
	return firstSize.width === secondSize.width && firstSize.height === secondSize.height
}

/**
 * Writes an image into the output folder's tree, making its folder first.
 */
export function writeOutputImage(imagePath: string, image: Buffer): void {
	mkdirSync(posix.dirname(imagePath), { recursive: true })
	writeFileSync(imagePath, image)
}

// copy an image, making its folder first
function copyOutputImage(sourcePath: string, imagePath: string): void {
	mkdirSync(posix.dirname(imagePath), { recursive: true })
	copyFileSync(sourcePath, imagePath)
}

// an image's pixels at a larger size, with transparent pixels where the image does not reach
function toPaddedPixels(png: PNG, paddedSize: ImageSize): Uint8Array {
	if (isSameSize(png, paddedSize)) {
		return png.data
	}
	const paddedPng = new PNG(paddedSize)
	PNG.bitblt(png, paddedPng, 0, 0, png.width, png.height, 0, 0)
	return paddedPng.data
}
