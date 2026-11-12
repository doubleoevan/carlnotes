// the film's ffmpeg arguments: a shot's move, crossfade, lower third, and fades, the intro's and the sign-off's zoom,
// and the film's mux and rebuild
import { expect, test } from "bun:test"
import {
	toFilmMuxArguments,
	toFilmRemuxArguments,
	toImagePartPushSeconds,
	toVideoImagePartArguments,
	toVideoShotArguments,
	type VideoImagePartEncode,
	type VideoShotEncode,
	type VideoShotPicture,
} from "./videoEncode"

// a six-second shot of an image that holds a zoom to 2, which another shot follows
const SHOT_PICTURE: VideoShotPicture = {
	stillPath: "/work/chapter-0-still-1.png",
	zoomLimit: 2,
	move: "zoom-in",
	frameCount: 134,
	screenFrameCount: 144,
}

// the shot before it, of a smaller image that pans
const PREVIOUS_SHOT_PICTURE: VideoShotPicture = {
	stillPath: "/work/chapter-0-still-0.png",
	zoomLimit: 1.25,
	move: "pan-left",
	frameCount: 120,
	screenFrameCount: 130,
}

// a shot in the middle of its segment, past the lower third
const MIDDLE_SHOT: VideoShotEncode = {
	...SHOT_PICTURE,
	previousShot: PREVIOUS_SHOT_PICTURE,
	lowerThird: null,
	isSegmentStart: false,
	isSegmentEnd: false,
	shotPath: "/work/chapter-0-shot-3.mp4",
}

// a forty-second intro
const INTRO_PART: VideoImagePartEncode = {
	stillPath: "/work/shown-image-still.png",
	lowerThirdPath: "/work/intro-lower-third.png",
	frameCount: 960,
	part: "intro",
	partPath: "/work/intro.mp4",
}

// a run's filter graph
function toFilterGraph(ffmpegArguments: string[]): string {
	return ffmpegArguments[ffmpegArguments.indexOf("-filter_complex") + 1] ?? ""
}

// an intro's zoom some seconds in: the push to its end, then the creep
function toIntroZoomAt(seconds: number, partSeconds: number): number {
	const pushSeconds = toImagePartPushSeconds(partSeconds)
	return 1.12 ** Math.min(seconds, pushSeconds) * 1.005 ** Math.max(seconds - pushSeconds, 0)
}

// a shot stops at its own frames, keeps a keyframe every two seconds, and writes video only
test("a shot encodes its exact frames with fixed keyframes and no audio", () => {
	const shotArguments = toVideoShotArguments(MIDDLE_SHOT)
	expect(shotArguments.join(" ")).toContain("-frames:v 134")
	expect(shotArguments.join(" ")).toContain("-g 48 -keyint_min 48 -sc_threshold 0")
	expect(shotArguments.join(" ")).toContain("-crf 28")
	expect(shotArguments.slice(-2)).toEqual(["-an", "/work/chapter-0-shot-3.mp4"])
})

// a zoom grows by the same share each second, and a zoom out runs the same zoom backward over the frames on screen
test("a zoom in grows 8 percent a second, and a zoom out ends on the full image", () => {
	const zoomInGraph = toFilterGraph(toVideoShotArguments(MIDDLE_SHOT))
	const zoomOutGraph = toFilterGraph(toVideoShotArguments({ ...MIDDLE_SHOT, move: "zoom-out" }))
	expect(zoomInGraph).toContain("[0:v]zoompan=z='pow(1.08,(on+0)/24)':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=134:")
	expect(zoomOutGraph).toContain("[0:v]zoompan=z='pow(1.08,(144-(on+0))/24)':")
})

// an image that holds less zoom moves slower, so it ends on its limit as it leaves the screen
test("a small image zooms slower, to its limit", () => {
	const slowGraph = toFilterGraph(toVideoShotArguments({ ...MIDDLE_SHOT, zoomLimit: 1.25 }))
	const [, zoomRate] = slowGraph.match(/z='pow\(([\d.]+),\(on\+0\)\/24\)'/) ?? []
	expect(Number(zoomRate)).toBeLessThan(1.08)
	expect(Number(zoomRate) ** 6).toBeCloseTo(1.25, 4)
})

