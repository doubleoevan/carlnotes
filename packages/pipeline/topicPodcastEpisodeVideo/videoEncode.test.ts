// the film's ffmpeg arguments: a segment's frames, settings, fades, and slide, and the film's mux and rebuild
import { expect, test } from "bun:test"
import {
	toFilmMuxArguments,
	toFilmRemuxArguments,
	toSlideDirection,
	toVideoSegmentArguments,
	type VideoSegmentEncode,
} from "./videoEncode"

// a three-second chapter segment that fades in
const CHAPTER_SEGMENT: VideoSegmentEncode = {
	stillPath: "/work/still.png",
	lowerThirdPath: "/work/lower-third.png",
	frameCount: 72,
	segmentKind: "chapter",
	slideDirection: null,
	segmentPath: "/work/chapter-0.mp4",
}

// a segment's filter graph
function toFilterGraph(videoSegmentEncode: VideoSegmentEncode): string {
	const videoSegmentArguments = toVideoSegmentArguments(videoSegmentEncode)
	return videoSegmentArguments[videoSegmentArguments.indexOf("-filter_complex") + 1] ?? ""
}

// how far a sliding still is from its place at a time, in pixels along its axis, read from the overlay's expression:
// its sign and axis, the two weights of the back ease, and the slide's length
function toSlidePixelsAt(filterGraph: string, seconds: number): number {
	const match = filterGraph.match(/'(-?)([WH])\*\(([\d.]+)\*pow\(min\(t\/([\d.]+),1\)-1,3\)\+([\d.]+)\*pow\(/)
	const [, sign, axis, cubicWeight, slideSeconds, squareWeight] = match ?? []
	const easeTime = Math.min(seconds / Number(slideSeconds), 1) - 1
	const slideOffset = Number(cubicWeight) * easeTime ** 3 + Number(squareWeight) * easeTime ** 2
	return (sign === "-" ? -1 : 1) * (axis === "W" ? 1280 : 720) * slideOffset
}

// the zoom a filter graph gives one frame, from its start or end zoom, its range, and its eased progress
function toZoomAt(filterGraph: string, frame: number): number {
	const match = filterGraph.match(/z='([\d.]+)([+-])([\d.]+)\*\(1-cos\(PI\*on\/(\d+)\)\)\/2'/)
	const [, zoomStart, sign, zoomRange, lastFrame] = match ?? []
	const easedProgress = (1 - Math.cos((Math.PI * frame) / Number(lastFrame))) / 2
	return Number(zoomStart) + (sign === "-" ? -1 : 1) * Number(zoomRange) * easedProgress
}

// a segment stops at its frames, keeps a keyframe every two seconds, and writes video only
test("a segment encodes its exact frames with fixed keyframes and no audio", () => {
	const videoSegmentArguments = toVideoSegmentArguments(CHAPTER_SEGMENT)
	expect(videoSegmentArguments.join(" ")).toContain("-frames:v 72")
	expect(videoSegmentArguments.join(" ")).toContain("-g 48 -keyint_min 48 -sc_threshold 0")
	expect(videoSegmentArguments.join(" ")).toContain("-crf 28")
	expect(videoSegmentArguments.slice(-2)).toEqual(["-an", "/work/chapter-0.mp4"])
})

// the intro zooms in to 1.8 on its last frame, and the sign-off starts there and zooms back out to 1
test("the intro zooms in and the sign-off zooms out", () => {
	// read each filter graph's zoom
	const introGraph = toVideoSegmentArguments({ ...CHAPTER_SEGMENT, segmentKind: "intro" }).join(" ")
	const signOffGraph = toVideoSegmentArguments({ ...CHAPTER_SEGMENT, segmentKind: "sign-off" }).join(" ")
	expect(toZoomAt(introGraph, 0)).toBeCloseTo(1, 6)
	expect(toZoomAt(introGraph, 71)).toBeCloseTo(1.8, 6)
	expect(toZoomAt(signOffGraph, 0)).toBeCloseTo(1.8, 6)
	expect(toZoomAt(signOffGraph, 71)).toBeCloseTo(1, 6)
})

// the zoom moves least in its first and last frames and most in its middle
test("a zoom eases in and out", () => {
	const introGraph = toVideoSegmentArguments({ ...CHAPTER_SEGMENT, segmentKind: "intro" }).join(" ")
	const firstStep = toZoomAt(introGraph, 1) - toZoomAt(introGraph, 0)
	const middleStep = toZoomAt(introGraph, 36) - toZoomAt(introGraph, 35)
	const lastStep = toZoomAt(introGraph, 71) - toZoomAt(introGraph, 70)
	expect(middleStep).toBeGreaterThan(firstStep * 10)
	expect(middleStep).toBeGreaterThan(lastStep * 10)
})

// a segment shorter than both fades splits its length between them
test("a short segment fades for half its length each way", () => {
	const shortGraph = toVideoSegmentArguments({ ...CHAPTER_SEGMENT, frameCount: 24 }).join(" ")
	expect(shortGraph).toContain("fade=t=in:st=0:d=0.5:color=0x")
	expect(shortGraph).toContain("fade=t=out:st=0.5:d=0.5:color=0x")
})

// the zoom reaches 1.35 on the last frame, and the segment fades out over its last 1.2 seconds
test("a chapter zooms to 1.35 and fades out at its end", () => {
	// read the filter graph and the zoom's step per frame
	const videoSegmentArguments = toVideoSegmentArguments(CHAPTER_SEGMENT)
	const filterGraph = videoSegmentArguments[videoSegmentArguments.indexOf("-filter_complex") + 1]
	expect(toZoomAt(filterGraph ?? "", 71)).toBeCloseTo(1.35, 6)
	expect(filterGraph).toContain("fade=t=out:st=1.8:d=1.2:color=0x0f0c09")
})

// a segment with no slide keeps the graph it had: the still, the lower third over it, and both fades
test("a chapter with no slide fades in and has no background", () => {
	const filterGraph = toFilterGraph(CHAPTER_SEGMENT)
	expect(filterGraph).not.toContain("[background]")
	expect(filterGraph).toContain(
		"[zoomed][lowerThird]overlay=0:0,fade=t=in:st=0:d=1.2:color=0x0f0c09,fade=t=out:st=1.8:d=1.2:color=0x0f0c09,format=yuv420p[segment]",
	)
})

// the still slides in over an espresso frame, under the lower third, and the segment only fades out
test("a chapter with a slide moves its still in over espresso instead of fading in", () => {
	const filterGraph = toFilterGraph({ ...CHAPTER_SEGMENT, slideDirection: "left" })
	expect(filterGraph).toContain("color=c=0x0f0c09:s=1280x720:r=24[background]")
	expect(filterGraph).toContain(
		"[background][zoomed]overlay=x='W*(1.83*pow(min(t/0.9,1)-1,3)+0.83*pow(min(t/0.9,1)-1,2))':y='0'[slid]",
	)
	expect(filterGraph).toContain(
		"[slid][lowerThird]overlay=0:0,fade=t=out:st=1.8:d=1.2:color=0x0f0c09,format=yuv420p[segment]",
	)
	expect(filterGraph).not.toMatch(/fade=t=in:[^,;]*color=/)

	// the frames, the settings, and the inputs are the ones a fading segment has
	const slideArguments = toVideoSegmentArguments({ ...CHAPTER_SEGMENT, slideDirection: "left" })
	const fadeArguments = toVideoSegmentArguments(CHAPTER_SEGMENT)
	const filterGraphIndex = slideArguments.indexOf("-filter_complex") + 1
	expect(slideArguments.toSpliced(filterGraphIndex, 1)).toEqual(fadeArguments.toSpliced(filterGraphIndex, 1))
})

// each edge's still starts a whole frame outside it and ends exactly in place
test("a slide starts outside the frame on its edge and ends in place", () => {
	const startPixels = { left: -1280, right: 1280, top: -720, bottom: 720 }
	for (const slideDirection of ["left", "right", "top", "bottom"] as const) {
		// the still moves along one axis and the other stays at 0
		const filterGraph = toFilterGraph({ ...CHAPTER_SEGMENT, slideDirection })
		const isHorizontal = slideDirection === "left" || slideDirection === "right"
		expect(filterGraph).toContain(isHorizontal ? "':y='0'[slid]" : "overlay=x='0':y='")
		expect(toSlidePixelsAt(filterGraph, 0)).toBeCloseTo(startPixels[slideDirection], 6)
		expect(Math.abs(toSlidePixelsAt(filterGraph, 0.9))).toBe(0)
		expect(Math.abs(toSlidePixelsAt(filterGraph, 3))).toBe(0)
	}
})

// the still is most of the way in after a third of the slide, passes its place by 2 to 3 percent, and comes back
test("a slide moves fast at first, passes its place a little, and settles", () => {
	// sample the slide from the left once per frame
	const filterGraph = toFilterGraph({ ...CHAPTER_SEGMENT, slideDirection: "left" })
	const slidePixels = Array.from({ length: 23 }, (_, frame) => toSlidePixelsAt(filterGraph, frame / 24))
	const furthestPixels = Math.max(...slidePixels)
	expect(toSlidePixelsAt(filterGraph, 0.3)).toBeGreaterThan(-1280 * 0.25)
	expect(furthestPixels).toBeGreaterThan(1280 * 0.02)
	expect(furthestPixels).toBeLessThan(1280 * 0.03)
	expect(slidePixels.at(-1)).toBeLessThan(furthestPixels / 10)
})

// a one-second chapter slides for its first half and fades out for its second
test("a short chapter slides for half its length at most", () => {
	const shortGraph = toFilterGraph({ ...CHAPTER_SEGMENT, frameCount: 24, slideDirection: "bottom" })
	expect(shortGraph).toContain("y='-H*(1.83*pow(min(t/0.5,1)-1,3)+0.83*pow(min(t/0.5,1)-1,2))'")
	expect(shortGraph).toContain("overlay=0:0,fade=t=out:st=0.5:d=0.5:color=0x0f0c09")
})

// the edge is a pure function of the podcast episode and the position, and every edge is used
test("a chapter's slide direction is stable and varies across a film's chapters", () => {
	// the same chapter gets the same edge on every call
	const podcastEpisodeId = "0b9f6c1e-3f0a-4c58-9a51-6d2f4f8f2c11"
	const positions = Array.from({ length: 24 }, (_, position) => position)
	const slideDirections = positions.map((position) => toSlideDirection({ podcastEpisodeId, position }))
	expect(positions.map((position) => toSlideDirection({ podcastEpisodeId, position }))).toEqual(slideDirections)

	// all four edges occur, and another podcast episode gets another order
	expect(new Set(slideDirections)).toEqual(new Set(["left", "right", "top", "bottom"]))
	const otherSlideDirections = positions.map((position) => toSlideDirection({ podcastEpisodeId: "other", position }))
	expect(otherSlideDirections).not.toEqual(slideDirections)
})

// a chapter's lower third fades out by eight seconds, and an intro's stays
test("a chapter's lower third fades out and an intro's does not", () => {
	const chapterVideoSegmentArguments = toVideoSegmentArguments(CHAPTER_SEGMENT).join(" ")
	const introVideoSegmentArguments = toVideoSegmentArguments({ ...CHAPTER_SEGMENT, segmentKind: "intro" }).join(" ")
	expect(chapterVideoSegmentArguments).toContain("fade=t=out:st=7.6:d=0.4:alpha=1")
	expect(introVideoSegmentArguments).not.toContain("alpha=1,fade=t=out")
})

// the film copies the video, encodes the MP3 as AAC, and muxes the captions as mov_text
test("the film mux copies the parts and adds AAC audio and mov_text captions", () => {
	const muxArguments = toFilmMuxArguments({
		listPath: "/work/parts.txt",
		audioPath: "/work/audio.mp3",
		captionsPath: "/work/captions.vtt",
		filmPath: "/work/film.mp4",
	}).join(" ")
	expect(muxArguments).toContain("-map 0:v -map 1:a -map 2:s -c:v copy")
	expect(muxArguments).toContain("-c:a aac -b:a 96k -ac 1 -ar 44100")
	expect(muxArguments).toContain("-c:s mov_text")
	expect(muxArguments).toContain("-movflags +faststart")
})

// a rebuild copies every stream, taking the audio and captions from the film that plays now
test("the rebuild copies the audio and captions from the current film", () => {
	const remuxArguments = toFilmRemuxArguments({
		listPath: "/work/parts.txt",
		currentFilmPath: "/work/current.mp4",
		filmPath: "/work/film.mp4",
	}).join(" ")
	expect(remuxArguments).toContain("-map 0:v -map 1:a -map 1:s -c copy")
})
