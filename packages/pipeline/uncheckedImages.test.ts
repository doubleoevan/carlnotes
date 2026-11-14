// unchecked image upload tests: an upload is published, saved as unchecked, or published and recorded by its check and
// its Topic's visibility, an unchecked image that a newer upload replaces leaves no file, a published unchecked image
// stays until its image is checked or replaced, a drop deletes an unchecked image's files through the pending
// deletions, and an upload of bytes whose files were pending deletion keeps them or fails
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { uncheckedImages } from "@carlnotes/db/schema/uncheckedImages"
import * as store from "@carlnotes/db/store"
import { toTopicImageObjectKeys } from "./topicImages/topicImageFiles"
import * as topicImageRenders from "./topicImages/topicImageRenders"
import { dropUncheckedImage, dropUnpublishedUncheckedImage, publishOrSaveUncheckedImage } from "./uncheckedImages"

// topic-1's image, and an upload to it by user-1
const TOPIC_IMAGE_SUBJECT = { subjectKind: "topicImage", subjectId: "topic-1" } as const
const UPLOADED_IMAGE = { ...TOPIC_IMAGE_SUBJECT, uploaderUserId: "user-1" } as const

// the pool's own query and every spy, put back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the unchecked image of topic-1 under a hash, uploaded just now and shown to its uploader alone unless the test says
// otherwise
function toUncheckedTopicImageRow(columnValues: Record<string, unknown> = {}): unknown[] {
	return toTableRow(uncheckedImages, {
		id: "unchecked-topic",
		...UPLOADED_IMAGE,
		imageHash: "unchecked-hash",
		isPublished: false,
		uploadedAt: new Date(),
		attemptCount: 0,
		...columnValues,
	})
}

// what the stubbed database holds: the unchecked image of topic-1, or none, the topic's current image hash and
// visibility, or null for a topic that cannot be read, and the keys of the upload's files that are pending deletion
type UncheckedImageFixture = {
	uncheckedImageRow?: unknown[]
	topicRow?: [string | null, string] | null
	pendingObjectKeys?: string[]
}

// stub the database with the topic and its unchecked image, keep each stored object a test deletes, and spy the write
// that makes an upload the topic's image
function stubUncheckedImageUpload({
	uncheckedImageRow,
	topicRow = ["current-hash", "public"],
	pendingObjectKeys = [],
}: UncheckedImageFixture = {}): {
	sentQueries: SentQuery[]
	deletedObjectKeys: string[]
	replaceTopicImageSpy: ReturnType<typeof spyOn>
} {
	// a read of the unchecked image and a delete of it both return its row
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes('from "unchecked_images"')) {
			return uncheckedImageRow ? [uncheckedImageRow] : []
		}

		// the upload's clear of its files' pending deletions returns each key that was pending
		if (text.startsWith('delete from "pending_object_deletions"')) {
			return pendingObjectKeys.map((pendingObjectKey) => [pendingObjectKey])
		}
		return text.includes('from "topics"') && topicRow ? [[topicRow[0], "topic-1", topicRow[1]]] : []
	})

	// each delete of the files still pending is kept in the order it ran
	const deletedObjectKeys: string[] = []
	spyOn(store, "deletePendingStoredObjects").mockImplementation(async (objectKeys: string[]) => {
		deletedObjectKeys.push(...objectKeys)
	})
	const replaceTopicImageSpy = spyOn(topicImageRenders, "replaceTopicImage").mockResolvedValue(undefined)
	return { sentQueries, deletedObjectKeys, replaceTopicImageSpy }
}

// the keys the sent queries recorded as pending deletions
function toPendingDeletionKeys(sentQueries: SentQuery[]): unknown[] {
	return sentQueries
		.filter(({ text }) => text.startsWith('insert into "pending_object_deletions"'))
		.flatMap(({ values }) => values.filter((value) => typeof value === "string"))
}

