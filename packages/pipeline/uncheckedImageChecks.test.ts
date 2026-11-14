// unchecked image check tests: what the sweep does with one image's check result. it publishes a clean avatar, topic
// image, or film image, deletes a flagged or unreadable one through the pending deletions, removes a flagged published
// one with no render, deletes one whose subject is gone, and acts only on the unchecked image it read
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import * as avatars from "@carlnotes/db/avatars"
import { restoreConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as sessions from "@carlnotes/db/sessions"
import * as temporalClient from "./temporalClient"
import { toTopicImageObjectKeys } from "./topicImages/topicImageFiles"
import * as topicImageRenders from "./topicImages/topicImageRenders"
import { toTopicPodcastEpisodeVideoImageObjectKeys } from "./topicPodcastEpisodeVideo/topicPodcastEpisodeVideoImage"
import { checkUncheckedImages } from "./uncheckedImageChecks"
import {
	CLEAN,
	FAILED,
	FLAGGED,
	restoreUncheckedImageCheckTest,
	stubUncheckedImageCheck,
	toPendingDeletionKeys,
	toUncheckedAvatarRow,
	toUncheckedImageDeletes,
	toUncheckedTopicImageRow,
	toUncheckedTopicPodcastEpisodeVideoImageRow,
	UPLOADED_AT,
} from "./uncheckedImageCheckTestFixtures"

// the pool's own query and every spy, put back after each test
afterEach(restoreUncheckedImageCheckTest)

// an unchecked avatar that passes becomes the user's avatar through the write that confirms it is still the one read
test("a clean unchecked avatar is published as the user's avatar", async () => {
	stubUncheckedImageCheck({ uncheckedImageRows: [toUncheckedAvatarRow()] }, CLEAN)
	const publishUncheckedAvatarSpy = spyOn(avatars, "publishUncheckedAvatar").mockResolvedValue(true)
	expect(await checkUncheckedImages()).toEqual({ publishedCount: 1, deletedCount: 0, isCheckUnavailable: false })
	expect(publishUncheckedAvatarSpy.mock.calls[0]?.[0]).toMatchObject({
		id: "unchecked-avatar",
		subjectId: "user-1",
		avatarKey: "avatars/user-1/unchecked.png",
	})
})

// a flagged unchecked avatar is deleted through the write that confirms it is still the one read
test("a flagged unchecked avatar is deleted", async () => {
	stubUncheckedImageCheck({ uncheckedImageRows: [toUncheckedAvatarRow()] }, FLAGGED)
	const deleteUncheckedAvatarSpy = spyOn(avatars, "deleteUncheckedAvatar").mockResolvedValue(true)
	expect(await checkUncheckedImages()).toEqual({ publishedCount: 0, deletedCount: 1, isCheckUnavailable: false })
	expect(deleteUncheckedAvatarSpy.mock.calls[0]?.[0]).toMatchObject({ id: "unchecked-avatar" })
})

// the user's row names a newer unchecked avatar, so the checked one is never published over it
test("an unchecked avatar that a newer upload replaced while its check ran is not published", async () => {
	const { sentQueries, deletedObjectKeys } = stubUncheckedImageCheck(
		{
			uncheckedImageRows: [toUncheckedAvatarRow()],
			lockedUserRow: ["avatars/user-1/published.png", "avatars/user-1/newer.png"],
		},
		CLEAN,
	)
	const refreshSessionUserSpy = spyOn(sessions, "refreshSessionUser").mockResolvedValue(undefined)
	expect(await checkUncheckedImages()).toEqual({ publishedCount: 0, deletedCount: 0, isCheckUnavailable: false })

	// the user's row, the newer unchecked avatar, and both objects stay as they are
	expect(sentQueries.some(({ text }) => text.startsWith('update "users"'))).toBe(false)
	expect(toUncheckedImageDeletes(sentQueries)).toEqual([])
	expect(refreshSessionUserSpy).not.toHaveBeenCalled()
	expect(deletedObjectKeys).toEqual([])
})

// an unchecked topic image that passes replaces the topic's image as an upload that passed does, then its row is
// dropped
test("a clean unchecked topic image becomes the topic's image at its original's pixel size", async () => {
	const { sentQueries, deletedObjectKeys } = stubUncheckedImageCheck(
		{ uncheckedImageRows: [toUncheckedTopicImageRow()] },
		CLEAN,
	)
	const replaceTopicImageSpy = spyOn(topicImageRenders, "replaceTopicImage").mockResolvedValue(undefined)
	expect(await checkUncheckedImages()).toEqual({ publishedCount: 1, deletedCount: 0, isCheckUnavailable: false })
	expect(replaceTopicImageSpy.mock.calls[0]?.[0]).toMatchObject({
		topicId: "topic-1",
		hash: "unchecked-hash",
		origin: "uploaded",
		width: 1536,
		height: 1024,
	})

	// the unchecked image goes by its id and the time it was uploaded, under the subject's lock, and its files stay as
	// the image
	expect(sentQueries.some(({ values }) => values[0] === "unchecked-image:topicImage:topic-1")).toBe(true)
	expect(toUncheckedImageDeletes(sentQueries).map(({ values }) => values)).toEqual([
		["unchecked-topic", UPLOADED_AT.toISOString()],
	])
	expect(deletedObjectKeys).toEqual([])
})

// a flagged unchecked image is deleted with its files, and the topic keeps the image it had
test("a flagged unchecked topic image is deleted, its files are recorded as pending, and the topic's image stays", async () => {
	const { sentQueries, deletedObjectKeys } = stubUncheckedImageCheck(
		{ uncheckedImageRows: [toUncheckedTopicImageRow()] },
		FLAGGED,
	)
	const replaceTopicImageSpy = spyOn(topicImageRenders, "replaceTopicImage").mockResolvedValue(undefined)
	expect(await checkUncheckedImages()).toEqual({ publishedCount: 0, deletedCount: 1, isCheckUnavailable: false })

	// the unchecked image goes by its id and time, and its original and six files are recorded as pending, then deleted
	const uncheckedObjectKeys = toTopicImageObjectKeys("topic-1", "unchecked-hash")
	expect(toUncheckedImageDeletes(sentQueries).map(({ values }) => values)).toEqual([
		["unchecked-topic", UPLOADED_AT.toISOString()],
	])
	expect(toPendingDeletionKeys(sentQueries)).toEqual(uncheckedObjectKeys)
	expect(deletedObjectKeys).toEqual(uncheckedObjectKeys)
	expect(replaceTopicImageSpy).not.toHaveBeenCalled()
})

// an image the endpoint cannot read is deleted as a flagged one is
test("an unreadable unchecked image is deleted", async () => {
	const { deletedObjectKeys } = stubUncheckedImageCheck(
		{ uncheckedImageRows: [toUncheckedTopicImageRow()] },
		{ outcome: "unreadable" },
	)
	expect((await checkUncheckedImages()).deletedCount).toBe(1)
	expect(deletedObjectKeys).toHaveLength(7)
})

// an upload saved as unchecked while the check ran rewrote the row, so the sweep's stale copy changes nothing
test("an unchecked image that a newer upload replaced while its check ran is kept, and nothing of the newer one is deleted", async () => {
	const replacedUncheckedImage = {
		uncheckedImageRows: [toUncheckedTopicImageRow()],
		replacedUncheckedImageIds: ["unchecked-topic"],
	}
	const flaggedCheck = stubUncheckedImageCheck(replacedUncheckedImage, FLAGGED)
	expect(await checkUncheckedImages()).toEqual({ publishedCount: 0, deletedCount: 0, isCheckUnavailable: false })
	expect(toUncheckedImageDeletes(flaggedCheck.sentQueries)).toEqual([])
	expect(toPendingDeletionKeys(flaggedCheck.sentQueries)).toEqual([])
	expect(flaggedCheck.deletedObjectKeys).toEqual([])

	// a clean check of the replaced unchecked image publishes nothing either
	restoreConnectionPool()
	mock.restore()
	const cleanCheck = stubUncheckedImageCheck(replacedUncheckedImage, CLEAN)
	const replaceTopicImageSpy = spyOn(topicImageRenders, "replaceTopicImage").mockResolvedValue(undefined)
	expect((await checkUncheckedImages()).publishedCount).toBe(0)
	expect(replaceTopicImageSpy).not.toHaveBeenCalled()
	expect(toUncheckedImageDeletes(cleanCheck.sentQueries)).toEqual([])
})

// an unchecked image whose topic was deleted is deleted with its files, and no check is made for it
test("an unchecked image whose subject is gone is deleted without a check, and its files are recorded as pending", async () => {
	const { sentQueries, classifyImageSpy, deletedObjectKeys } = stubUncheckedImageCheck({
		uncheckedImageRows: [toUncheckedTopicImageRow()],
		topicRowById: {},
	})
	expect((await checkUncheckedImages()).deletedCount).toBe(1)
	expect(classifyImageSpy).not.toHaveBeenCalled()

	// the unchecked image goes by its id and time, and its files go through the pending deletions
	const uncheckedObjectKeys = toTopicImageObjectKeys("topic-1", "unchecked-hash")
	expect(toUncheckedImageDeletes(sentQueries).map(({ values }) => values[0])).toEqual(["unchecked-topic"])
	expect(toPendingDeletionKeys(sentQueries)).toEqual(uncheckedObjectKeys)
	expect(deletedObjectKeys).toEqual(uncheckedObjectKeys)
})

// a private Topic's upload is already published, so a clean check only stops checking it
test("a clean published image keeps the topic's image and drops its unchecked image row alone", async () => {
	const { sentQueries, deletedObjectKeys } = stubUncheckedImageCheck(
		{
			uncheckedImageRows: [toUncheckedTopicImageRow({ isPublished: true })],
			topicRowById: { "topic-1": ["unchecked-hash", "private"] },
		},
		CLEAN,
	)
	const replaceTopicImageSpy = spyOn(topicImageRenders, "replaceTopicImage").mockResolvedValue(undefined)
	const startRebuildSpy = spyOn(temporalClient, "startTopicPodcastEpisodeVideoRebuild").mockResolvedValue(undefined)
	await checkUncheckedImages()
	expect(toUncheckedImageDeletes(sentQueries)).toHaveLength(1)
	expect(replaceTopicImageSpy).not.toHaveBeenCalled()
	expect(deletedObjectKeys).toEqual([])

	// the film that kept its image while the upload was unchecked is rebuilt from the upload
	expect(startRebuildSpy).toHaveBeenCalledTimes(1)
})

// a topic deleted while its image's check ran has no subject to publish to, and the next sweep deletes the image
test("a clean unchecked image whose subject was deleted while its check ran is kept for the next sweep", async () => {
	// the topic is there for the check's read, and gone by the time the check's verdict returns
	const topicRowById: Record<string, [string | null, string]> = { "topic-1": ["current-hash", "public"] }
	const { sentQueries, classifyImageSpy } = stubUncheckedImageCheck({
		uncheckedImageRows: [toUncheckedTopicImageRow()],
		topicRowById,
	})
	classifyImageSpy.mockImplementationOnce(async () => {
		delete topicRowById["topic-1"]
		return CLEAN
	})
	const replaceTopicImageSpy = spyOn(topicImageRenders, "replaceTopicImage").mockResolvedValue(undefined)

	// nothing is published, and the unchecked image and its files stay
	expect(await checkUncheckedImages()).toEqual({ publishedCount: 0, deletedCount: 0, isCheckUnavailable: false })
	expect(replaceTopicImageSpy).not.toHaveBeenCalled()
	expect(toUncheckedImageDeletes(sentQueries)).toEqual([])
	expect(toPendingDeletionKeys(sentQueries)).toEqual([])
})

// a flagged published image is removed whether or not the topic turned public meanwhile, and no render follows the
// check
test("a flagged published image that is still the topic's image is removed before its row, and nothing is drawn", async () => {
	const { sentQueries } = stubUncheckedImageCheck(
		{
			uncheckedImageRows: [toUncheckedTopicImageRow({ isPublished: true })],
			topicRowById: { "topic-1": ["unchecked-hash", "public"] },
		},
		FLAGGED,
	)
	const startRenderSpy = spyOn(topicImageRenders, "startTopicImageRender").mockResolvedValue("render-1")

	// the removal of the upload keeps how many unchecked images were deleted before it ran
	let uncheckedImageDeleteCountAtRemoval = -1
	const removeUploadSpy = spyOn(topicImageRenders, "removeTopicImageUpload").mockImplementation(async () => {
		uncheckedImageDeleteCountAtRemoval = toUncheckedImageDeletes(sentQueries).length
		return true
	})
	expect((await checkUncheckedImages()).deletedCount).toBe(1)

	// the upload goes first, then the unchecked image's row, and no render starts
	expect(removeUploadSpy).toHaveBeenCalledWith("topic-1")
	expect(uncheckedImageDeleteCountAtRemoval).toBe(0)
	expect(toUncheckedImageDeletes(sentQueries)).toHaveLength(1)
	expect(startRenderSpy).not.toHaveBeenCalled()
})

// a flagged published image that was replaced since has nothing left to remove
test("a flagged published image that was replaced since is only dropped", async () => {
	const { sentQueries, deletedObjectKeys } = stubUncheckedImageCheck(
		{ uncheckedImageRows: [toUncheckedTopicImageRow({ isPublished: true })] },
		FLAGGED,
	)
	const removeUploadSpy = spyOn(topicImageRenders, "removeTopicImageUpload").mockResolvedValue(true)
	await checkUncheckedImages()
	expect(removeUploadSpy).not.toHaveBeenCalled()
	expect(toUncheckedImageDeletes(sentQueries)).toHaveLength(1)
	expect(deletedObjectKeys).toEqual([])
})

// an unchecked film image stores its file alone, so a check that still cannot run starts no rebuild
test("an unchecked film image whose check could not run stays unchecked and starts no rebuild", async () => {
	const { sentQueries } = stubUncheckedImageCheck(
		{ uncheckedImageRows: [toUncheckedTopicPodcastEpisodeVideoImageRow()] },
		FAILED,
	)
	const rebuildSpy = spyOn(temporalClient, "startTopicPodcastEpisodeVideoRebuild").mockResolvedValue(undefined)
	expect(await checkUncheckedImages()).toEqual({ publishedCount: 0, deletedCount: 0, isCheckUnavailable: true })
	expect(rebuildSpy).not.toHaveBeenCalled()
	expect(sentQueries.some(({ text }) => text.startsWith('update "topic_podcast_episode_videos"'))).toBe(false)
	expect(toUncheckedImageDeletes(sentQueries)).toEqual([])
})

// an unchecked film image that passes becomes the film's image, which rebuilds the intro and the sign-off
test("a clean unchecked film image becomes the film's image and starts the rebuild", async () => {
	const { sentQueries } = stubUncheckedImageCheck(
		{ uncheckedImageRows: [toUncheckedTopicPodcastEpisodeVideoImageRow()] },
		CLEAN,
	)
	const rebuildSpy = spyOn(temporalClient, "startTopicPodcastEpisodeVideoRebuild").mockResolvedValue(undefined)
	expect(await checkUncheckedImages()).toEqual({ publishedCount: 1, deletedCount: 0, isCheckUnavailable: false })

	// the film's row names the upload, the rebuild starts for its podcast episode, and the unchecked image goes
	const topicPodcastEpisodeVideoUpdate = sentQueries.find(({ text }) =>
		text.startsWith('update "topic_podcast_episode_videos"'),
	)
	expect(topicPodcastEpisodeVideoUpdate?.values).toEqual(
		expect.arrayContaining(["unchecked-film-hash", "uploaded", "film-1"]),
	)
	expect(rebuildSpy).toHaveBeenCalledWith("episode-1")
	expect(toUncheckedImageDeletes(sentQueries).map(({ values }) => values[0])).toEqual(["unchecked-film"])
})

// a rejected unchecked film image is deleted, and the film keeps its poster, intro, and sign-off
test("a flagged unchecked film image is deleted, and the film is neither written nor rebuilt", async () => {
	const { sentQueries, deletedObjectKeys } = stubUncheckedImageCheck(
		{ uncheckedImageRows: [toUncheckedTopicPodcastEpisodeVideoImageRow()] },
		FLAGGED,
	)
	const rebuildSpy = spyOn(temporalClient, "startTopicPodcastEpisodeVideoRebuild").mockResolvedValue(undefined)
	expect(await checkUncheckedImages()).toEqual({ publishedCount: 0, deletedCount: 1, isCheckUnavailable: false })

	// the film's row stays, no rebuild starts, and the unchecked image's two jpegs are recorded as pending, then deleted
	const uncheckedObjectKeys = toTopicPodcastEpisodeVideoImageObjectKeys("episode-1", "unchecked-film-hash")
	expect(sentQueries.some(({ text }) => text.startsWith('update "topic_podcast_episode_videos"'))).toBe(false)
	expect(rebuildSpy).not.toHaveBeenCalled()
	expect(toPendingDeletionKeys(sentQueries)).toEqual(uncheckedObjectKeys)
	expect(deletedObjectKeys).toEqual(uncheckedObjectKeys)
})
