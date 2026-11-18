// A picture animation uses normalized coordinates on the composed film frame.
import { z } from "zod"
import { toVideoStillFit, VIDEO_HEIGHT, VIDEO_WIDTH } from "./videoFrames"

// the maximum pictures one chapter sends for animation planning and saves in its scene plan
export const CHAPTER_ANIMATION_CANDIDATE_LIMIT = 10

// the most distinct local effects selected by the animation model in one film
export const FILM_LOCAL_ANIMATION_LIMIT = 8

const coordinate = z.int().min(0).max(1000)
export const pictureAnimationRegion = z.strictObject({
	effect: z.enum(["water", "steam", "rain", "paper", "foliage", "glint"]),
	left: coordinate,
	top: coordinate,
	right: coordinate,
	bottom: coordinate,
})
export type PictureAnimation = z.infer<typeof pictureAnimationRegion>

/**
 * Checks the region size, the picture's origin and the approved animation for a fetched photograph.
 */
export function canAnimateRegion(region: PictureAnimation, origin: string): boolean {
	// Keep photographic animation inside continuous reflections, falling rain or a plume.
	if (
		origin !== "generated" &&
		!(origin === "resource" && ["water", "steam", "rain", "glint"].includes(region.effect))
	) {
		return false
	}

	// Keep the effect localized and large enough to read on a phone.
	const width = region.right - region.left
	const height = region.bottom - region.top
	return width >= 45 && height >= 45 && width * height >= 9000 && width * height <= 480000
}

/**
 * Keeps animation inside the upright foreground of a letterboxed or small image.
 */
export function isInsidePicture(region: PictureAnimation, size: { width: number; height: number }): boolean {
	if (toVideoStillFit(size) === "cover") {
		return true
	}
	// Fit over the same centered backdrop as the four-times oversampled still.
	const scale = Math.min(1, VIDEO_WIDTH / size.width, VIDEO_HEIGHT / size.height)
	const marginX = Math.ceil(500 * (1 - (scale * size.width) / VIDEO_WIDTH))
	const marginY = Math.ceil(500 * (1 - (scale * size.height) / VIDEO_HEIGHT))
	return (
		region.left >= marginX && region.top >= marginY && region.right <= 1000 - marginX && region.bottom <= 1000 - marginY
	)
}

/**
 * Builds a feathered displacement inside the original still, before its normal camera move.
 */
export function pictureAnimationFilters(
	region: PictureAnimation,
	input: number,
	frameOffset: number,
	frameCount: number,
): string[] {
	// Convert the region into even pixels on the four-times oversampled montage still.
	const pixel = (value: number, dimension: number) => 2 * Math.round((value * dimension * 2) / 1000)
	const x = pixel(region.left, VIDEO_WIDTH)
	const y = pixel(region.top, VIDEO_HEIGHT)
	const width = pixel(region.right, VIDEO_WIDTH) - x
	const height = pixel(region.bottom, VIDEO_HEIGHT) - y
	const prefix = `animation${input}`

	// Use a soft border with a flat interior so a small loose object can move as one piece.
	const mask = "clip(min(min(X/W,(W-1-X)/W),min(Y/H,(H-1-Y)/H))*7,0,1)"
	const time = `(N+${frameOffset})*2*PI/96`
	const wave = `(Y/H*13+X/W*2-${time}*2)`
	const rise = `(Y/H*6+${time})`
	const crop = [
		`[${input}:v]format=gbrp,loop=loop=-1:size=1:start=0,trim=end_frame=${frameCount},settb=1/24,setpts=N,split=2[${prefix}base][${prefix}crop]`,
		`[${prefix}crop]crop=${width}:${height}:${x}:${y}[${prefix}detail]`,
	]
	const overlay = `[${prefix}base][${prefix}moving]overlay=x=${x}:y=${y}:format=gbrp:shortest=1[${prefix}]`
	if (region.effect === "glint") {
		// sweep a broad highlight through the selected patch and taper its brightness at the edges
		const light = `128+108*pow(max(0,cos(5*X/W+2*Y/H-${time})),3)*${mask}`
		return [
			...crop,
			`nullsrc=s=96x64:r=24,trim=end_frame=${frameCount},format=gray,geq=lum='${light}',scale=${width}:${height}:in_range=full:out_range=full,format=gbrp[${prefix}light]`,
			`[${prefix}detail][${prefix}light]blend=all_mode=overlay[${prefix}moving]`,
			overlay,
		]
	}
	const offsets = {
		water: [`22*sin(${wave})+7*sin(Y/H*21+${time})`, `8*cos(${wave})`],
		steam: [`18*sin(${rise})`, `20*cos(${rise})`],
		rain: [`5*sin(${wave})`, `25*sin(${wave})`],
		paper: [`25*sin(${time})`, `36*sin(${time})`],
		foliage: [`25*sin(${rise})`, `8*cos(${rise})`],
	}[region.effect]

	// Create two small vector fields, then interpolate them over the selected crop in FFmpeg.
	const maps = offsets.map(
		(offset, axis) =>
			`nullsrc=s=96x64:r=24,trim=end_frame=${frameCount},format=gray,geq=lum='128+(${offset})*${mask}',scale=${width}:${height}:in_range=full:out_range=full,format=gbrp[${prefix}map${axis}]`,
	)
	return [
		...crop,
		...maps,
		`[${prefix}detail][${prefix}map0][${prefix}map1]displace=edge=smear[${prefix}moving]`,
		overlay,
	]
}

/** Accepts an existing effect again or allocates one of the film's local effects to a new picture. */
export function acceptLocalPictureAnimation(used: Set<string>, sourceImageHash: string): boolean {
	if (used.has(sourceImageHash)) {
		return true
	}
	if (used.size >= FILM_LOCAL_ANIMATION_LIMIT) {
		return false
	}
	used.add(sourceImageHash)
	return true
}
