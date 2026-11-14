// unchecked image row tests: a save takes its subject's lock before it reads the unchecked image it replaces, work
// under a subject's lock runs after the lock is taken, the transactions that take a subject's lock run one at a time,
// the sweep's page reads the fewest failed checks first, and the sweep's writes match an unchecked image only by its
// id and the time it was uploaded
import { afterEach, expect, mock, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool, toTableRow } from "./connectionPoolStub"
import { db } from "./index"
import { uncheckedImages } from "./schema/uncheckedImages"
import {
	countFailedUncheckedImageCheck,
	deleteUncheckedImageById,
	isUncheckedImageStillStored,
	loadTopicPublishedUncheckedImages,
	loadUncheckedImagesToCheck,
	lockTopicImageVisibility,
	saveUncheckedImage,
	saveUncheckedImageReported,
	saveUncheckedImageUnpublished,
	type UncheckedImageRow,
	withUncheckedImageSubjectLock,
} from "./uncheckedImages"

// an unchecked image of topic-1 as the sweep read it, and its row
const UPLOADED_AT = new Date("2026-11-13T10:00:00.000Z")
const UNCHECKED_IMAGE = {
	id: "unchecked-1",
	subjectKind: "topicImage",
	subjectId: "topic-1",
	uploadedAt: UPLOADED_AT,
} as UncheckedImageRow
const UNCHECKED_IMAGE_ROW = toTableRow(uncheckedImages, { ...UNCHECKED_IMAGE, imageHash: "old-hash" })

// the pool's own query and every spy, put back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// two uploads at once for one subject save one unchecked image, because each takes the subject's lock first
test("a save takes its subject's lock, then replaces the unchecked image of the subject and returns it", async () => {
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "unchecked_images"') ? [UNCHECKED_IMAGE_ROW] : [],
	)
	const uncheckedUpload = { subjectKind: "topicImage", subjectId: "topic-1", uploaderUserId: "user-1" } as const
	const replacedUncheckedImage = await db.transaction((transaction) =>
		saveUncheckedImage(transaction, { ...uncheckedUpload, imageHash: "new-hash" }),
	)

	// the lock names the subject and comes before the read of the unchecked image it replaces
	expect(sentQueries[0]?.text).toContain("pg_advisory_xact_lock")
	expect(sentQueries[0]?.values).toEqual(["unchecked-image:topicImage:topic-1"])
	expect(sentQueries[1]?.text).toContain('from "unchecked_images"')
	expect(replacedUncheckedImage?.imageHash).toBe("old-hash")

	// the new unchecked image is written over the subject's one row
	const uncheckedImageInsert = sentQueries.find(({ text }) => text.startsWith('insert into "unchecked_images"'))
	expect(uncheckedImageInsert?.text).toContain('on conflict ("subject_kind","subject_id") do update')
	expect(uncheckedImageInsert?.values).toContain("new-hash")
})

// an upload, a drop, and the sweep's write of one subject run one at a time
test("work under a subject's lock runs after the lock is taken, and its result is returned", async () => {
	const sentQueries = stubConnectionPool()
	const uncheckedImageSubject = { subjectKind: "topicPostImage", subjectId: "post-1" } as const
	const workResult = await withUncheckedImageSubjectLock(uncheckedImageSubject, async (transaction) => {
		await isUncheckedImageStillStored(transaction, UNCHECKED_IMAGE)
		return "done"
	})

	// the lock names the subject and comes before the work's own read
	expect(workResult).toBe("done")
	expect(sentQueries.map(({ text }) => text.includes("pg_advisory_xact_lock"))).toEqual([true, false])
	expect(sentQueries[0]?.values).toEqual(["unchecked-image:topicPostImage:post-1"])
})

// a publish inside the work writes on a second connection, so the waiting transactions take no connection
test("a second transaction that takes a subject's lock starts once the first one ends", async () => {
	const sentQueries = stubConnectionPool()
	const firstSubject = { subjectKind: "topicImage", subjectId: "topic-1" } as const
	const secondSubject = { subjectKind: "topicImage", subjectId: "topic-2" } as const

	// the first transaction's work waits until the test lets it end
	let endFirstWork = (): void => {}
	const firstWorkEnd = new Promise<void>((resolve) => {
		endFirstWork = resolve
	})
	const firstWork = withUncheckedImageSubjectLock(firstSubject, () => firstWorkEnd)
	const secondWork = withUncheckedImageSubjectLock(secondSubject, async () => "second")

	// only the first subject's lock is taken while the first work runs
	await Bun.sleep(1)
	expect(sentQueries.map(({ values }) => values[0])).toEqual(["unchecked-image:topicImage:topic-1"])

	// the second transaction takes its lock once the first one ends
	endFirstWork()
	await firstWork
	expect(await secondWork).toBe("second")
	expect(sentQueries.map(({ values }) => values[0])).toEqual([
		"unchecked-image:topicImage:topic-1",
		"unchecked-image:topicImage:topic-2",
	])
})

