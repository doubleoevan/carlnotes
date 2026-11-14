// the sweep's check of the unchecked images, avatars included. each unchecked image is checked again with no lock
// held, then published, deleted, or removed under its subject's lock, and only if it is still the unchecked image that
// was read

import { DAY_MS } from "@carlnotes/contracts/time"
import type { DbTransaction } from "@carlnotes/db"
import { deleteUncheckedAvatar, publishUncheckedAvatar, toAvatarContentType } from "@carlnotes/db/avatars"
import { attachmentExists, getAttachmentBytes } from "@carlnotes/db/store"
import { toTopicPodcastEpisodeVideoImageKey } from "@carlnotes/db/topicPodcastEpisodeVideoKeys"
import {
	countFailedUncheckedImageCheck,
	deleteUncheckedImageById,
	isUncheckedImageStillStored,
	loadUncheckedImagesToCheck,
	saveUncheckedImageReported,
	type UncheckedImageRow,
} from "@carlnotes/db/uncheckedImages"
import { classifyImage } from "@carlnotes/models/moderation"
import { toDataUrl } from "@carlnotes/server/dataUrl"
import { reportError } from "@carlnotes/server/monitoring"
import { startImageTopicPodcastEpisodeVideoRebuilds } from "./publishedUncheckedImages"
import { removeImageUpload } from "./topicImages/removedImageUploads"
import {
	toPodcastEpisodeImageOriginalKey,
	toTopicImageOriginalKey,
	toTopicPostImageOriginalKey,
} from "./topicImages/topicImageFiles"
import {
	deleteFilesAfterUncheckedImageSubjectLock,
	isUncheckedAvatarKind,
	loadUncheckedImageSubjectState,
	publishUploadedImage,
	recordUncheckedImageFileDeletions,
	type UncheckedImageHashSubject,
} from "./uncheckedImages"

// how many unchecked images one read returns, and how long one sweep's batch goes on checking them
const UNCHECKED_IMAGE_CHECK_PAGE_SIZE = 20
const UNCHECKED_IMAGE_CHECK_BATCH_MS = 2 * 60 * 1000

// how long an image may stay unchecked before it is reported once
const REPORT_UNCHECKED_IMAGE_AFTER_MS = DAY_MS

// what one sweep's check of the unchecked images did
export type UncheckedImageCheckSummary = { publishedCount: number; deletedCount: number; isCheckUnavailable: boolean }

// how one unchecked image's check ended: published or cleared as clean, deleted or removed, left as it is, or not
// checked because the image moderation could not run
type UncheckedImageCheckOutcome = "published" | "deleted" | "kept" | "unavailable"

// what a check found of an unchecked image: a clean image, a flagged or unreadable one, or nothing left to check,
// because its subject or its stored file is gone
type UncheckedImageCheckResult = "clean" | "rejected" | "gone"

// how an unchecked image that was acted on ended, by what its check found
const ACTED_UNCHECKED_IMAGE_OUTCOMES: Record<UncheckedImageCheckResult, UncheckedImageCheckOutcome> = {
	clean: "published",
	rejected: "deleted",
	gone: "deleted",
}

/**
 * Checks the unchecked images again for about two minutes, a page at a time, the fewest failed checks first and then
 * the earliest uploaded. An image that passes is published as an upload of its kind that passed is, and a flagged or
 * unreadable one is deleted, or removed if it is already published. An unchecked image whose subject is gone is
 * deleted. The batch stops at the first check that could not run, which raises that image's attempt count, and an image
 * unchecked for over a day is reported once.
 */