// whether the sent queries wrote an unchecked image, and whether they deleted one
function toUncheckedImageWrites(sentQueries: SentQuery[]): { hasInsert: boolean; hasDelete: boolean } {
	return {
		hasInsert: sentQueries.some(({ text }) => text.startsWith('insert into "unchecked_images"')),
		hasDelete: sentQueries.some(({ text }) => text.startsWith('delete from "unchecked_images"')),
	}
}

// an upload that passed its check is published under the subject's lock, and the unchecked image before it leaves no
// file
test("a checked upload is published and replaces an unchecked image, whose files are recorded and deleted", async () => {
	const { sentQueries, deletedObjectKeys, replaceTopicImageSpy } = stubUncheckedImageUpload({
		uncheckedImageRow: toUncheckedTopicImageRow(),
	})
	let publishQueryCount = 0
	replaceTopicImageSpy.mockImplementation(async () => {
		publishQueryCount = sentQueries.length
	})
	const checkedUpload = { ...UPLOADED_IMAGE, imageHash: "new-hash", isUnchecked: false }
	expect(await publishOrSaveUncheckedImage(checkedUpload)).toBe("published")

	// the lock is the first statement, and the publish runs after it and the clear of the upload's pending deletions
	expect(sentQueries[0]?.text).toContain("pg_advisory_xact_lock")
	expect(sentQueries[0]?.values).toEqual(["unchecked-image:topicImage:topic-1"])
	expect(sentQueries[1]?.text).toStartWith('delete from "pending_object_deletions"')
	expect(sentQueries[1]?.values).toEqual(toTopicImageObjectKeys("topic-1", "new-hash"))
	expect(replaceTopicImageSpy).toHaveBeenCalledTimes(1)
	expect(publishQueryCount).toBe(2)

	// the unchecked image goes, and its original and six files are recorded as pending, then deleted under the
	// subject's lock, which is taken again
	const uncheckedObjectKeys = toTopicImageObjectKeys("topic-1", "unchecked-hash")
	expect(toUncheckedImageWrites(sentQueries).hasDelete).toBe(true)
	expect(toPendingDeletionKeys(sentQueries)).toEqual(uncheckedObjectKeys)
	expect(deletedObjectKeys).toEqual(uncheckedObjectKeys)
	expect(sentQueries.at(-1)?.values).toEqual(["unchecked-image:topicImage:topic-1"])
})

// an unchecked image that these bytes replaced earlier left their files pending deletion
test("an upload of bytes whose files are pending deletion keeps them, or fails if they are already deleted", async () => {
	const uploadedObjectKeys = toTopicImageObjectKeys("topic-1", "new-hash")
	const storedUpload = stubUncheckedImageUpload({ pendingObjectKeys: uploadedObjectKeys })
	const attachmentExistsSpy = spyOn(store, "attachmentExists").mockResolvedValue(true)
	const checkedUpload = { ...UPLOADED_IMAGE, imageHash: "new-hash", isUnchecked: false }

	// the files are still stored, so the upload is published once its first file is found
	expect(await publishOrSaveUncheckedImage(checkedUpload)).toBe("published")
	expect(attachmentExistsSpy.mock.calls.flat()).toEqual(uploadedObjectKeys.slice(0, 1))
	expect(storedUpload.replaceTopicImageSpy).toHaveBeenCalledTimes(1)

	// the files are gone, so the upload fails and nothing is published
	restoreConnectionPool()
	mock.restore()
	const deletedUpload = stubUncheckedImageUpload({ pendingObjectKeys: uploadedObjectKeys })
	spyOn(store, "attachmentExists").mockResolvedValue(false)
	await expect(publishOrSaveUncheckedImage(checkedUpload)).rejects.toThrow("files were deleted")
	expect(deletedUpload.replaceTopicImageSpy).not.toHaveBeenCalled()
})

