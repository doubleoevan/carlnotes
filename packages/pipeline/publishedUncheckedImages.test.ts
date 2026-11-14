// unchecked image tests for a Topic that turns invite or public: each published image whose check has not run goes
// back to its uploader alone with its files kept and its subject's row locked before the read of its current image,
// each ready film drawn from it is marked rendering, a replaced one has its row deleted, a Topic with none writes
// nothing, any other visibility change reads no row, a failed write fails the whole change, and the films and
// covers drawn from a returned image are drawn again
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { db } from "@carlnotes/db"
import { restoreConnectionPool, type SentQuery, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { uncheckedImages } from "@carlnotes/db/schema/uncheckedImages"
import * as store from "@carlnotes/db/store"
import { redrawUnpublishedImageFiles, unpublishTopicUncheckedImages } from "./publishedUncheckedImages"
import * as temporalClient from "./temporalClient"
import * as topicCovers from "./topicImages/topicCovers"

// when each unchecked image in these tests was uploaded
const UPLOADED_AT = new Date("2026-11-13T10:00:00.000Z")

// the pool's own query and every spy, put back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the row of one published image whose check has not run, under topic-1
function toPublishedUncheckedImageRow(id: string, subjectKind: string, subjectId: string): unknown[] {
	const publishedUncheckedImage = { id, subjectKind, subjectId, uploaderUserId: "user-1", imageHash: `${id}-hash` }
	return toTableRow(uncheckedImages, {
		...publishedUncheckedImage,
		isPublished: true,
		uploadedAt: UPLOADED_AT,
		attemptCount: 0,
	})
}

// the rows of topic-1's own image, its podcast episode's, that podcast episode's film's, and its Topic Post's
const PUBLISHED_UNCHECKED_IMAGE_ROWS = [
	toPublishedUncheckedImageRow("unchecked-topic", "topicImage", "topic-1"),
	toPublishedUncheckedImageRow("unchecked-episode", "podcastEpisodeImage", "episode-1"),
	toPublishedUncheckedImageRow("unchecked-film", "topicPodcastEpisodeVideoImage", "episode-1"),
	toPublishedUncheckedImageRow("unchecked-post", "topicPostImage", "post-1"),
]

// what the stubbed database holds: the Topic's visibility before the change, the rows under it, the current image
// hash of every subject, or of each row's own image if none is given, and a write that fails
type PublishedUncheckedImageFixture = {
	previousVisibility?: string
	publishedUncheckedImageRows?: unknown[][]
	currentImageHash?: string
	failedWrite?: string
}

// the row a read of a subject's current image returns, by the table the read starts from
function toSubjectStateRow(text: string, currentImageHash: string): unknown[] {
	if (text.includes('from "topic_podcast_episode_videos"')) {
		return [currentImageHash, "topic-1", "private", "film-1"]
	}
	return [currentImageHash, "topic-1", "private"]
}

// the hash of the image a subject's read names, which is its row's own unless the fixture gives another
function toCurrentImageHash(text: string, currentImageHash: string | undefined): string {
	if (currentImageHash) {
		return currentImageHash
	}

	// a film's read, then a podcast episode's, a Topic Post's, and the Topic's own
	if (text.includes('from "topic_podcast_episode_videos"')) {
		return "unchecked-film-hash"
	}
	if (text.includes('from "episodes"')) {
		return "unchecked-episode-hash"
	}
	return text.includes('from "topic_posts"') ? "unchecked-post-hash" : "unchecked-topic-hash"
}

// stub the database with a Topic and its rows, and keep each stored object a test deletes
function stubTopicPublishedUncheckedImages({
	previousVisibility = "private",
	publishedUncheckedImageRows = [],
	currentImageHash,
	failedWrite,
}: PublishedUncheckedImageFixture = {}): {
	sentQueries: SentQuery[]
	deleteStoredObjectsSpy: ReturnType<typeof spyOn>
} {
	const sentQueries = stubConnectionPool(({ text, values }) => {
		// a write the fixture fails
		if (failedWrite && text.startsWith(failedWrite)) {
			throw new Error("the write failed")
		}

		// the Topic's visibility before the change
		if (text.startsWith('select "visibility" from "topics"')) {
			return [[previousVisibility]]
		}

		// the rows under the Topic, or the one row a read names by its id
		if (text.includes('from "unchecked_images"')) {
			return text.includes("order by")
				? publishedUncheckedImageRows
				: publishedUncheckedImageRows.filter(
						(publishedUncheckedImageRow) => publishedUncheckedImageRow[0] === values[0],
					)
		}

		// a subject's current image
		return text.startsWith("select") ? [toSubjectStateRow(text, toCurrentImageHash(text, currentImageHash))] : []
	})
	const deleteStoredObjectsSpy = spyOn(store, "deleteStoredObjects").mockResolvedValue(undefined)
	return { sentQueries, deleteStoredObjectsSpy }
}

// the statements that write a row, by how each one starts
function toWrites(sentQueries: SentQuery[]): string[] {
	return sentQueries
		.filter(({ text }) => /^(insert|update|delete) /.test(text))
		.map(({ text }) => text.split(" ").slice(0, 3).join(" "))
}

// the change the tests make: topic-1 turns public
function unpublishUncheckedImages(): ReturnType<typeof unpublishTopicUncheckedImages> {
	return db.transaction((transaction) =>
		unpublishTopicUncheckedImages(transaction, { topicId: "topic-1", visibility: "public" }),
	)
}

// a visibility change is never blocked by an image. the image goes back to its uploader alone
test("a private topic that turns public returns each unchecked image to its uploader and keeps its files", async () => {
	const { sentQueries, deleteStoredObjectsSpy } = stubTopicPublishedUncheckedImages({
		publishedUncheckedImageRows: PUBLISHED_UNCHECKED_IMAGE_ROWS,
	})
	expect(await unpublishUncheckedImages()).toEqual([
		{ subjectKind: "topicImage", subjectId: "topic-1" },
		{ subjectKind: "podcastEpisodeImage", subjectId: "episode-1" },
		{ subjectKind: "topicPodcastEpisodeVideoImage", subjectId: "episode-1" },
		{ subjectKind: "topicPostImage", subjectId: "post-1" },
	])

	// each subject's image is cleared and its unchecked image is marked unpublished, by its id and the time it was
	// uploaded, and the films drawn from a Topic's, a podcast episode's, or a film's image are marked rendering
	expect(toWrites(sentQueries)).toEqual([
		'delete from "topic_images"',
		'update "topics" set',
		'update "unchecked_images" set',
		'update "topic_podcast_episode_videos" set',
		'update "episodes" set',
		'update "unchecked_images" set',
		'update "topic_podcast_episode_videos" set',
		'update "topic_podcast_episode_videos" set',
		'update "unchecked_images" set',
		'update "topic_podcast_episode_videos" set',
		'update "topic_posts" set',
		'update "unchecked_images" set',
	])

	// only a ready film drawn from the unpublished image stops playing: the Topic's films, then episode-1's film
	// twice. the second value of each update is the time the row changed
	const renderingFilmUpdates = sentQueries.filter(({ text }) => text.includes('"rendered_image_hash" = $'))
	expect(renderingFilmUpdates.map(({ values }) => values.toSpliced(1, 1))).toEqual([
		["rendering", "topic-1", "ready", "unchecked-topic-hash"],
		["rendering", "episode-1", "ready", "unchecked-episode-hash"],
		["rendering", "episode-1", "ready", "unchecked-film-hash"],
	])

	// each subject's row is locked before the read of its current image, so no render replaces the image in between
	const rowLockIndexes = sentQueries.flatMap(({ text }, i) => (text.includes("for no key update") ? [i] : []))
	expect(rowLockIndexes).toHaveLength(4)
	for (const rowLockIndex of rowLockIndexes) {
		expect(sentQueries[rowLockIndex + 1]?.text).toStartWith("select")
		expect(sentQueries[rowLockIndex + 1]?.text).not.toContain("for no key update")
	}

	// each unchecked image is marked unpublished by its id and the time it was uploaded
	const uncheckedImageUpdates = sentQueries.filter(({ text }) => text.startsWith('update "unchecked_images"'))
	expect(uncheckedImageUpdates.map(({ values }) => values)).toEqual(
		["unchecked-topic", "unchecked-episode", "unchecked-film", "unchecked-post"].map((id) => [
			false,
			id,
			UPLOADED_AT.toISOString(),
		]),
	)

	// the Topic's lock is exclusive and first, and every subject's lock is taken before the first write
	const lockQueries = sentQueries.filter(({ text }) => text.includes("pg_advisory_xact_lock"))
	expect(sentQueries[0]?.text).toContain("pg_advisory_xact_lock(")
	expect(lockQueries.map(({ values }) => values[0])).toEqual([
		"unchecked-image-topic:topic-1",
		"unchecked-image:topicImage:topic-1",
		"unchecked-image:podcastEpisodeImage:episode-1",
		"unchecked-image:topicPodcastEpisodeVideoImage:episode-1",
		"unchecked-image:topicPostImage:post-1",
	])
	const firstWriteIndex = sentQueries.findIndex(({ text }) => /^(update|delete) /.test(text))
	expect(sentQueries.indexOf(lockQueries.at(-1) as SentQuery)).toBeLessThan(firstWriteIndex)

	// no file is deleted or recorded for deletion
	expect(deleteStoredObjectsSpy).not.toHaveBeenCalled()
})

// an image that a render or another upload replaced has its unchecked image deleted
test("an unchecked image that is no longer its subject's current image is deleted, and no image is cleared", async () => {
	const publishedUncheckedImageRows = [toPublishedUncheckedImageRow("unchecked-topic", "topicImage", "topic-1")]
	const { sentQueries } = stubTopicPublishedUncheckedImages({
		publishedUncheckedImageRows,
		currentImageHash: "render-hash",
	})
	expect(await unpublishUncheckedImages()).toEqual([])
	expect(toWrites(sentQueries)).toEqual(['delete from "unchecked_images"'])
	const uncheckedImageDelete = sentQueries.find(({ text }) => text.startsWith('delete from "unchecked_images"'))
	expect(uncheckedImageDelete?.values).toEqual(["unchecked-topic", UPLOADED_AT.toISOString()])
})

// most Topics have no unchecked image
test("a private topic with no unchecked image writes nothing", async () => {
	const { sentQueries } = stubTopicPublishedUncheckedImages()
	expect(await unpublishUncheckedImages()).toEqual([])
	expect(toWrites(sentQueries)).toEqual([])
	expect(sentQueries).toHaveLength(3)
})

// no unchecked image is published under a Topic that is not private
test("a visibility change that is not from private to invite or public reads no unchecked image", async () => {
	const fromInvite = stubTopicPublishedUncheckedImages({
		previousVisibility: "invite",
		publishedUncheckedImageRows: PUBLISHED_UNCHECKED_IMAGE_ROWS,
	})
	expect(await unpublishUncheckedImages()).toEqual([])
	expect(fromInvite.sentQueries.some(({ text }) => text.includes('from "unchecked_images"'))).toBe(false)

	// a Topic that turns or stays private sends no statement at all
	restoreConnectionPool()
	const toPrivate = stubTopicPublishedUncheckedImages({ publishedUncheckedImageRows: PUBLISHED_UNCHECKED_IMAGE_ROWS })
	const uncheckedImageSubjects = await db.transaction((transaction) =>
		unpublishTopicUncheckedImages(transaction, { topicId: "topic-1", visibility: "private" }),
	)
	expect(uncheckedImageSubjects).toEqual([])
	expect(toPrivate.sentQueries).toEqual([])
})

// the change's transaction ends with the error, so the Topic's visibility is never written
test("a write that fails throws its error out of the visibility change's transaction", async () => {
	stubTopicPublishedUncheckedImages({
		publishedUncheckedImageRows: PUBLISHED_UNCHECKED_IMAGE_ROWS,
		failedWrite: 'update "episodes"',
	})
	await expect(unpublishUncheckedImages()).rejects.toThrow('Failed query: update "episodes"')
})

// the Topic's image is drawn into its covers and into each film with no image of its own
test("the covers and the films drawn from a returned image are drawn again, each film once", async () => {
	stubConnectionPool(({ text }) =>
		text.includes('from "topic_podcast_episode_videos"') ? [["episode-1"], ["episode-2"]] : [],
	)
	const forgetTopicCoversSpy = spyOn(topicCovers, "forgetTopicCovers").mockResolvedValue(undefined)
	const rebuildSpy = spyOn(temporalClient, "startTopicPodcastEpisodeVideoRebuild").mockResolvedValue(undefined)
	await redrawUnpublishedImageFiles("topic-1", [
		{ subjectKind: "topicImage", subjectId: "topic-1" },
		{ subjectKind: "podcastEpisodeImage", subjectId: "episode-1" },
		{ subjectKind: "topicPodcastEpisodeVideoImage", subjectId: "episode-1" },
		{ subjectKind: "topicPostImage", subjectId: "post-1" },
	])

	// episode-1's film is rebuilt once for its own image, its podcast episode's, and the Topic's
	expect(forgetTopicCoversSpy).toHaveBeenCalledTimes(1)
	expect(forgetTopicCoversSpy).toHaveBeenCalledWith("topic-1")
	expect(rebuildSpy.mock.calls.map(([podcastEpisodeId]) => podcastEpisodeId)).toEqual(["episode-1", "episode-2"])
})

// a film's own image alone rebuilds that film, and a Topic Post's image is drawn into no stored file
test("a returned film image starts its film's rebuild once, and a returned Topic Post image starts nothing", async () => {
	const sentQueries = stubConnectionPool()
	const forgetTopicCoversSpy = spyOn(topicCovers, "forgetTopicCovers").mockResolvedValue(undefined)
	const rebuildSpy = spyOn(temporalClient, "startTopicPodcastEpisodeVideoRebuild").mockResolvedValue(undefined)
	await redrawUnpublishedImageFiles("topic-1", [
		{ subjectKind: "topicPodcastEpisodeVideoImage", subjectId: "episode-1" },
		{ subjectKind: "topicPostImage", subjectId: "post-1" },
	])
	expect(rebuildSpy.mock.calls).toEqual([["episode-1"]])

	// a change that returned no image starts nothing and reads nothing
	await redrawUnpublishedImageFiles("topic-1", [])
	expect(rebuildSpy).toHaveBeenCalledTimes(1)
	expect(forgetTopicCoversSpy).not.toHaveBeenCalled()
	expect(sentQueries).toEqual([])
})
