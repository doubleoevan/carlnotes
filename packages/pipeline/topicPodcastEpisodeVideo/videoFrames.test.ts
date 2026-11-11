// the film frames' tests: the cover or fill choice, the still's size, the podcast card composed once, and the lower
// third's transparency.
// set VIDEO_FRAMES_OUTPUT to a folder, such as ui-tests/output/videoFrames, to write each png there for a visual check
import { expect, test } from "bun:test"
import { mkdir } from "node:fs/promises"
import { join } from "node:path"
import sharp from "sharp"
import { loadPodcastCardStillPng, toLowerThirdPng, toVideoStillFit, toVideoStillPng } from "./videoFrames"

// the folder to write the frames to for a look, if one is set
const VIDEO_FRAMES_OUTPUT = Bun.env.VIDEO_FRAMES_OUTPUT

// a flat test image of a size, in one color
function toFixtureImage(width: number, height: number, background: string): Promise<Buffer> {
	return sharp({ create: { width, height, channels: 3, background } })
		.png()
		.toBuffer()
}

// write a frame for a visual check if a folder is set
async function writeFrameForCheck(fileName: string, pngBytes: Uint8Array): Promise<void> {
	if (!VIDEO_FRAMES_OUTPUT) {
		return
	}
	await mkdir(VIDEO_FRAMES_OUTPUT, { recursive: true })
	await Bun.write(join(VIDEO_FRAMES_OUTPUT, fileName), pngBytes)
}

// only a 16:9 image at least as wide as the film covers the frame
test("a wide 16:9 image covers, and a small, square, or tall one fills", () => {
	expect(toVideoStillFit({ width: 1920, height: 1080 })).toBe("cover")
	expect(toVideoStillFit({ width: 1280, height: 720 })).toBe("cover")
	expect(toVideoStillFit({ width: 1200, height: 675 })).toBe("fill")
	expect(toVideoStillFit({ width: 1200, height: 630 })).toBe("fill")
	expect(toVideoStillFit({ width: 800, height: 800 })).toBe("fill")
	expect(toVideoStillFit({ width: 600, height: 1200 })).toBe("fill")
})

// every still comes out at four times the film's size, covered or filled
test("a still is composed at four times the film's size", async () => {
	// a covering image and a square one that fills over its backdrop
	const coverStill = await toVideoStillPng(await toFixtureImage(1920, 1080, "#2d6a8f"))
	const fillStill = await toVideoStillPng(await toFixtureImage(600, 600, "#c2410c"))
	for (const still of [coverStill, fillStill]) {
		const { width, height } = await sharp(still).metadata()
		expect({ width, height }).toEqual({ width: 5120, height: 2880 })
	}

	// write both for a look
	await writeFrameForCheck("cover-still.png", coverStill)
	await writeFrameForCheck("fill-still.png", fillStill)
})

// the podcast card's still is composed once for the process
test("two loads of the podcast card return the same still, composed once", async () => {
	// both loads return the one buffer, at four times the film's size
	const firstStill = await loadPodcastCardStillPng()
	const secondStill = await loadPodcastCardStillPng()
	expect(secondStill).toBe(firstStill)
	const { width, height } = await sharp(firstStill).metadata()
	expect({ width, height }).toEqual({ width: 5120, height: 2880 })
})

// bytes that are not an image throw an error, which the render answers with the podcast card
test("an undecodable image throws an error", async () => {
	await expect(toVideoStillPng(new Uint8Array([1, 2, 3]))).rejects.toThrow()
})

// the lower third is a transparent frame with an opaque plate
test("the lower third is transparent at the top and opaque on its plate", async () => {
	// draw a chapter's lower third and read its pixels
	const lowerThird = await toLowerThirdPng({
		title: "A small team shipped an agent that reads every pull request before a human does",
		detail: "github.blog",
	})
	await writeFrameForCheck("lower-third.png", lowerThird)
	const { data, info } = await sharp(lowerThird).raw().toBuffer({ resolveWithObject: true })
	const alphaAt = (x: number, y: number): number => data[(y * info.width + x) * info.channels + 3] ?? 0

	// the top of the frame is clear, and the plate near its bottom left is drawn
	expect({ width: info.width, height: info.height }).toEqual({ width: 1280, height: 720 })
	expect(alphaAt(640, 100)).toBe(0)
	expect(alphaAt(80, 660)).toBe(255)
})
