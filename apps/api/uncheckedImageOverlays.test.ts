// unchecked image overlay tests: a subject's own page read shows the editor who uploaded an unchecked image that upload
// in place of the published image, with its flag. a second editor reads the published image, and a user who may not
// edit and a visitor read no unchecked image at all
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import type { TeamPageResponse } from "@carlnotes/contracts/teams"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import { toTopicImageUrls, toTopicPostImageUrls, toUncheckedTopicImageUrls } from "@carlnotes/contracts/topicImages"
import type { TopicPostResponse } from "@carlnotes/contracts/topicPosts"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as uncheckedImagesDb from "@carlnotes/db/uncheckedImages"
import {
	overlayUncheckedPodcastEpisodePageImages,
	overlayUncheckedTeamAvatar,
	overlayUncheckedTopicImage,
	overlayUncheckedTopicPostImage,
} from "./uncheckedImageOverlays"
import {
	PUBLISHED_PODCAST_EPISODE,
	UNCHECKED_PODCAST_EPISODE,
	UNCHECKED_PODCAST_EPISODE_IMAGE_ROW,
	UNCHECKED_TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_ROW,
} from "./uncheckedImageOverlayTestFixtures"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// one unchecked image's row for every subject, uploaded by uploader-1: a content hash and an avatar's stored object
function stubUncheckedImageOfUploader(): ReturnType<
	typeof spyOn<typeof uncheckedImagesDb, "loadUncheckedImageForUploader">
> {
	return spyOn(uncheckedImagesDb, "loadUncheckedImageForUploader").mockImplementation(
		async (_uncheckedImageSubject, userId) =>
			userId === "uploader-1"
				? ({
						imageHash: "unchecked-hash",
						avatarKey: "avatars/teams/team-1/unchecked-version.png",
					} as uncheckedImagesDb.UncheckedImageRow)
				: null,
	)
}

test("a topic's page shows an unchecked upload to the editor who uploaded it alone", async () => {
	// a topic with a generated image, as an editor and as a user who may not edit read its page
	const loadUncheckedImageSpy = stubUncheckedImageOfUploader()
	const publishedImage = toTopicImageUrls("topic-1", "published-hash")
	const generatedImageFields = { image: publishedImage, imageOrigin: "generated", imagePrompt: "a red kettle" } as const
	const editorPage = toTestTopicResponse({ id: "topic-1", canEdit: true, ...generatedImageFields })
	const readerPage = toTestTopicResponse({ id: "topic-1", canEdit: false, ...generatedImageFields })

	// the uploader reads the unchecked upload at its marked urls, as an upload with no image prompt, with its flag
	expect(await overlayUncheckedTopicImage(editorPage, "uploader-1")).toEqual({
		...editorPage,
		image: toUncheckedTopicImageUrls(toTopicImageUrls("topic-1", "unchecked-hash")),
		imageOrigin: "uploaded",
		imagePrompt: null,
		isImageUnchecked: true,
	})
	expect(loadUncheckedImageSpy).toHaveBeenCalledWith({ subjectKind: "topicImage", subjectId: "topic-1" }, "uploader-1")

	// a second editor reads the published image, and a reader and a visitor read no unchecked image
	expect(await overlayUncheckedTopicImage(editorPage, "editor-2")).toBe(editorPage)
	loadUncheckedImageSpy.mockClear()
	expect(await overlayUncheckedTopicImage(readerPage, "uploader-1")).toBe(readerPage)
	expect(await overlayUncheckedTopicImage(readerPage, null)).toBe(readerPage)
	expect(loadUncheckedImageSpy).not.toHaveBeenCalled()
})