export async function checkUncheckedImages(now = new Date()): Promise<UncheckedImageCheckSummary> {
	const uncheckedImageCheckSummary: UncheckedImageCheckSummary = {
		publishedCount: 0,
		deletedCount: 0,
		isCheckUnavailable: false,
	}
	const batchEndsAtMs = Date.now() + UNCHECKED_IMAGE_CHECK_BATCH_MS
	const readUncheckedImageIds: string[] = []
	let uncheckedImagePage: UncheckedImageRow[] = []

	// check one unchecked image at a time until none is left, the batch's time is up, or a check could not run
	while (Date.now() < batchEndsAtMs) {
		// read the next page once every unchecked image of the page before is checked
		if (uncheckedImagePage.length === 0) {
			uncheckedImagePage = await loadUncheckedImagesToCheck({
				limit: UNCHECKED_IMAGE_CHECK_PAGE_SIZE,
				readUncheckedImageIds,
			})
			readUncheckedImageIds.push(...uncheckedImagePage.map((readUncheckedImage) => readUncheckedImage.id))
		}
		const uncheckedImage = uncheckedImagePage.shift()
		if (!uncheckedImage) {
			break
		}

		// report an image unchecked for over a day once, then check the image. a failure on one image is reported and
		// leaves the others
		await reportDayOldUncheckedImage(uncheckedImage, now)
		const uncheckedImageCheckOutcome = await checkUncheckedImage(uncheckedImage).catch((error: unknown) => {
			reportError(error, "unchecked-image", toUncheckedImageReportExtra(uncheckedImage))
			return "kept" as const
		})

		// a check that could not run costs one call a sweep, so the batch stops there
		if (uncheckedImageCheckOutcome === "unavailable") {
			await countFailedUncheckedImageCheck(uncheckedImage)
			uncheckedImageCheckSummary.isCheckUnavailable = true
			break
		}
		uncheckedImageCheckSummary.publishedCount += uncheckedImageCheckOutcome === "published" ? 1 : 0
		uncheckedImageCheckSummary.deletedCount += uncheckedImageCheckOutcome === "deleted" ? 1 : 0
	}

	// log a sweep that had something to do
	const { publishedCount, deletedCount, isCheckUnavailable } = uncheckedImageCheckSummary
	if (publishedCount > 0 || deletedCount > 0 || isCheckUnavailable) {
		console.log(
			`unchecked images: ${publishedCount} published, ${deletedCount} deleted${isCheckUnavailable ? ", and the image moderation could not run" : ""}`,
		)
	}
	return uncheckedImageCheckSummary
}

// check one unchecked image with no lock held, and act on what the check finds
async function checkUncheckedImage(uncheckedImage: UncheckedImageRow): Promise<UncheckedImageCheckOutcome> {
	// a subject that is gone, or a stored file that is, leaves nothing to check
	const subjectState = await loadUncheckedImageSubjectState(uncheckedImage)
	const checkedObjectKey = toCheckedObjectKey(uncheckedImage)
	if (!subjectState || !checkedObjectKey || !(await attachmentExists(checkedObjectKey))) {
		return actOnUncheckedImage(uncheckedImage, "gone")
	}

	// the image moderation, on the stored bytes
	const imageBytes = await getAttachmentBytes(checkedObjectKey)
	const contentType = uncheckedImage.avatarKey ? toAvatarContentType(uncheckedImage.avatarKey) : "image/jpeg"
	const classification = await classifyImage({ dataUrl: toDataUrl(contentType, imageBytes) })

	// a check that could not run leaves the image unchecked, and a check skipped with no key set keeps it too
	if (classification.outcome === "failed") {
		return "unavailable"
	}
	if (classification.outcome === "skipped") {
		return "kept"
	}

	// a flagged or unreadable image is rejected, and any other is clean
	const isRejected = classification.outcome === "unreadable" || classification.verdict.isViolation
	return actOnUncheckedImage(uncheckedImage, isRejected ? "rejected" : "clean")
}

// act on what a check found of an unchecked image. an unchecked image that a newer upload replaced, or a write
// dropped, while its check ran is kept as it is
async function actOnUncheckedImage(
	uncheckedImage: UncheckedImageRow,
	uncheckedImageCheckResult: UncheckedImageCheckResult,
): Promise<UncheckedImageCheckOutcome> {
	// an avatar's write takes its subject's lock itself, and returns false for an avatar that is no longer the one read
	const { subjectKind, subjectId } = uncheckedImage
	if (isUncheckedAvatarKind(subjectKind)) {
		const isUncheckedAvatarWritten =
			uncheckedImageCheckResult === "clean"
				? await publishUncheckedAvatar(uncheckedImage)
				: await deleteUncheckedAvatar(uncheckedImage)
		return isUncheckedAvatarWritten ? ACTED_UNCHECKED_IMAGE_OUTCOMES[uncheckedImageCheckResult] : "kept"
	}

	// any other image is acted on under its subject's lock, and the files recorded as pending are deleted once the
	// lock's transaction has committed
	const uncheckedImageSubject = { subjectKind, subjectId }
	const deletedObjectKeys = await deleteFilesAfterUncheckedImageSubjectLock(uncheckedImageSubject, (transaction) =>
		actOnLockedUncheckedImage(transaction, { uncheckedImage, uncheckedImageSubject, uncheckedImageCheckResult }),
	)
	if (!deletedObjectKeys) {
		return "kept"
	}

	// a published image that passed its check is drawn into the films that kept their image until then
	if (uncheckedImageCheckResult === "clean" && uncheckedImage.isPublished) {
		await startImageTopicPodcastEpisodeVideoRebuilds([uncheckedImageSubject])
	}
	return ACTED_UNCHECKED_IMAGE_OUTCOMES[uncheckedImageCheckResult]
}

// an unchecked image to act on under its subject's lock: the image as it was read, its subject, and what its check
// found
type ActOnLockedUncheckedImageOptions = {
	uncheckedImage: UncheckedImageRow
	uncheckedImageSubject: UncheckedImageHashSubject
	uncheckedImageCheckResult: UncheckedImageCheckResult
}

