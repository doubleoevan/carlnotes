// the unchecked images: an uploaded image whose image moderation could not run, recorded for the sweep to check
// again. a public-bound image is kept for its uploader alone meanwhile, and a private Topic's image is already
// published. an upload's save as unchecked, a drop, and the sweep's write of one subject's unchecked image each take
// that subject's lock, and a Topic's image visibility lock orders its visibility change with the uploads that read it

import type { UncheckedImageSubjectKind } from "@carlnotes/contracts/enums"
import { createConcurrencyLimiter } from "@carlnotes/server/concurrency"
import { and, asc, eq, inArray, notInArray, or, type SQL, sql } from "drizzle-orm"
import { type DbHandle, type DbTransaction, db } from "./index"
import { podcastEpisodes } from "./schema/podcast"
import { topicPosts } from "./schema/topicPosts"
import { uncheckedImages } from "./schema/uncheckedImages"

// one unchecked image
export type UncheckedImageRow = typeof uncheckedImages.$inferSelect

// what an unchecked image is for: its kind, and the id of its user, team, topic, podcast episode, or Topic Post
export type UncheckedImageSubject = { subjectKind: UncheckedImageSubjectKind; subjectId: string }

// an image to save as unchecked: its subject, who uploaded it, an avatar's stored object or any other image's content
// hash with a topic image's pixel size, and whether the image is already its subject's current one
export type SaveUncheckedImageOptions = UncheckedImageSubject & {
	uploaderUserId: string
	avatarKey?: string
	imageHash?: string
	width?: number
	height?: number
	isPublished?: boolean
}

/**
 * Takes the lock of a subject's unchecked image on the caller's transaction, which keeps it until the transaction
 * ends. A transaction that has the lock takes it again at once.
 */
export async function lockUncheckedImageSubject(
	transaction: DbHandle,
	{ subjectKind, subjectId }: UncheckedImageSubject,
): Promise<void> {
	await transaction.execute(
		sql`select pg_advisory_xact_lock(hashtext(${`unchecked-image:${subjectKind}:${subjectId}`}))`,
	)
}

// how a transaction takes a Topic's image visibility lock: shared by an upload that reads the Topic's visibility, and
// exclusive by the write that changes it
export type TopicImageVisibilityLockMode = "shared" | "exclusive"

/**
 * Takes a Topic's image visibility lock on the caller's transaction, which keeps it until the transaction ends. An
 * upload whose check could not run takes it shared before it reads the Topic's visibility, and a write of the Topic's
 * visibility takes it exclusive, so no such upload is published while the Topic turns invite or public.
 */
export async function lockTopicImageVisibility(
	transaction: DbHandle,
	topicId: string,
	lockMode: TopicImageVisibilityLockMode,
): Promise<void> {
	const lockKey = `unchecked-image-topic:${topicId}`
	await transaction.execute(
		lockMode === "shared"
			? sql`select pg_advisory_xact_lock_shared(hashtext(${lockKey}))`
			: sql`select pg_advisory_xact_lock(hashtext(${lockKey}))`,
	)
}

/**
 * Runs work in a transaction that has the lock of a subject's unchecked image, so an upload's publish or save as
 * unchecked, a drop, and the sweep's write for that subject run one at a time. Returns what the work returns.
 */
export function withUncheckedImageSubjectLock<Result>(
	uncheckedImageSubject: UncheckedImageSubject,
	runWork: (transaction: DbTransaction) => Promise<Result>,
): Promise<Result> {
	return runUncheckedImageSubjectTransaction(async (transaction) => {
		await lockUncheckedImageSubject(transaction, uncheckedImageSubject)
		return runWork(transaction)
	})
}

// ponytail: one transaction that takes a subject's lock runs at a time in a process. give the publish inside the work
// the lock's transaction if uploads queue here
const runOneSubjectTransaction = createConcurrencyLimiter(1)

/**
 * Runs work in a transaction that takes a subject's lock, one such transaction at a time in this process. A publish
 * inside the work writes on a second connection, so the transactions that wait for a subject's lock never take every
 * connection of the pool. Returns what the work returns.
 */
export function runUncheckedImageSubjectTransaction<Result>(
	runWork: (transaction: DbTransaction) => Promise<Result>,
): Promise<Result> {
	return runOneSubjectTransaction(() => db.transaction(runWork))
}

/**
 * Saves an image as unchecked for its subject on the caller's transaction, in place of any unchecked image the subject
 * had before. Returns the unchecked image it replaced, or null.
 */
