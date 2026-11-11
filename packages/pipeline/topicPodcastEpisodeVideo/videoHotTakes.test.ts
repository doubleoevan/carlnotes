// where a film's hot takes start: in a chapter, in the closing turns, and nowhere for a script that reads none
import { expect, test } from "bun:test"
import type { PodcastEpisodeScript } from "@carlnotes/contracts/podcast"
import { toHotTakesStartSeconds } from "./videoHotTakes"

// two chapters of four equal turns each. the first chapter ends on a hot take, and the sign-off opens with one
const TURN_TEXT = "ten chars."
const SCRIPT: PodcastEpisodeScript = {
	coldOpen: [],
	segments: [
		{
			transition: [],
			chapters: [
				{
					findingId: "finding-1",
					title: "First",
					turns: [
						{ speaker: "host", text: TURN_TEXT },
						{ speaker: "cohost", text: TURN_TEXT },
						{ speaker: "host", text: "Silky-Brew!" },
						{ speaker: "cohost", text: TURN_TEXT },
					],
				},
				{
					findingId: "finding-2",
					title: "Second",
					turns: [
						{ speaker: "host", text: TURN_TEXT },
						{ speaker: "cohost", text: TURN_TEXT },
					],
				},
			],
		},
	],
	signOff: [
		{ speaker: "cohost", text: TURN_TEXT },
		{ speaker: "host", text: "hotcup too" },
	],
}

// the film's chapters, forty seconds each
const VIDEO_CHAPTER_ROWS = [0, 1].map((position) => ({
	position,
	title: `Chapter ${position}`,
	sourceUrl: "https://example.com/page",
	startSeconds: position * 40,
	endSeconds: (position + 1) * 40,
	isUnsafe: false,
}))

// a chapter's hot takes start at the turn that names the writer, and the closing ones at the hand-off before it
test("hot takes start at the first turn that names a writer, or at the closing turns' first turn", () => {
	const hotTakesStartSeconds = toHotTakesStartSeconds({
		script: SCRIPT,
		videoChapterRows: VIDEO_CHAPTER_ROWS,
		usernames: ["silky-brew", "hotcup"],
		pauseSeconds: [],
	})

	// the third of four turns of about equal length, and the third of the last chapter's four turns with its sign-off
	expect(hotTakesStartSeconds.get(0)).toBeCloseTo(40 * (20 / 41), 5)
	expect(hotTakesStartSeconds.get(1)).toBeCloseTo(40 + 40 * (20 / 40), 5)
})

// a script that names no writer has no hot takes
test("a script that reads no hot take has no start", () => {
	const scriptUsernames = { script: SCRIPT, videoChapterRows: VIDEO_CHAPTER_ROWS, pauseSeconds: [] }
	expect(toHotTakesStartSeconds({ ...scriptUsernames, usernames: [] }).size).toBe(0)
	expect(toHotTakesStartSeconds({ ...scriptUsernames, usernames: ["nobody"] }).size).toBe(0)
})