test("a Topic Post's page shows an unchecked upload to whoever uploaded it and may still change the image", async () => {
	// a post with a generated image, as a user who may change its image and as a reader read its page
	const loadUncheckedImageSpy = stubUncheckedImageOfUploader()
	const publishedImage = toTopicPostImageUrls("post-1", "published-hash")
	const generatedImageFields = { image: publishedImage, imageOrigin: "generated", imagePrompt: "steam" }
	const editorPost = { id: "post-1", canEditImage: true, ...generatedImageFields } as TopicPostResponse
	const readerPost = { id: "post-1", canEditImage: false, ...generatedImageFields } as TopicPostResponse

	// the uploader reads the unchecked upload at its marked urls, with its flag
	expect(await overlayUncheckedTopicPostImage(editorPost, "uploader-1")).toEqual({
		...editorPost,
		image: toUncheckedTopicImageUrls(toTopicPostImageUrls("post-1", "unchecked-hash")),
		imageOrigin: "uploaded",
		imagePrompt: null,
		isImageUnchecked: true,
	})
	expect(loadUncheckedImageSpy).toHaveBeenCalledWith(
		{ subjectKind: "topicPostImage", subjectId: "post-1" },
		"uploader-1",
	)

	// a second editor reads the published image, and a reader and a visitor read no unchecked image
	expect(await overlayUncheckedTopicPostImage(editorPost, "editor-2")).toBe(editorPost)
	loadUncheckedImageSpy.mockClear()
	expect(await overlayUncheckedTopicPostImage(readerPost, "uploader-1")).toBe(readerPost)
	expect(await overlayUncheckedTopicPostImage(readerPost, null)).toBe(readerPost)
	expect(loadUncheckedImageSpy).not.toHaveBeenCalled()
})

test("a team's page names an unchecked avatar to the leader who uploaded it, beside the published one", async () => {
	// a team with a published avatar, as a leader and as a member read its page
	const loadUncheckedImageSpy = stubUncheckedImageOfUploader()
	const leaderPage = { teamId: "team-1", role: "leader", avatarVersion: "published-version" } as TeamPageResponse
	const memberPage = { ...leaderPage, role: "member" } as TeamPageResponse

	// the uploader reads the unchecked avatar's version, and the published version stays
	expect(await overlayUncheckedTeamAvatar(leaderPage, "uploader-1")).toEqual({
		...leaderPage,
		uncheckedAvatarVersion: "unchecked-version",
	})
	expect(loadUncheckedImageSpy).toHaveBeenCalledWith({ subjectKind: "teamAvatar", subjectId: "team-1" }, "uploader-1")

	// a second leader reads the published avatar alone, and a member and a visitor read no unchecked image
	expect(await overlayUncheckedTeamAvatar(leaderPage, "leader-2")).toBe(leaderPage)
	loadUncheckedImageSpy.mockClear()
	expect(await overlayUncheckedTeamAvatar(memberPage, "uploader-1")).toBe(memberPage)
	expect(await overlayUncheckedTeamAvatar({ ...leaderPage, role: null }, null)).toEqual({ ...leaderPage, role: null })
	expect(loadUncheckedImageSpy).not.toHaveBeenCalled()
})

// the published podcast episode's page as an editor reads it, with both images generated from an image prompt
const EDITOR_PODCAST_EPISODE_PAGE = {
	podcastEpisode: PUBLISHED_PODCAST_EPISODE,
	canEditPodcastEpisode: true,
	podcastEpisodeImageOrigin: "generated",
	podcastEpisodeImagePrompt: "a moka pot",
	topicPodcastEpisodeVideoImageOrigin: "generated",
	topicPodcastEpisodeVideoImagePrompt: "a film reel",
} as PodcastEpisodePageResponse

// stub the pool with uploader-1's unchecked images under the podcast episode's id, each by its kind and hash
function stubUncheckedPodcastEpisodeImageRows(uncheckedImageRows: string[][]): SentQuery[] {
	return stubConnectionPool(({ text, values }) =>
		text.includes('from "unchecked_images"') && values.includes("uploader-1") ? uncheckedImageRows : [],
	)
}