export async function saveUncheckedImage(
	transaction: DbHandle,
	{
		subjectKind,
		subjectId,
		uploaderUserId,
		avatarKey,
		imageHash,
		width,
		height,
		isPublished = false,
	}: SaveUncheckedImageOptions,
): Promise<UncheckedImageRow | null> {
	// lock the subject, so the later of two uploads at once replaces the earlier one and returns it
	await lockUncheckedImageSubject(transaction, { subjectKind, subjectId })
	const replacedUncheckedImage = await loadUncheckedImage(transaction, { subjectKind, subjectId })

	// the new unchecked image starts its own wait, with no failed check and no report
	const uncheckedImageRow = {
		subjectKind,
		subjectId,
		uploaderUserId,
		avatarKey: avatarKey ?? null,
		imageHash: imageHash ?? null,
		width: width ?? null,
		height: height ?? null,
		isPublished,
		uploadedAt: new Date(),
		attemptCount: 0,
		reportedAt: null,
	}
	await transaction
		.insert(uncheckedImages)
		.values(uncheckedImageRow)
		.onConflictDoUpdate({ target: [uncheckedImages.subjectKind, uncheckedImages.subjectId], set: uncheckedImageRow })
	return replacedUncheckedImage
}

/**
 * Returns a subject's unchecked image, read on the caller's transaction, or null if the subject has none.
 */
export async function loadUncheckedImage(
	transaction: DbHandle,
	uncheckedImageSubject: UncheckedImageSubject,
): Promise<UncheckedImageRow | null> {
	const [uncheckedImage] = await transaction
		.select()
		.from(uncheckedImages)
		.where(toUncheckedImageSubjectFilter(uncheckedImageSubject))
	return uncheckedImage ?? null
}

/**
 * Returns a subject's unchecked image that is shown to the user who uploaded it alone, or null if the subject has none,
 * another user uploaded it, or it is already published.
 */
export async function loadUncheckedImageForUploader(
	uncheckedImageSubject: UncheckedImageSubject,
	userId: string,
): Promise<UncheckedImageRow | null> {
	const [uncheckedImage] = await db
		.select()
		.from(uncheckedImages)
		.where(and(toUncheckedImageSubjectFilter(uncheckedImageSubject), ...toShownToUploaderFilters(userId)))
	return uncheckedImage ?? null
}

/**
 * Returns the kind and the content hash of each of the given subjects' unchecked images, published or not, read on
 * the caller's transaction if there is one, all in one query.
 */
export function loadUncheckedImageHashes(
	handle: DbHandle,
	uncheckedImageSubjects: UncheckedImageSubject[],
): Promise<Pick<UncheckedImageRow, "subjectKind" | "imageHash">[]> {
	return handle
		.select({ subjectKind: uncheckedImages.subjectKind, imageHash: uncheckedImages.imageHash })
		.from(uncheckedImages)
		.where(or(...uncheckedImageSubjects.map(toUncheckedImageSubjectFilter)))
}

// the kinds of unchecked image to read under one subject id, and the user who uploaded them
export type LoadUncheckedImageHashesForUploaderOptions = {
	subjectKinds: UncheckedImageSubjectKind[]
	subjectId: string
	userId: string
}

/**
 * Returns the kind and the content hash of each unchecked image of the given kinds under one subject id that is shown
 * to the user who uploaded it alone, all in one query.
 */
export function loadUncheckedImageHashesForUploader({
	subjectKinds,
	subjectId,
	userId,
}: LoadUncheckedImageHashesForUploaderOptions): Promise<Pick<UncheckedImageRow, "subjectKind" | "imageHash">[]> {
	return db
		.select({ subjectKind: uncheckedImages.subjectKind, imageHash: uncheckedImages.imageHash })
		.from(uncheckedImages)
		.where(
			and(
				inArray(uncheckedImages.subjectKind, subjectKinds),
				eq(uncheckedImages.subjectId, subjectId),
				...toShownToUploaderFilters(userId),
			),
		)
}

// the filters that match an unchecked image shown to the user who uploaded it alone: that user uploaded it, and it is
// not published
function toShownToUploaderFilters(userId: string): SQL[] {
	return [eq(uncheckedImages.uploaderUserId, userId), eq(uncheckedImages.isPublished, false)]
}

/**
 * Deletes a subject's unchecked image on the caller's transaction. Returns the deleted unchecked image, or null if the
 * subject had none.
 */
export async function deleteUncheckedImage(
	transaction: DbHandle,
	uncheckedImageSubject: UncheckedImageSubject,
): Promise<UncheckedImageRow | null> {
	const [deletedUncheckedImage] = await transaction
		.delete(uncheckedImages)
		.where(toUncheckedImageSubjectFilter(uncheckedImageSubject))
		.returning()
	return deletedUncheckedImage ?? null
}

/**
 * Returns whether an unchecked image is still stored as it was read, on the caller's transaction. Its row is there with
 * the time it was uploaded, and a newer upload for the subject writes a new time to the row.
 */
export async function isUncheckedImageStillStored(
	transaction: DbHandle,
	uncheckedImage: UncheckedImageRow,
): Promise<boolean> {
	const [unchangedUncheckedImage] = await transaction
		.select({ id: uncheckedImages.id })
		.from(uncheckedImages)
		.where(toUnchangedUncheckedImageFilter(uncheckedImage))
	return unchangedUncheckedImage !== undefined
}