// the bytes that were unchecked are the image that was just published, so their files stay
test("a checked upload of the bytes that were unchecked keeps their files", async () => {
	const { sentQueries, deletedObjectKeys } = stubUncheckedImageUpload({ uncheckedImageRow: toUncheckedTopicImageRow() })
	const checkedUpload = { ...UPLOADED_IMAGE, imageHash: "unchecked-hash", isUnchecked: false }
	expect(await publishOrSaveUncheckedImage(checkedUpload)).toBe("published")
	expect(toUncheckedImageWrites(sentQueries).hasDelete).toBe(true)
	expect(toPendingDeletionKeys(sentQueries)).toEqual([])
	expect(deletedObjectKeys).toEqual([])
})

// an unchecked upload on a public or invite Topic is saved as unchecked and never published
test("an unchecked upload on a public or invite topic is shown to its uploader alone", async () => {
	for (const visibility of ["public", "invite"]) {
		const { sentQueries, replaceTopicImageSpy } = stubUncheckedImageUpload({ topicRow: ["current-hash", visibility] })
		const uncheckedUpload = { ...UPLOADED_IMAGE, imageHash: "new-hash", width: 1536, height: 1024 }
		expect(await publishOrSaveUncheckedImage({ ...uncheckedUpload, isUnchecked: true })).toBe("unchecked")

		// nothing is published, and the unchecked image is saved as unpublished
		expect(replaceTopicImageSpy).not.toHaveBeenCalled()
		const uncheckedImageInsert = sentQueries.find(({ text }) => text.startsWith('insert into "unchecked_images"'))
		expect(uncheckedImageInsert?.values).toContain("new-hash")
		expect(uncheckedImageInsert?.values).toContain(false)
		restoreConnectionPool()
		mock.restore()
	}
})

// only a Topic read as private publishes an unchecked upload, so a subject that cannot be read publishes nothing
test("an unchecked upload whose topic cannot be read is shown to its uploader alone", async () => {
	const { sentQueries, replaceTopicImageSpy } = stubUncheckedImageUpload({ topicRow: null })
	const uncheckedUpload = { ...UPLOADED_IMAGE, imageHash: "new-hash", isUnchecked: true }
	expect(await publishOrSaveUncheckedImage(uncheckedUpload)).toBe("unchecked")

	// nothing is published, and the unchecked image is saved as unpublished
	expect(replaceTopicImageSpy).not.toHaveBeenCalled()
	const uncheckedImageInsert = sentQueries.find(({ text }) => text.startsWith('insert into "unchecked_images"'))
	expect(uncheckedImageInsert?.values).toContain(false)
})

// a second unchecked upload replaces the first, whose files are recorded as pending in the save's transaction
test("an unchecked upload that a newer unchecked upload replaces has its files recorded as pending and deleted", async () => {
	const { sentQueries, deletedObjectKeys } = stubUncheckedImageUpload({
		uncheckedImageRow: toUncheckedTopicImageRow({ imageHash: "replaced-hash" }),
	})
	const uncheckedUpload = { ...UPLOADED_IMAGE, imageHash: "new-hash", isUnchecked: true }
	expect(await publishOrSaveUncheckedImage(uncheckedUpload)).toBe("unchecked")

	// the newer unchecked image is written, and the replaced one's files go through the pending deletions
	const replacedObjectKeys = toTopicImageObjectKeys("topic-1", "replaced-hash")
	expect(toUncheckedImageWrites(sentQueries).hasInsert).toBe(true)
	expect(toPendingDeletionKeys(sentQueries)).toEqual(replacedObjectKeys)
	expect(deletedObjectKeys).toEqual(replacedObjectKeys)
})