// act on what a check found of an unchecked image of a Topic, a Podcast Episode, a Topic Post, or a film, on the
// transaction that has its subject's lock. returns the stored objects to delete once the transaction has committed, or
// null for an unchecked image that is left as it is
async function actOnLockedUncheckedImage(
	transaction: DbTransaction,
	{ uncheckedImage, uncheckedImageSubject, uncheckedImageCheckResult }: ActOnLockedUncheckedImageOptions,
): Promise<string[] | null> {
	// an unchecked image that a newer upload replaced, or a write dropped, while its check ran is left as it is
	if (!(await isUncheckedImageStillStored(transaction, uncheckedImage))) {
		return null
	}

	// the subject as it is now. a subject that was deleted while its image was checked is left for the next sweep
	const subjectState = await loadUncheckedImageSubjectState(uncheckedImageSubject, transaction)
	if (!subjectState && uncheckedImageCheckResult !== "gone") {
		return null
	}

	// a published image is its subject's own. a flagged one that is still the subject's current image is removed before
	// its row is deleted, and no image is drawn in its place
	if (uncheckedImage.isPublished) {
		const { imageHash: publishedImageHash } = uncheckedImage
		const isCurrentImage = publishedImageHash === subjectState?.currentImageHash
		if (uncheckedImageCheckResult === "rejected" && isCurrentImage && publishedImageHash) {
			await removeImageUpload(uncheckedImageSubject, publishedImageHash)
		}

		// the unchecked image's row goes, and its files are its subject's
		await deleteUncheckedImageById(transaction, uncheckedImage)
		return []
	}

	// a clean image is published as an upload of its kind that passed is, a topic's image at its original's pixel size
	// and a film's image to its film. an unchecked image with no content hash has nothing to publish
	const { imageHash, width, height } = uncheckedImage
	if (uncheckedImageCheckResult === "clean" && subjectState && imageHash) {
		const { topicPodcastEpisodeVideoId } = subjectState
		const uploadedImageSize = { width: width ?? undefined, height: height ?? undefined }
		await publishUploadedImage({
			...uncheckedImageSubject,
			imageHash,
			...uploadedImageSize,
			topicPodcastEpisodeVideoId,
		})
	}

	// the unchecked image goes with its files, unless they are the files of the image the subject shows now
	const shownImageHash =
		uncheckedImageCheckResult === "clean" && subjectState
			? uncheckedImage.imageHash
			: (subjectState?.currentImageHash ?? null)
	await deleteUncheckedImageById(transaction, uncheckedImage)
	return recordUncheckedImageFileDeletions(transaction, { uncheckedImage, keptImageHash: shownImageHash })
}

// the stored object a check reads: an avatar's own, or any other image's original jpeg, or null for a row with neither
function toCheckedObjectKey({ subjectKind, subjectId, avatarKey, imageHash }: UncheckedImageRow): string | null {
	if (avatarKey) {
		return avatarKey
	}

	// an avatar has no content hash
	if (!imageHash || isUncheckedAvatarKind(subjectKind)) {
		return null
	}
	switch (subjectKind) {
		// a topic's and a podcast episode's original
		case "topicImage":
			return toTopicImageOriginalKey(subjectId, imageHash)
		case "podcastEpisodeImage":
			return toPodcastEpisodeImageOriginalKey(subjectId, imageHash)
		// a Topic Post's original, and a film image's jpeg at the film's size
		case "topicPostImage":
			return toTopicPostImageOriginalKey(subjectId, imageHash)
		case "topicPodcastEpisodeVideoImage":
			return toTopicPodcastEpisodeVideoImageKey(subjectId, imageHash)
	}
}

// report an image unchecked for over a day once, by its subject's kind and id and never the image
async function reportDayOldUncheckedImage(uncheckedImage: UncheckedImageRow, now: Date): Promise<void> {
	const isUncheckedImageDayOld = now.getTime() - uncheckedImage.uploadedAt.getTime() > REPORT_UNCHECKED_IMAGE_AFTER_MS
	if (!isUncheckedImageDayOld || uncheckedImage.reportedAt) {
		return
	}
	reportError(
		new Error("an image has been unchecked for over a day"),
		"unchecked-image",
		toUncheckedImageReportExtra(uncheckedImage),
	)
	await saveUncheckedImageReported(uncheckedImage)
}

// what names an unchecked image in a report: its subject's kind and id
function toUncheckedImageReportExtra({ subjectKind, subjectId }: UncheckedImageRow): Record<string, string> {
	return { uncheckedImageSubjectKind: subjectKind, uncheckedImageSubjectId: subjectId }
}
