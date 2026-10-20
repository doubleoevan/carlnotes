// podcast episode playback tests: toChapterIndexAt finds the chapter that is playing at a position,
// toChapterAtPosition finds the chapter at a chapter position, and toPodcastEpisodeSpeakerMediaMetadata names the host
// who answers on the lock screen
import { expect, test } from "bun:test"
import { PODCAST_NAME } from "@shared/podcastEpisodes"
import {
	toPodcastEpisodeChapterFixture,
	toPodcastEpisodeFixture,
} from "@/components/podcast/podcastEpisodeTestFixtures"
import { toChapterAtPosition, toChapterIndexAt, toPodcastEpisodeSpeakerMediaMetadata } from "./podcastEpisodePlayback"

// three chapters that start at 0, 155, and 298 seconds
const chapters = [0, 155, 298].map((startSeconds, position) =>
	toPodcastEpisodeChapterFixture({
		position,
		title: `Chapter ${position + 1}`,
		startSeconds,
		endSeconds: startSeconds + 140,
	}),
)

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

test("toChapterAtPosition finds the chapter at a chapter position, or none", () => {
	// the second chapter, and a chapter position past the last
	expect(toChapterAtPosition(chapters, 1)?.startSeconds).toBe(155)
	expect(toChapterAtPosition(chapters, 3)).toBeUndefined()
})

test("toPodcastEpisodeSpeakerMediaMetadata names the answering host, the podcast, and the podcast episode's cover", () => {
	// a podcast episode with its cover at both sizes, answered by vienna
	const podcastEpisode = toPodcastEpisodeFixture({
		title: "Robot vacuums, ranked",
		smallCoverUrl: "/api/podcast-covers/episode/episode-1/cover-600.jpg",
		coverUrl: "/api/podcast-covers/episode/episode-1/cover-3000.jpg",
	})
	expect(toPodcastEpisodeSpeakerMediaMetadata(podcastEpisode, "cohost")).toEqual({
		title: "Vienna",
		artist: PODCAST_NAME,
		album: "Robot vacuums, ranked",
		artwork: [
			{ src: "/api/podcast-covers/episode/episode-1/cover-600.jpg", sizes: "600x600", type: "image/jpeg" },
			{ src: "/api/podcast-covers/episode/episode-1/cover-3000.jpg", sizes: "3000x3000", type: "image/jpeg" },
		],
	})

	// carl is the host, and a podcast episode with no title or cover names the podcast with no artwork
	expect(
		toPodcastEpisodeSpeakerMediaMetadata(
			toPodcastEpisodeFixture({ title: null, smallCoverUrl: null, coverUrl: null }),
			"host",
		),
	).toEqual({ title: "Carl", artist: PODCAST_NAME, album: PODCAST_NAME, artwork: [] })
})