// an unchecked image whose check keeps failing no longer goes first
test("the sweep's page reads the fewest failed checks first, then the earliest uploaded, without the ones it read", async () => {
	const sentQueries = stubConnectionPool()
	await loadUncheckedImagesToCheck({ limit: 20, readUncheckedImageIds: [] })
	await loadUncheckedImagesToCheck({ limit: 20, readUncheckedImageIds: ["unchecked-1", "unchecked-2"] })

	// the first page leaves nothing out, and each page has the same order
	const uncheckedImageOrder =
		'order by "unchecked_images"."attempt_count" asc, "unchecked_images"."uploaded_at" asc, "unchecked_images"."id" asc'
	expect(sentQueries[0]?.text).toContain(uncheckedImageOrder)
	expect(sentQueries[0]?.text).not.toContain("not in")
	expect(sentQueries[0]?.values).toEqual([20])

	// the next page leaves out the unchecked images the sweep already read
	expect(sentQueries[1]?.text).toContain('"unchecked_images"."id" not in ($1, $2)')
	expect(sentQueries[1]?.text).toContain(uncheckedImageOrder)
	expect(sentQueries[1]?.values).toEqual(["unchecked-1", "unchecked-2", 20])
})

// a newer upload writes a new time to the subject's row, so a write by id and time leaves the newer
// unchecked image
test("the sweep's writes match an unchecked image by its id and the time it was uploaded", async () => {
	const sentQueries = stubConnectionPool(({ text }) => (text.startsWith("delete") ? [UNCHECKED_IMAGE_ROW] : []))
	expect(await deleteUncheckedImageById(db, UNCHECKED_IMAGE)).toMatchObject({
		id: "unchecked-1",
		imageHash: "old-hash",
	})
	expect(await isUncheckedImageStillStored(db, UNCHECKED_IMAGE)).toBe(false)
	await countFailedUncheckedImageCheck(UNCHECKED_IMAGE)
	await saveUncheckedImageReported(UNCHECKED_IMAGE)

	// the delete, the read, the attempt count, and the report each name the id and the time
	expect(sentQueries).toHaveLength(4)
	for (const { text, values } of sentQueries) {
		expect(text).toContain('"unchecked_images"."id" = $')
		expect(text).toContain('"unchecked_images"."uploaded_at" = $')
		expect(values).toContain("unchecked-1")
		expect(values).toContain(UPLOADED_AT.toISOString())
	}
})

// an unchecked image that a newer upload replaced is not the one that was read
test("a delete by id and time returns null for an unchecked image that was replaced", async () => {
	stubConnectionPool()
	expect(await deleteUncheckedImageById(db, UNCHECKED_IMAGE)).toBeNull()
})

// an unchecked upload reads its Topic's visibility under the shared lock, and the visibility's write takes it alone
test("a topic's image visibility lock is shared for an upload and exclusive for the visibility's write", async () => {
	const sentQueries = stubConnectionPool()
	await lockTopicImageVisibility(db, "topic-1", "shared")
	await lockTopicImageVisibility(db, "topic-1", "exclusive")
	expect(sentQueries.map(({ text }) => text)).toEqual([
		"select pg_advisory_xact_lock_shared(hashtext($1))",
		"select pg_advisory_xact_lock(hashtext($1))",
	])
	expect(sentQueries.map(({ values }) => values)).toEqual([
		["unchecked-image-topic:topic-1"],
		["unchecked-image-topic:topic-1"],
	])
})

// a film's image names its podcast episode, so one read finds every published unchecked image under a Topic
test("the published unchecked images under a topic are its own, its podcast episodes', their films', and its Topic Posts'", async () => {
	const sentQueries = stubConnectionPool()
	await loadTopicPublishedUncheckedImages(db, "topic-1")
	const publishedUncheckedImagesText = sentQueries[0]?.text ?? ""
	expect(publishedUncheckedImagesText).toContain('"unchecked_images"."is_published" = $1')
	expect(publishedUncheckedImagesText).toContain('select "id" from "episodes" where "episodes"."topic_id" = $')
	expect(publishedUncheckedImagesText).toContain('select "id" from "topic_posts" where "topic_posts"."topic_id" = $')
	expect(sentQueries[0]?.values).toEqual(
		expect.arrayContaining([true, "topicImage", "podcastEpisodeImage", "topicPodcastEpisodeVideoImage", "topic-1"]),
	)

	// a published unchecked image is unpublished by its id and the time it was uploaded
	await saveUncheckedImageUnpublished(db, UNCHECKED_IMAGE)
	expect(sentQueries[1]?.text).toContain('update "unchecked_images" set "is_published" = $1')
	expect(sentQueries[1]?.values).toEqual([false, "unchecked-1", UPLOADED_AT.toISOString()])
})
