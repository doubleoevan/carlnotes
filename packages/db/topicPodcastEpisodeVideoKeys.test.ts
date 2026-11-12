// film key tests: a film's keys by image and render version, the keys a film row lists, and each chapter's generated
// image keys
import { expect, test } from "bun:test"
import {
	GENERATED_CHAPTER_IMAGE_LIMIT_PER_CHAPTER,
	toTopicPodcastEpisodeVideoCaptionsKey,
	toTopicPodcastEpisodeVideoChapterImageKey,
	toTopicPodcastEpisodeVideoChapterImageKeys,
	toTopicPodcastEpisodeVideoChaptersKey,
	toTopicPodcastEpisodeVideoImageKey,
	toTopicPodcastEpisodeVideoImageLargeOriginalKey,
	toTopicPodcastEpisodeVideoImagePartKey,
	toTopicPodcastEpisodeVideoKeys,
} from "./topicPodcastEpisodeVideoKeys"

// a film's keys sit under its podcast episode, and the parts drawn from the image name the image's hash. a film at
// render version 1 keeps the first key names
test("the film keys sit under the podcast episode's video folder", () => {
	const signOffPart = { podcastEpisodeId: "episode-1", part: "sign-off" as const, imageHash: "abc" }
	expect(toTopicPodcastEpisodeVideoChaptersKey("episode-1", 1)).toBe("episodes/episode-1/video/chapters.mp4")
	expect(toTopicPodcastEpisodeVideoCaptionsKey("episode-1", 1)).toBe("episodes/episode-1/video/captions.vtt")
	expect(toTopicPodcastEpisodeVideoImagePartKey({ ...signOffPart, renderVersion: 1 })).toBe(
		"episodes/episode-1/video/sign-off-abc.mp4",
	)
})

// a later render version names itself in every film key, so a re-render never writes over the film that plays
test("the film keys of a later render version name the version", () => {
	const filmPart = { podcastEpisodeId: "episode-1", part: "film" as const, imageHash: "abc" }
	expect(toTopicPodcastEpisodeVideoChaptersKey("episode-1", 2)).toBe("episodes/episode-1/video/chapters-v2.mp4")
	expect(toTopicPodcastEpisodeVideoCaptionsKey("episode-1", 2)).toBe("episodes/episode-1/video/captions-v2.vtt")
	expect(toTopicPodcastEpisodeVideoImagePartKey({ ...filmPart, renderVersion: 2 })).toBe(
		"episodes/episode-1/video/film-abc-v2.mp4",
	)
})

// a film row's keys leave out the parts not yet uploaded
test("toTopicPodcastEpisodeVideoKeys drops the keys not yet uploaded", () => {
	const topicPodcastEpisodeVideoKeys = toTopicPodcastEpisodeVideoKeys({
		introKey: "intro",
		chaptersKey: "chapters",
		signOffKey: null,
		filmKey: null,
		captionsKey: "captions",
		podcastEpisodeId: "episode-1",
		imageHash: null,
		chapterCount: 0,
	})
	expect(topicPodcastEpisodeVideoKeys).toEqual(["intro", "chapters", "captions"])
})

// a film with its own image lists the image's key and its original's key under the film's folder
test("toTopicPodcastEpisodeVideoKeys lists the film's own image and its original", () => {
	const topicPodcastEpisodeVideoKeys = toTopicPodcastEpisodeVideoKeys({
		introKey: null,
		chaptersKey: null,
		signOffKey: null,
		filmKey: "film",
		captionsKey: null,
		podcastEpisodeId: "episode-1",
		imageHash: "abc",
		chapterCount: 0,
	})
	expect(topicPodcastEpisodeVideoKeys).toEqual([
		"film",
		"episodes/episode-1/video/image-abc.jpg",
		"episodes/episode-1/video/image-abc-original.jpg",
	])
	expect(toTopicPodcastEpisodeVideoImageKey("episode-1", "abc")).toBe("episodes/episode-1/video/image-abc.jpg")
	expect(toTopicPodcastEpisodeVideoImageLargeOriginalKey("episode-1", "abc")).toBe(
		"episodes/episode-1/video/image-abc-original.jpg",
	)
})

// a chapter's first generated image keeps its first key, and each further one is numbered from 1
test("toTopicPodcastEpisodeVideoChapterImageKeys lists the first key, then the numbered ones", () => {
	const chapterImageKeys = toTopicPodcastEpisodeVideoChapterImageKeys("episode-1", 1)
	expect(chapterImageKeys).toHaveLength(GENERATED_CHAPTER_IMAGE_LIMIT_PER_CHAPTER)
	expect(chapterImageKeys[0]).toBe(toTopicPodcastEpisodeVideoChapterImageKey("episode-1", 1))
	expect(chapterImageKeys[0]).toBe("episodes/episode-1/video/chapter-1-image.jpg")
	expect(chapterImageKeys[1]).toBe("episodes/episode-1/video/chapter-1-image-1.jpg")
	expect(chapterImageKeys.at(-1)).toBe("episodes/episode-1/video/chapter-1-image-11.jpg")
})

// a film lists every generated image key of each chapter of its podcast episode, and a podcast episode with no film
// row lists none
test("toTopicPodcastEpisodeVideoKeys lists each chapter's generated images under the film's folder", () => {
	const filmRow = { introKey: null, chaptersKey: null, signOffKey: null, filmKey: null, captionsKey: null }
	const topicPodcastEpisodeVideoKeys = toTopicPodcastEpisodeVideoKeys({
		...filmRow,
		podcastEpisodeId: "episode-1",
		imageHash: null,
		chapterCount: 2,
	})
	expect(topicPodcastEpisodeVideoKeys).toEqual([
		...toTopicPodcastEpisodeVideoChapterImageKeys("episode-1", 0),
		...toTopicPodcastEpisodeVideoChapterImageKeys("episode-1", 1),
	])

	// no film row, so no chapter image
	const filmlessKeys = toTopicPodcastEpisodeVideoKeys({
		...filmRow,
		podcastEpisodeId: null,
		imageHash: null,
		chapterCount: 2,
	})
	expect(filmlessKeys).toEqual([])
})
