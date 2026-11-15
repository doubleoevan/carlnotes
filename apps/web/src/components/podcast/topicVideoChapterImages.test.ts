// which image a chapter's tooltip on the film's seek bar gets, in the film's order
import { expect, test } from "bun:test"
import {
	rememberFailedTopicVideoChapterImage,
	type TopicVideoChapterImage,
	toTopicVideoChapterImages,
} from "./topicVideoChapterImages"

// the two images every chapter falls back to: its generated image by position, then the podcast card
const FALLBACK_IMAGES: TopicVideoChapterImage[] = [
	{ kind: "generated", url: "/api/topic-podcast-episode-video-images/episode-1/chapters/2/image.jpg" },
	{ kind: "podcastCard", url: "/podcast-cover-placeholder.jpg" },
]

test("a chapter whose Finding has a link preview image shows it first", () => {
	const chapterImages = toTopicVideoChapterImages({
		podcastEpisodeId: "episode-1",
		chapterPosition: 2,
		linkPreviewImagePath: "/api/link-previews/preview-1/image",
	})
	expect(chapterImages).toEqual([
		{ kind: "linkPreview", url: "/api/link-previews/preview-1/image" },
		...FALLBACK_IMAGES,
	])
})

test("a chapter with no link preview image tries its generated image, then the podcast card", () => {
	const chapterImages = toTopicVideoChapterImages({
		podcastEpisodeId: "episode-1",
		chapterPosition: 2,
		linkPreviewImagePath: null,
	})
	expect(chapterImages).toEqual(FALLBACK_IMAGES)
})

test("a chapter's own image that failed to load is left out for the rest of the page", () => {
	// fail every image of another podcast episode's chapter: its link preview image, its generated image, and the card
	const chapter = {
		podcastEpisodeId: "episode-with-failed-images",
		chapterPosition: 4,
		linkPreviewImagePath: "/api/link-previews/preview-failed/image",
	}
	for (const chapterImage of toTopicVideoChapterImages(chapter)) {
		rememberFailedTopicVideoChapterImage(chapterImage)
	}

	// the chapter's own two images are gone, the podcast card stays, and another chapter keeps its own images
	expect(toTopicVideoChapterImages(chapter)).toEqual([{ kind: "podcastCard", url: "/podcast-cover-placeholder.jpg" }])
	expect(
		toTopicVideoChapterImages({
			podcastEpisodeId: "episode-1",
			chapterPosition: 2,
			linkPreviewImagePath: null,
		}),
	).toEqual(FALLBACK_IMAGES)
})
