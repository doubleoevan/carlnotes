// the comparator over generated images in a temporary folder: a passed image capture, a changed one with its diff, a
// taller render, a new image capture, an error, an unstable image capture, a skipped one, an image capture never taken,
// an image that does not decode, and removed baselines
import { afterEach, beforeEach, expect, test } from "bun:test"
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { posix } from "node:path"
import { PNG } from "pngjs"
import {
	type ImageCaptureKey,
	type ImageCaptureManifest,
	type ImageCaptureRecord,
	toImageCapturePath,
} from "../imageCaptures"
import { compareImages, comparePlatform } from "./compareImageCaptures"

// the temporary baselines and output folders of one test
let baselinesFolder = ""
let outputFolder = ""

// fresh folders before each test, removed after it
beforeEach(() => {
	const testFolder = mkdtempSync(posix.join(tmpdir(), "compare-image-captures-"))
	baselinesFolder = posix.join(testFolder, "baselines")
	outputFolder = posix.join(testFolder, "output")
})
afterEach(() => {
	rmSync(posix.dirname(baselinesFolder), { recursive: true, force: true })
})

// a solid image of one color, with an optional square of another color in its corner
function toImage({
	width = 8,
	height = 8,
	squareSize = 0,
}: {
	width?: number
	height?: number
	squareSize?: number
}): Buffer {
	// paint each pixel, then encode the image
	const png = new PNG({ width, height })
	for (let i = 0; i < width * height; i++) {
		const isInSquare = i % width < squareSize && Math.floor(i / width) < squareSize
		png.data.set(isInSquare ? [200, 40, 40, 255] : [240, 230, 210, 255], i * 4)
	}
	return PNG.sync.write(png)
}

// a web image capture of a story in Latte at the phone size
function toImageCaptureKey(storyId: string): ImageCaptureKey {
	return { platform: "web", storyId, paletteName: "latte", sizeName: "phone" }
}

// write an image under a folder at an image capture's path
function writeImageCapture(folder: string, imageCaptureKey: ImageCaptureKey, image: Buffer): void {
	const imagePath = toImageCapturePath(folder, imageCaptureKey)
	mkdirSync(posix.dirname(imagePath), { recursive: true })
	writeFileSync(imagePath, image)
}

// a stable record of an image capture
function toStableRecord(imageCaptureKey: ImageCaptureKey): ImageCaptureRecord {
	return {
		...imageCaptureKey,
		blockedUrls: [],
		status: "stable",
		accessibilityResult: { status: "checked", violations: [] },
	}
}

// a manifest over the given image captures and records, with every story id indexed
function toImageCaptureManifest(
	selectedImageCaptures: ImageCaptureKey[],
	imageCaptureRecords: ImageCaptureRecord[],
): ImageCaptureManifest {
	const storyIds = selectedImageCaptures.map((imageCaptureKey) => imageCaptureKey.storyId)
	return {
		platform: "web",
		environmentId: "test",
		storyIds,
		skippedStoryIds: [],
		selectedImageCaptures,
		imageCaptureRecords,
	}
}

// two identical images match, and a moved square counts its pixels
test("identical images match, and a changed square counts its pixels", () => {
	expect(compareImages(toImage({}), toImage({})).differingPixelCount).toBe(0)
	const imageComparison = compareImages(toImage({}), toImage({ squareSize: 2 }))
	expect(imageComparison.differingPixelCount).toBe(4)
	expect(imageComparison.differingPixelRatio).toBe(4 / 64)
})

// a taller render differs in every pixel that the shorter render does not reach, and both sizes are reported
test("a taller render is a change with both sizes", () => {
	const imageComparison = compareImages(toImage({}), toImage({ height: 10 }))
	expect(imageComparison.differingPixelCount).toBe(16)
	expect(imageComparison.baselineSize).toEqual({ width: 8, height: 8 })
	expect(imageComparison.currentSize).toEqual({ width: 8, height: 10 })
})