// an unchecked upload on a private Topic shows at once and is recorded for the sweep
test("an unchecked upload on a private topic is published and recorded as published", async () => {
	const { sentQueries, replaceTopicImageSpy } = stubUncheckedImageUpload({ topicRow: ["current-hash", "private"] })
	let isUncheckedImageSavedBeforePublish = false
	replaceTopicImageSpy.mockImplementation(async () => {
		isUncheckedImageSavedBeforePublish = toUncheckedImageWrites(sentQueries).hasInsert
	})
	const privateUpload = { ...UPLOADED_IMAGE, imageHash: "new-hash", isUnchecked: true }

	// the upload is the topic's image at once with no unchecked outcome, and the sweep's row is marked published
	expect(await publishOrSaveUncheckedImage(privateUpload)).toBe("published")
	expect(replaceTopicImageSpy).toHaveBeenCalledTimes(1)
	const uncheckedImageInsert = sentQueries.find(({ text }) => text.startsWith('insert into "unchecked_images"'))
	expect(uncheckedImageInsert?.values).toContain(true)

	// the sweep's row is written before the upload is published, so no unchecked image is published with no record
	expect(isUncheckedImageSavedBeforePublish).toBe(true)
})

// the same bytes again leave the record that the topic's current image was never checked
test("an unchecked upload of the bytes that are already the topic's image is published, and a published unchecked image stays", async () => {
	const { sentQueries, deletedObjectKeys, replaceTopicImageSpy } = stubUncheckedImageUpload({
		uncheckedImageRow: toUncheckedTopicImageRow({ imageHash: "current-hash", isPublished: true }),
		topicRow: ["current-hash", "private"],
	})
	const sameBytesUpload = { ...UPLOADED_IMAGE, imageHash: "current-hash", isUnchecked: true }
	expect(await publishOrSaveUncheckedImage(sameBytesUpload)).toBe("published")

	// the publish runs, and the published unchecked image is neither rewritten nor deleted
	expect(replaceTopicImageSpy).toHaveBeenCalledTimes(1)
	expect(toUncheckedImageWrites(sentQueries)).toEqual({ hasInsert: false, hasDelete: false })
	expect(deletedObjectKeys).toEqual([])
})

// bytes that are already the subject's current image replace an unchecked image shown to its uploader
// alone
test("an unchecked upload of the bytes that are already the topic's image drops an unpublished unchecked image", async () => {
	const { sentQueries, deletedObjectKeys, replaceTopicImageSpy } = stubUncheckedImageUpload({
		uncheckedImageRow: toUncheckedTopicImageRow(),
	})
	const sameBytesUpload = { ...UPLOADED_IMAGE, imageHash: "current-hash", isUnchecked: true }
	expect(await publishOrSaveUncheckedImage(sameBytesUpload)).toBe("published")

	// the unchecked image's row and its files go
	expect(replaceTopicImageSpy).toHaveBeenCalledTimes(1)
	expect(toUncheckedImageWrites(sentQueries)).toEqual({ hasInsert: false, hasDelete: true })
	expect(deletedObjectKeys).toEqual(toTopicImageObjectKeys("topic-1", "unchecked-hash"))
})

// a write that makes the Topic invite or public waits for an unchecked upload, and the upload waits for that write
test("an unchecked upload takes its topic's image visibility lock, shared, before its subject's lock", async () => {
	const { sentQueries } = stubUncheckedImageUpload({ topicRow: ["current-hash", "private"] })
	const privateUpload = { ...UPLOADED_IMAGE, imageHash: "new-hash", isUnchecked: true }
	await publishOrSaveUncheckedImage(privateUpload)

	// the topic's lock is shared and comes first, and the topic's visibility is read again once both locks are taken
	const lockQueries = sentQueries.filter(({ text }) => text.includes("pg_advisory_xact_lock"))
	expect(lockQueries[0]?.text).toContain("pg_advisory_xact_lock_shared")
	expect(lockQueries.slice(0, 2).map(({ values }) => values[0])).toEqual([
		"unchecked-image-topic:topic-1",
		"unchecked-image:topicImage:topic-1",
	])
	const topicReadIndexes = sentQueries.flatMap(({ text }, i) => (text.includes('from "topics"') ? [i] : []))
	expect(topicReadIndexes.at(-1)).toBeGreaterThan(sentQueries.indexOf(lockQueries[1] as SentQuery))
})