// a pan holds its zoom and crosses the room that its zoom leaves, from the right to the left or the other way
test("a pan holds its zoom and travels across the image", () => {
	const panLeftGraph = toFilterGraph(toVideoShotArguments({ ...MIDDLE_SHOT, move: "pan-left" }))
	const panRightGraph = toFilterGraph(toVideoShotArguments({ ...MIDDLE_SHOT, move: "pan-right" }))
	expect(panLeftGraph).toContain("zoompan=z='1.48':x='(iw-iw/zoom)*(1-(on+0)/144)':y='ih/2-(ih/zoom/2)':d=134:")
	expect(panRightGraph).toContain("zoompan=z='1.48':x='(iw-iw/zoom)*(on+0)/144':y='ih/2-(ih/zoom/2)':d=134:")
})

// the still before a shot keeps its own move from where its run stopped, for ten frames, and fades out over them
test("a shot crossfades from the still before it, which keeps moving", () => {
	const shotArguments = toVideoShotArguments(MIDDLE_SHOT)
	const filterGraph = toFilterGraph(shotArguments)
	expect(shotArguments.slice(0, 5)).toEqual(["-y", "-i", SHOT_PICTURE.stillPath, "-i", PREVIOUS_SHOT_PICTURE.stillPath])

	// the pan goes on from frame 120 of its 130, and the tail fades out over the shot
	expect(filterGraph).toContain("[1:v]zoompan=z='1.25':x='(iw-iw/zoom)*(1-(on+120)/130)':y='ih/2-(ih/zoom/2)':d=10:")
	expect(filterGraph).toMatch(/format=yuva420p,fade=t=out:st=0:d=0\.41\d+:alpha=1\[tail\]/)
	expect(filterGraph).toContain("[shot][tail]overlay=0:0:eof_action=pass[crossfaded]")
	expect(filterGraph).toContain("[crossfaded]format=yuv420p[segment]")
})

// a segment's first shot has no still before it, and fades in from espresso
test("a segment's first shot has no crossfade and fades in from espresso", () => {
	const firstShot = { ...MIDDLE_SHOT, previousShot: null, isSegmentStart: true }
	const shotArguments = toVideoShotArguments(firstShot)
	const filterGraph = toFilterGraph(shotArguments)
	expect(shotArguments.filter((argument) => argument === "-i")).toHaveLength(1)
	expect(filterGraph).not.toContain("[tail]")
	expect(filterGraph).toContain("[shot]fade=t=in:st=0:d=0.3:color=0x0f0c09,format=yuv420p[segment]")
})

// a segment's last shot fades out to espresso over its last 0.3 seconds, and a shot in the middle fades neither way
test("only a segment's ends fade through espresso", () => {
	const lastShotGraph = toFilterGraph(toVideoShotArguments({ ...MIDDLE_SHOT, isSegmentEnd: true }))
	const middleShotGraph = toFilterGraph(toVideoShotArguments(MIDDLE_SHOT))
	expect(lastShotGraph).toMatch(/fade=t=out:st=5\.28\d*:d=0\.3:color=0x0f0c09,format=yuv420p\[segment\]/)
	expect(middleShotGraph).not.toContain("color=0x0f0c09")
})

// a one-shot segment shorter than both fades splits its length between them
test("a short segment fades for half its length each way", () => {
	const shortShot = { ...MIDDLE_SHOT, previousShot: null, frameCount: 12, isSegmentStart: true, isSegmentEnd: true }
	const shortGraph = toFilterGraph(toVideoShotArguments(shortShot))
	expect(shortGraph).toContain("fade=t=in:st=0:d=0.25:color=0x0f0c09,fade=t=out:st=0.25:d=0.25:color=0x0f0c09")
})

