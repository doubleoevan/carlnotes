import { expect, test } from "bun:test"
import {
	SKIP_BACK_SECONDS,
	SKIP_FORWARD_SECONDS,
	toChapterIndexAt,
	toNextPlaybackRate,
	toPodcastEpisodeMediaMetadata,
	toPodcastEpisodeSeekSeconds,
} from "./podcastEpisodePlayback"
import { toPodcastEpisodeChapterFixture, toPodcastEpisodeFixture } from "./podcastEpisodeTestFixtures"

test("chapter selection includes the intro, exact starts, gaps, and sign-off", () => {
	// retain the chapter through a gap and select the next at its exact start
	const chapters = [40, 155, 298].map((startSeconds, position) =>
		toPodcastEpisodeChapterFixture({ position, startSeconds, endSeconds: startSeconds + 60 }),
	)
	expect([0, 40, 154.9, 155, 297.9, 298, 600].map((position) => toChapterIndexAt(chapters, position))).toEqual([
		0, 0, 0, 1, 1, 2, 2,
	])
	expect(toChapterIndexAt([], 0)).toBe(-1)
})

test("seek bounds and skip intervals match the web player", () => {
	// clamp invalid times and both ends of the episode
	expect(SKIP_BACK_SECONDS).toBe(15)
	expect(SKIP_FORWARD_SECONDS).toBe(30)
	for (const [positionSeconds, expectedSeconds] of [
		[-15, 0],
		[30, 30],
		[630, 600],
		[Number.NaN, 0],
	] as const) {
		expect(toPodcastEpisodeSeekSeconds({ positionSeconds, durationSeconds: 600 })).toBe(expectedSeconds)
	}
	expect(toPodcastEpisodeSeekSeconds({ positionSeconds: 30, durationSeconds: null })).toBe(0)
})

test("speed cycles in the web order and recovers an unsupported rate", () => {
	// apply the complete cycle and the default for an unknown speed
	let playbackRate = 1
	for (const expectedRate of [1.25, 1.5, 2, 0.75, 1]) {
		playbackRate = toNextPlaybackRate(playbackRate)
		expect(playbackRate).toBe(expectedRate)
	}
	expect(toNextPlaybackRate(3)).toBe(1)
})

test("system metadata follows a chapter change without losing the episode", () => {
	// preserve the episode title while naming the current chapter
	const podcastEpisode = toPodcastEpisodeFixture()
	expect(toPodcastEpisodeMediaMetadata(podcastEpisode, 60)).toMatchObject({
		title: "Chapter 2",
		album: podcastEpisode.title,
	})
	expect(toPodcastEpisodeMediaMetadata({ ...podcastEpisode, chapters: [] }, 60).title).toBe(
		podcastEpisode.title ?? "Coffee Break",
	)
})
