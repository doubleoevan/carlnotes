// podcast episode player store tests: toChapterIndexAt finds the chapter that is playing at a position
import { expect, test } from "bun:test"
import type { PodcastEpisodeChapter } from "@shared/contracts"
import { toChapterIndexAt } from "./podcastEpisodePlayerStore"

// three chapters that start at 0, 155, and 298 seconds
const chapters: PodcastEpisodeChapter[] = [0, 155, 298].map((startSeconds, position) => ({
	position,
	title: `Chapter ${position + 1}`,
	findingId: null,
	sourceUrl: "https://a.com",
	rating: null,
	faviconPath: null,
	startSeconds,
	endSeconds: startSeconds + 140,
}))

test("toChapterIndexAt finds the chapter that a position falls in", () => {
	// the start of the podcast episode, just before the second chapter, the second chapter's first second,
	// and the last chapter
	expect(toChapterIndexAt(chapters, 0)).toBe(0)
	expect(toChapterIndexAt(chapters, 154.9)).toBe(0)
	expect(toChapterIndexAt(chapters, 155)).toBe(1)
	expect(toChapterIndexAt(chapters, 400)).toBe(2)
})

test("toChapterIndexAt returns -1 for an episode with no chapters", () => {
	expect(toChapterIndexAt([], 10)).toBe(-1)
})