// each outcome that a selected image capture can have, with the images that each outcome keeps
test("every image capture gets its outcome and its images", () => {
	// a passed image capture, a changed one, a new one, an error, an unstable one, a skipped one, and one never taken
	const [passedKey, changedKey, newKey, errorKey, unstableKey, skippedKey, missingKey] = [
		"passed",
		"changed",
		"new",
		"error",
		"unstable",
		"skipped",
		"missing",
	].map(toImageCaptureKey) as ImageCaptureKey[]
	for (const imageCaptureKey of [passedKey, changedKey]) {
		writeImageCapture(baselinesFolder, imageCaptureKey as ImageCaptureKey, toImage({}))
	}
	writeImageCapture(posix.join(outputFolder, "current"), passedKey as ImageCaptureKey, toImage({}))
	writeImageCapture(posix.join(outputFolder, "current"), changedKey as ImageCaptureKey, toImage({ squareSize: 3 }))
	writeImageCapture(posix.join(outputFolder, "current"), newKey as ImageCaptureKey, toImage({}))

	// compare every selected image capture
	const imageCaptureRecords: ImageCaptureRecord[] = [
		toStableRecord(passedKey as ImageCaptureKey),
		toStableRecord(changedKey as ImageCaptureKey),
		toStableRecord(newKey as ImageCaptureKey),
		{ ...(errorKey as ImageCaptureKey), blockedUrls: [], status: "error", errorText: "the story threw" },
		{ ...(unstableKey as ImageCaptureKey), blockedUrls: [], status: "unstable" },
		{
			...(skippedKey as ImageCaptureKey),
			blockedUrls: [],
			status: "skipped",
			skipReason: "the story pins the phone viewport",
		},
	]
	const selectedImageCaptures = [
		passedKey,
		changedKey,
		newKey,
		errorKey,
		unstableKey,
		skippedKey,
		missingKey,
	] as ImageCaptureKey[]
	const platformReport = comparePlatform({
		imageCaptureManifest: toImageCaptureManifest(selectedImageCaptures, imageCaptureRecords),
		comparisonFolders: { baselinesFolder, outputFolder },
	})

	// each status, and the baseline, current, and diff images that a change keeps
	expect(platformReport.reportEntries.map((reportEntry) => reportEntry.status)).toEqual([
		"passed",
		"changed",
		"new",
		"error",
		"unstable",
		"skipped",
		"error",
	])
	const changedEntry = platformReport.reportEntries[1]
	expect(changedEntry?.imagePaths).toEqual({
		baselinePath: "baseline/web/changed/latte-phone.png",
		currentPath: "current/web/changed/latte-phone.png",
		diffPath: "diff/web/changed/latte-phone.png",
	})
	expect(existsSync(posix.join(outputFolder, "diff/web/changed/latte-phone.png"))).toBe(true)
	expect(platformReport.reportEntries[6]).toMatchObject({
		status: "error",
		errorText: "the image capture was not taken",
	})
})

// an image that does not decode is an error for its own image capture, and every other image capture is still compared
test("an image that does not decode is an error for its image capture alone", () => {
	// a baseline for each image capture, and a current image for one of them that is not a PNG
	const capturedKeys = ["corrupt", "passed"].map(toImageCaptureKey)
	for (const imageCaptureKey of capturedKeys) {
		writeImageCapture(baselinesFolder, imageCaptureKey, toImage({}))
	}
	writeImageCapture(posix.join(outputFolder, "current"), toImageCaptureKey("corrupt"), Buffer.from("not a png"))
	writeImageCapture(posix.join(outputFolder, "current"), toImageCaptureKey("passed"), toImage({}))

	// the corrupt image capture errors, and the other one still passes
	const platformReport = comparePlatform({
		imageCaptureManifest: toImageCaptureManifest(capturedKeys, capturedKeys.map(toStableRecord)),
		comparisonFolders: { baselinesFolder, outputFolder },
	})
	expect(platformReport.reportEntries.map((reportEntry) => reportEntry.status)).toEqual(["error", "passed"])
	expect(platformReport.reportEntries[0]).toMatchObject({ errorText: expect.stringContaining("could not be compared") })
})

// a baseline whose story is gone, and one in a size that is no longer captured, are removed
test("baselines with no image capture to compare are removed", () => {
	// a baseline for a deleted story, and one for a size that the platform no longer captures
	writeImageCapture(baselinesFolder, toImageCaptureKey("deleted"), toImage({}))
	writeImageCapture(baselinesFolder, { ...toImageCaptureKey("kept"), sizeName: "tablet" }, toImage({}))
	writeImageCapture(baselinesFolder, toImageCaptureKey("kept"), toImage({}))

	// a run that captures the kept story only
	const keptKey = toImageCaptureKey("kept")
	writeImageCapture(posix.join(outputFolder, "current"), keptKey, toImage({}))
	const platformReport = comparePlatform({
		imageCaptureManifest: toImageCaptureManifest([keptKey], [toStableRecord(keptKey)]),
		comparisonFolders: { baselinesFolder, outputFolder },
	})
	const removedEntries = platformReport.reportEntries.filter((reportEntry) => reportEntry.status === "removed")
	expect(removedEntries.map((reportEntry) => `${reportEntry.storyId} ${reportEntry.sizeName}`).sort()).toEqual([
		"deleted phone",
		"kept tablet",
	])
})