test("a podcast episode's page shows both unchecked uploads to the editor who uploaded them, from one read", async () => {
	const sentQueries = stubUncheckedPodcastEpisodeImageRows([
		UNCHECKED_PODCAST_EPISODE_IMAGE_ROW,
		UNCHECKED_TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_ROW,
	])

	// the uploader reads each unchecked upload in its image's place, as an upload with no image prompt, with its flag
	expect(await overlayUncheckedPodcastEpisodePageImages(EDITOR_PODCAST_EPISODE_PAGE, "uploader-1")).toEqual({
		...EDITOR_PODCAST_EPISODE_PAGE,
		podcastEpisode: UNCHECKED_PODCAST_EPISODE,
		isPodcastEpisodeImageUnchecked: true,
		podcastEpisodeImageOrigin: "uploaded",
		podcastEpisodeImagePrompt: null,
		isTopicPodcastEpisodeVideoImageUnchecked: true,
		topicPodcastEpisodeVideoImageOrigin: "uploaded",
		topicPodcastEpisodeVideoImagePrompt: null,
	})

	// one read names both kinds, the podcast episode, the uploader, and an unpublished unchecked image
	expect(sentQueries).toHaveLength(1)
	expect(sentQueries[0]?.values).toEqual([
		"podcastEpisodeImage",
		"topicPodcastEpisodeVideoImage",
		"episode-1",
		"uploader-1",
		false,
	])
})

test("a podcast episode's image with no unchecked upload stays, and a second editor reads both as published", async () => {
	// an unchecked film image alone leaves the podcast episode's own image and its fields as they were
	stubUncheckedPodcastEpisodeImageRows([UNCHECKED_TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_ROW])
	const uploaderPage = await overlayUncheckedPodcastEpisodePageImages(EDITOR_PODCAST_EPISODE_PAGE, "uploader-1")
	expect(uploaderPage.podcastEpisode.image).toEqual(PUBLISHED_PODCAST_EPISODE.image)
	expect(uploaderPage.isPodcastEpisodeImageUnchecked).toBeUndefined()
	expect(uploaderPage.podcastEpisodeImagePrompt).toBe("a moka pot")
	expect(uploaderPage.isTopicPodcastEpisodeVideoImageUnchecked).toBe(true)
	expect(uploaderPage.podcastEpisode.video).toEqual(UNCHECKED_PODCAST_EPISODE.video)

	// a second editor reads the page as published, with no flag
	expect(await overlayUncheckedPodcastEpisodePageImages(EDITOR_PODCAST_EPISODE_PAGE, "editor-2")).toEqual(
		EDITOR_PODCAST_EPISODE_PAGE,
	)
})

test("an unchecked film image shows on a ready film alone, and a reader and a visitor read no unchecked image", async () => {
	// a podcast episode whose film is not ready has no poster to show the unchecked image as
	const sentQueries = stubUncheckedPodcastEpisodeImageRows([UNCHECKED_TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_ROW])
	const filmlessPage = {
		...EDITOR_PODCAST_EPISODE_PAGE,
		podcastEpisode: { ...PUBLISHED_PODCAST_EPISODE, video: null, videoPosterUrl: null },
	}
	expect(await overlayUncheckedPodcastEpisodePageImages(filmlessPage, "uploader-1")).toEqual(filmlessPage)

	// a user who may not edit the podcast episode, and a visitor, send no read
	const readerPage = { ...EDITOR_PODCAST_EPISODE_PAGE, canEditPodcastEpisode: false }
	const queryCountBeforeReaders = sentQueries.length
	expect(await overlayUncheckedPodcastEpisodePageImages(readerPage, "uploader-1")).toBe(readerPage)
	expect(await overlayUncheckedPodcastEpisodePageImages(readerPage, null)).toBe(readerPage)
	expect(sentQueries).toHaveLength(queryCountBeforeReaders)
})