/**
 * Deletes an unchecked image on the caller's transaction by its id and the time it was uploaded, so an unchecked image
 * that a newer upload replaced stays. Returns the deleted unchecked image, or null if it is no longer the one that was
 * read.
 */
export async function deleteUncheckedImageById(
	transaction: DbHandle,
	uncheckedImage: UncheckedImageRow,
): Promise<UncheckedImageRow | null> {
	const [deletedUncheckedImage] = await transaction
		.delete(uncheckedImages)
		.where(toUnchangedUncheckedImageFilter(uncheckedImage))
		.returning()
	return deletedUncheckedImage ?? null
}

/**
 * Returns the published unchecked images under a Topic, read on the caller's transaction: the published images whose
 * check has not run, of the Topic, of its podcast episodes and their films, and of its Topic Posts.
 */
export function loadTopicPublishedUncheckedImages(
	transaction: DbHandle,
	topicId: string,
): Promise<UncheckedImageRow[]> {
	// the Topic's podcast episodes, which a film's image names too, and its Topic Posts
	const podcastEpisodeIds = transaction
		.select({ id: podcastEpisodes.id })
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.topicId, topicId))
	const topicPostIds = transaction.select({ id: topicPosts.id }).from(topicPosts).where(eq(topicPosts.topicId, topicId))

	// a published unchecked image of the Topic itself, or of one of those subjects
	const topicSubjectFilter = or(
		and(eq(uncheckedImages.subjectKind, "topicImage"), eq(uncheckedImages.subjectId, topicId)),
		and(
			inArray(uncheckedImages.subjectKind, ["podcastEpisodeImage", "topicPodcastEpisodeVideoImage"]),
			inArray(uncheckedImages.subjectId, podcastEpisodeIds),
		),
		and(eq(uncheckedImages.subjectKind, "topicPostImage"), inArray(uncheckedImages.subjectId, topicPostIds)),
	)
	return transaction
		.select()
		.from(uncheckedImages)
		.where(and(eq(uncheckedImages.isPublished, true), topicSubjectFilter))
		.orderBy(asc(uncheckedImages.id))
}

/**
 * Unpublishes a published unchecked image on the caller's transaction, so the image is shown to its uploader alone
 * until its check runs. An unchecked image that a newer upload replaced since it was read stays as it is.
 */
export async function saveUncheckedImageUnpublished(
	transaction: DbHandle,
	uncheckedImage: UncheckedImageRow,
): Promise<void> {
	await transaction
		.update(uncheckedImages)
		.set({ isPublished: false })
		.where(toUnchangedUncheckedImageFilter(uncheckedImage))
}

// the sweep's next page of unchecked images: how many to read, and the unchecked images this sweep already read
export type LoadUncheckedImagesToCheckOptions = { limit: number; readUncheckedImageIds: string[] }

/**
 * Returns the unchecked images to check next, the fewest failed checks first and then the earliest uploaded, leaving
 * out the unchecked images this sweep already read.
 */
export function loadUncheckedImagesToCheck({
	limit,
	readUncheckedImageIds,
}: LoadUncheckedImagesToCheckOptions): Promise<UncheckedImageRow[]> {
	return db
		.select()
		.from(uncheckedImages)
		.where(readUncheckedImageIds.length > 0 ? notInArray(uncheckedImages.id, readUncheckedImageIds) : undefined)
		.orderBy(asc(uncheckedImages.attemptCount), asc(uncheckedImages.uploadedAt), asc(uncheckedImages.id))
		.limit(limit)
}

/**
 * Counts one more check that could not run on an unchecked image, unless a newer upload replaced the unchecked image
 * since it was read.
 */
export async function countFailedUncheckedImageCheck(uncheckedImage: UncheckedImageRow): Promise<void> {
	await db
		.update(uncheckedImages)
		.set({ attemptCount: sql`${uncheckedImages.attemptCount} + 1` })
		.where(toUnchangedUncheckedImageFilter(uncheckedImage))
}

/**
 * Records that an image unchecked for over a day was reported, so no later sweep reports it again, unless a newer
 * upload replaced the unchecked image since it was read.
 */
export async function saveUncheckedImageReported(uncheckedImage: UncheckedImageRow): Promise<void> {
	await db
		.update(uncheckedImages)
		.set({ reportedAt: new Date() })
		.where(toUnchangedUncheckedImageFilter(uncheckedImage))
}

// the filter that matches a subject's one unchecked image
function toUncheckedImageSubjectFilter({ subjectKind, subjectId }: UncheckedImageSubject): ReturnType<typeof and> {
	return and(eq(uncheckedImages.subjectKind, subjectKind), eq(uncheckedImages.subjectId, subjectId))
}

// the filter that matches an unchecked image only if it is still stored as it was read: its row's id, and the time it
// was uploaded
function toUnchangedUncheckedImageFilter({ id, uploadedAt }: UncheckedImageRow): ReturnType<typeof and> {
	return and(eq(uncheckedImages.id, id), eq(uncheckedImages.uploadedAt, uploadedAt))
}