// an upload that passed its check reads no visibility, so it takes its subject's lock alone
test("a checked upload takes no topic lock", async () => {
	const { sentQueries } = stubUncheckedImageUpload()
	const checkedUpload = { ...UPLOADED_IMAGE, imageHash: "new-hash", isUnchecked: false }
	await publishOrSaveUncheckedImage(checkedUpload)
	expect(sentQueries.some(({ values }) => values[0] === "unchecked-image-topic:topic-1")).toBe(false)
})

// a published unchecked image whose image a render replaced records nothing the topic still shows
test("an unchecked upload to a public topic replaces a published unchecked image whose image was replaced", async () => {
	const { sentQueries, deletedObjectKeys } = stubUncheckedImageUpload({
		uncheckedImageRow: toUncheckedTopicImageRow({ imageHash: "replaced-hash", isPublished: true }),
	})
	const publicUpload = { ...UPLOADED_IMAGE, imageHash: "new-hash", isUnchecked: true }
	expect(await publishOrSaveUncheckedImage(publicUpload)).toBe("unchecked")

	// the unchecked image is rewritten as unpublished, and the replaced image's files are left to the write that replaced
	// it
	const uncheckedImageInsert = sentQueries.find(({ text }) => text.startsWith('insert into "unchecked_images"'))
	expect(uncheckedImageInsert?.values).toContain("new-hash")
	expect(toPendingDeletionKeys(sentQueries)).toEqual([])
	expect(deletedObjectKeys).toEqual([])
})

// a regenerate leaves a published unchecked image for the sweep, and drops one shown to its uploader alone
test("a regenerate's drop keeps a published unchecked image, and deletes an unpublished one with its files", async () => {
	const publishedUncheckedImage = stubUncheckedImageUpload({
		uncheckedImageRow: toUncheckedTopicImageRow({ imageHash: "current-hash", isPublished: true }),
	})
	await dropUnpublishedUncheckedImage(TOPIC_IMAGE_SUBJECT)
	expect(publishedUncheckedImage.sentQueries[0]?.text).toContain("pg_advisory_xact_lock")
	expect(toUncheckedImageWrites(publishedUncheckedImage.sentQueries).hasDelete).toBe(false)
	expect(publishedUncheckedImage.deletedObjectKeys).toEqual([])

	// an unpublished unchecked image goes with its files
	restoreConnectionPool()
	mock.restore()
	const uncheckedUpload = stubUncheckedImageUpload({ uncheckedImageRow: toUncheckedTopicImageRow() })
	await dropUnpublishedUncheckedImage(TOPIC_IMAGE_SUBJECT)

	// its row is deleted, and its original and six files are recorded and deleted
	const uncheckedObjectKeys = toTopicImageObjectKeys("topic-1", "unchecked-hash")
	expect(toUncheckedImageWrites(uncheckedUpload.sentQueries).hasDelete).toBe(true)
	expect(toPendingDeletionKeys(uncheckedUpload.sentQueries)).toEqual(uncheckedObjectKeys)
	expect(uncheckedUpload.deletedObjectKeys).toEqual(uncheckedObjectKeys)
})

// an admin's removal drops any unchecked image, and a published one's files are its subject's own
test("an admin's drop deletes a published unchecked image's row and leaves its files", async () => {
	const { sentQueries, deletedObjectKeys } = stubUncheckedImageUpload({
		uncheckedImageRow: toUncheckedTopicImageRow({ imageHash: "current-hash", isPublished: true }),
	})
	await dropUncheckedImage(TOPIC_IMAGE_SUBJECT, null)

	// the unchecked image goes by its subject, under the subject's lock, and no file is recorded or deleted
	expect(sentQueries[0]?.text).toContain("pg_advisory_xact_lock")
	const uncheckedImageDelete = sentQueries.find(({ text }) => text.startsWith('delete from "unchecked_images"'))
	expect(uncheckedImageDelete?.values).toEqual(["topicImage", "topic-1"])
	expect(toPendingDeletionKeys(sentQueries)).toEqual([])
	expect(deletedObjectKeys).toEqual([])
})
