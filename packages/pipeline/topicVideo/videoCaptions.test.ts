// the film captions' tests: turn timing, pause snapping, cue limits, speaker names, the lower third, and WebVTT with
// its cue text escaped
import { expect, test } from "bun:test"
import { toPauseSeconds, toVideoCaptionCues, toWebVtt, type VideoCaptionChapter } from "./videoCaptions"

// a chapter of two turns: Carl's long one and Vienna's short reply
const FIXTURE_CHAPTER: VideoCaptionChapter = {
	startSeconds: 10,
	endSeconds: 40,
	turns: [
		{
			speakerName: "Carl",
			text: "This week a small team shipped an agent that reads every pull request before a human does. It flags the risky ones, and it writes a short note on why, so the reviewer starts with context instead of a blank page.",
		},
		{ speakerName: "Vienna", text: "Honestly, that sounds like the reviewer I always wanted." },
	],
}

// the pauses: one early in Carl's turn, and one near where the characters put the turn boundary
const FIXTURE_PAUSES = [12, 35.2]

// each cue fits two lines of 42 characters and seven seconds, and the cues fill the chapter end to end
test("cues fit two short lines and seven seconds and cover the chapter", () => {
	// every cue stays inside the limits
	const cues = toVideoCaptionCues({ chapters: [FIXTURE_CHAPTER], pauseSeconds: FIXTURE_PAUSES })
	for (const cue of cues) {
		expect(cue.lines.length).toBeLessThanOrEqual(2)
		expect(cue.lines.every((line) => line.length <= 42)).toBe(true)
		expect(cue.endSeconds - cue.startSeconds).toBeLessThanOrEqual(7.0001)
	}

	// the first cue starts with the chapter, and the last one ends with it
	expect(cues[0]?.startSeconds).toBe(10)
	expect(cues.at(-1)?.endSeconds).toBe(40)
})

// the boundary between the turns lands on the pause near it, and each turn's first cue names its speaker
test("the turn boundary snaps to a nearby pause, and a turn opens with its speaker's name", () => {
	const cues = toVideoCaptionCues({ chapters: [FIXTURE_CHAPTER], pauseSeconds: FIXTURE_PAUSES })
	const viennaCue = cues.find((cue) => cue.lines[0]?.startsWith("Vienna:"))
	expect(viennaCue?.startSeconds).toBe(35.2)
	expect(cues[0]?.lines[0]?.startsWith("Carl:")).toBe(true)
	expect(cues.filter((cue) => cue.lines[0]?.startsWith("Carl:"))).toHaveLength(1)
})

// a boundary with no pause within a second and a half stays where the characters put it
test("a boundary with no pause in reach keeps its proportional time", () => {
	const cues = toVideoCaptionCues({ chapters: [FIXTURE_CHAPTER], pauseSeconds: [20] })
	const viennaCue = cues.find((cue) => cue.lines[0]?.startsWith("Vienna:"))
	expect(viennaCue?.startSeconds).toBeGreaterThan(33)
	expect(viennaCue?.startSeconds).not.toBe(20)
})

// the cues during the lower third's first eight seconds sit above it, and the later ones drop to the bottom
test("cues during the lower third are lifted above it", () => {
	const cues = toVideoCaptionCues({ chapters: [FIXTURE_CHAPTER], pauseSeconds: FIXTURE_PAUSES })
	expect(cues[0]?.isAboveLowerThird).toBe(true)
	expect(cues.at(-1)?.isAboveLowerThird).toBe(false)
	expect(toWebVtt(cues)).toContain("00:00:10.000 --> ")
	expect(toWebVtt(cues).split("line:74%,end").length - 1).toBe(cues.filter((cue) => cue.isAboveLowerThird).length)
})

// a turn's ampersand, angle brackets, and arrow are escaped, so the only arrows in the file are the cues' timings
test("cue text is escaped, so a turn can never read as a tag or as a cue's timing", () => {
	// one cue whose text holds each character WebVTT reads as markup
	const webVtt = toWebVtt([
		{
			startSeconds: 1,
			endSeconds: 3,
			lines: ["Carl: R&D went from a --> b,", "and <b>nobody</b> noticed."],
			isAboveLowerThird: false,
		},
	])

	// the text is escaped, and the timing line keeps its arrow
	expect(webVtt).toBe(
		[
			"WEBVTT",
			"",
			"00:00:01.000 --> 00:00:03.000",
			"Carl: R&amp;D went from a --&gt; b,",
			"and &lt;b&gt;nobody&lt;/b&gt; noticed.",
			"",
		].join("\n"),
	)
	expect(webVtt.split("-->").length - 1).toBe(1)
})

// the silence detection's printed starts and ends become the middle of each pause
test("toPauseSeconds pairs each silence start with its end", () => {
	const detectionText = [
		"frame:0 pts:88200 pts_time:2",
		"lavfi.silence_start=1.5",
		"frame:1 pts:123000 pts_time:2.8",
		"lavfi.silence_end=2.5",
		"lavfi.silence_duration=1",
	].join("\n")
	expect(toPauseSeconds(detectionText)).toEqual([2])
})