// the lower third's fades are timed from the segment's start, whichever shot they fall in
test("the lower third keeps its segment's fades in a shot that starts later", () => {
	const lowerThird = { lowerThirdPath: "/work/chapter-0-lower-third.png", shotStartSeconds: 5.5 }
	const shotArguments = toVideoShotArguments({ ...MIDDLE_SHOT, lowerThird })
	const filterGraph = toFilterGraph(shotArguments)

	// the lower third loops as the third input, after the two stills
	expect(shotArguments.join(" ")).toContain("-framerate 24 -loop 1 -i /work/chapter-0-lower-third.png")
	expect(filterGraph).toContain(
		"[2:v]format=rgba,setpts=PTS+5.5/TB,fade=t=in:st=0.6:d=0.4:alpha=1,fade=t=out:st=7.6:d=0.4:alpha=1,setpts=PTS-5.5/TB[lowerThird]",
	)
	expect(filterGraph).toContain("[crossfaded][lowerThird]overlay=0:0[titled]")
	expect(filterGraph).toContain("[titled]format=yuv420p[segment]")
})

// a shot the lower third never reaches has no lower third input
test("a shot past the lower third draws none", () => {
	const shotArguments = toVideoShotArguments(MIDDLE_SHOT)
	expect(shotArguments).not.toContain("-loop")
	expect(toFilterGraph(shotArguments)).not.toContain("[lowerThird]")
})

// a forty-second intro pushes for 6.6 seconds to 2.1 times, then creeps to 2.5 times at its end
test("the intro pushes in, then creeps to 2.5 times at its end", () => {
	expect(toImagePartPushSeconds(40)).toBeCloseTo(6.62, 2)
	expect(toIntroZoomAt(0, 40)).toBe(1)
	expect(toIntroZoomAt(6.62, 40)).toBeCloseTo(2.12, 2)
	expect(toIntroZoomAt(40, 40)).toBeCloseTo(2.5, 6)

	// the filter graph holds the same push and creep, by the seconds since the intro's start
	const introGraph = toFilterGraph(toVideoImagePartArguments(INTRO_PART))
	expect(introGraph).toContain("zoompan=z='pow(1.12,min(on/24,6.616))*pow(1.005,max(on/24-6.616,0))':")
	expect(introGraph).toContain(":d=960:s=1280x720:fps=24[zoomed]")
})

// the sign-off runs the intro's zoom by the seconds to its end, so it starts at 2.5 times and ends on the full image
test("the sign-off runs the same zoom backward", () => {
	const signOffGraph = toFilterGraph(toVideoImagePartArguments({ ...INTRO_PART, part: "sign-off" }))
	expect(signOffGraph).toContain("zoompan=z='pow(1.12,min((959-on)/24,6.616))*pow(1.005,max((959-on)/24-6.616,0))':")
})

// an intro too short to reach 2.5 times pushes for its whole length
test("a short intro is the push alone", () => {
	expect(toImagePartPushSeconds(5)).toBe(5)
	expect(toIntroZoomAt(5, 5)).toBeCloseTo(1.76, 2)
	expect(toImagePartPushSeconds(8)).toBe(8)
	expect(toImagePartPushSeconds(8.2)).toBeLessThan(8.2)
})

// the intro's and the sign-off's lower third fades in and stays, and the part fades through espresso both ways
test("an image part keeps its lower third and fades in and out", () => {
	const introArguments = toVideoImagePartArguments(INTRO_PART)
	const introGraph = toFilterGraph(introArguments)
	expect(introGraph).toContain("[1:v]format=rgba,fade=t=in:st=0.6:d=0.4:alpha=1[lowerThird]")
	expect(introGraph).not.toContain("alpha=1,fade=t=out")

	// the part's own fades, and the file it writes
	expect(introGraph).toContain(
		"[zoomed][lowerThird]overlay=0:0,fade=t=in:st=0:d=0.3:color=0x0f0c09,fade=t=out:st=39.7:d=0.3:color=0x0f0c09,format=yuv420p[part]",
	)
	expect(introArguments.slice(-2)).toEqual(["-an", "/work/intro.mp4"])
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
