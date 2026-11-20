// film key tests: a film's keys by image and render version, the keys a film row lists, and each chapter's generated
// image keys
import { expect, test } from "bun:test"
import {
	GENERATED_CHAPTER_IMAGE_LIMIT_PER_CHAPTER,
	toTopicVideoCaptionsKey,
	toTopicVideoChapterImageCheckKeys,
	toTopicVideoChapterImageKey,
	toTopicVideoChapterImageKeys,
	toTopicVideoChaptersKey,
	toTopicVideoImageKey,
	toTopicVideoImageLargeOriginalKey,
	toTopicVideoImagePartKey,
	toTopicVideoKeys,
	toTopicVideoRenderAttemptUploadKey,
} from "./topicVideoKeys"

// a film's keys sit under its podcast episode, and the parts drawn from the image name the image's hash. a film at
// render version 1 keeps the first key names
test("the film keys sit under the podcast episode's video folder", () => {
	const signOffPart = { podcastEpisodeId: "episode-1", part: "sign-off" as const, imageHash: "abc" }
	expect(toTopicVideoChaptersKey("episode-1", 1)).toBe("episodes/episode-1/video/chapters.mp4")
	expect(toTopicVideoCaptionsKey("episode-1", 1)).toBe("episodes/episode-1/video/captions.vtt")
	expect(toTopicVideoImagePartKey({ ...signOffPart, renderVersion: 1 })).toBe(
		"episodes/episode-1/video/sign-off-abc.mp4",
	)
})

// a later render version names itself in every film key, so a re-render never writes over the film that plays
test("the film keys of a later render version name the version", () => {
	const filmPart = { podcastEpisodeId: "episode-1", part: "film" as const, imageHash: "abc" }
	expect(toTopicVideoChaptersKey("episode-1", 2)).toBe("episodes/episode-1/video/chapters-v2.mp4")
	expect(toTopicVideoCaptionsKey("episode-1", 2)).toBe("episodes/episode-1/video/captions-v2.vtt")
	expect(toTopicVideoImagePartKey({ ...filmPart, renderVersion: 2 })).toBe("episodes/episode-1/video/film-abc-v2.mp4")
})

// a film row's keys leave out the parts not yet uploaded
test("toTopicVideoKeys drops the keys not yet uploaded", () => {
	const topicVideoKeys = toTopicVideoKeys({
		introKey: "intro",
		chaptersKey: "chapters",
		signOffKey: null,
		filmKey: null,
		captionsKey: "captions",
		podcastEpisodeId: "episode-1",
		imageHash: null,
		chapterCount: 0,
	})
	expect(topicVideoKeys).toEqual(["intro", "chapters", "captions"])
})

// a film with its own image lists the image's key and its original's key under the film's folder
test("toTopicVideoKeys lists the film's own image and its original", () => {
	const topicVideoKeys = toTopicVideoKeys({
		introKey: null,
		chaptersKey: null,
		signOffKey: null,
		filmKey: "film",
		captionsKey: null,
		podcastEpisodeId: "episode-1",
		imageHash: "abc",
		chapterCount: 0,
	})
	expect(topicVideoKeys).toEqual([
		"film",
		"episodes/episode-1/video/image-abc.jpg",
		"episodes/episode-1/video/image-abc-original.jpg",
	])
	expect(toTopicVideoImageKey("episode-1", "abc")).toBe("episodes/episode-1/video/image-abc.jpg")
	expect(toTopicVideoImageLargeOriginalKey("episode-1", "abc")).toBe("episodes/episode-1/video/image-abc-original.jpg")
})

// a chapter's first generated image has its first key, each further one is numbered from 1, and the current style
// names itself in each key
test("toTopicVideoChapterImageKeys lists the first key, then the numbered ones, in a style", () => {
	const chapterImageKeys = toTopicVideoChapterImageKeys("episode-1", 1)
	expect(chapterImageKeys).toHaveLength(GENERATED_CHAPTER_IMAGE_LIMIT_PER_CHAPTER)
	expect(chapterImageKeys[0]).toBe(toTopicVideoChapterImageKey("episode-1", 1))
	expect(chapterImageKeys[0]).toBe("episodes/episode-1/video/chapter-1-image-s2.jpg")
	expect(chapterImageKeys[1]).toBe("episodes/episode-1/video/chapter-1-image-s2-1.jpg")
	expect(chapterImageKeys.at(-1)).toBe("episodes/episode-1/video/chapter-1-image-s2-11.jpg")

	// the first style's keys have no style suffix
	const firstStyleKeys = toTopicVideoChapterImageKeys("episode-1", 1, 1)
	expect(firstStyleKeys[0]).toBe("episodes/episode-1/video/chapter-1-image.jpg")
	expect(firstStyleKeys.at(-1)).toBe("episodes/episode-1/video/chapter-1-image-11.jpg")
})

// a film lists every generated image key of each chapter of its podcast episode in every style, with the two check
// keys of each image in the current style, and a podcast episode with no film row lists none
test("toTopicVideoKeys lists each chapter's generated images in every style under the film's folder", () => {
	const filmRow = { introKey: null, chaptersKey: null, signOffKey: null, filmKey: null, captionsKey: null }
	const topicVideoKeys = toTopicVideoKeys({
		...filmRow,
		podcastEpisodeId: "episode-1",
		imageHash: null,
		chapterCount: 2,
	})
	const currentStyleImageKeys = [
		...toTopicVideoChapterImageKeys("episode-1", 0),
		...toTopicVideoChapterImageKeys("episode-1", 1),
	]
	expect(topicVideoKeys).toEqual([
		...toTopicVideoChapterImageKeys("episode-1", 0, 1),
		...toTopicVideoChapterImageKeys("episode-1", 1, 1),
		...currentStyleImageKeys,
		...currentStyleImageKeys.flatMap((imageKey) => Object.values(toTopicVideoChapterImageCheckKeys(imageKey))),
		"episodes/episode-1/video/chapter-0-scene-plan.json",
		"episodes/episode-1/video/chapter-1-scene-plan.json",
		"episodes/episode-1/video/picture-motion.json",
		"episodes/episode-1/video/picture-motion.mkv",
	])

	// no film row, so no chapter image
	const filmlessKeys = toTopicVideoKeys({
		...filmRow,
		podcastEpisodeId: null,
		imageHash: null,
		chapterCount: 2,
	})
	expect(filmlessKeys).toEqual([])
})

test("an upload failure in one animated attempt can only delete that attempt's objects", () => {
	const key = toTopicVideoChaptersKey("episode", 4)
	expect(toTopicVideoRenderAttemptUploadKey(key, "first")).not.toBe(toTopicVideoRenderAttemptUploadKey(key, "second"))
	expect(toTopicVideoRenderAttemptUploadKey(key, "first")).not.toBe(key)
	expect(toTopicVideoRenderAttemptUploadKey(key, undefined)).toBe(key)
})
