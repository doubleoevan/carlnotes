// the unchecked images at upload time: the unchecked image row an uploaded image of a Topic, a Podcast Episode, a Topic
// Post, or a film gets if its image moderation could not run, the files an unchecked image keeps, and the drop of an
// unchecked image once its subject's image is replaced or removed. the sweep's check of every unchecked image is in
// uncheckedImageChecks.ts

import type { UncheckedImageSubjectKind, Visibility } from "@carlnotes/contracts/enums"
import { type DbHandle, type DbTransaction, db } from "@carlnotes/db"
import { podcastEpisodes, topicPodcastEpisodeVideos } from "@carlnotes/db/schema/podcast"
import { teams } from "@carlnotes/db/schema/teams"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import {
	attachmentExists,
	clearPendingObjectDeletions,
	deletePendingStoredObjects,
	recordPendingObjectDeletions,
} from "@carlnotes/db/store"
import {
	deleteUncheckedImage,
	loadUncheckedImage,
	lockTopicImageVisibility,
	lockUncheckedImageSubject,
	runUncheckedImageSubjectTransaction,
	saveUncheckedImage,
	type UncheckedImageRow,
	type UncheckedImageSubject,
	withUncheckedImageSubjectLock,
} from "@carlnotes/db/uncheckedImages"
import { and, eq, ne } from "drizzle-orm"
import { replacePodcastEpisodeImage } from "./podcast/podcastEpisodeImageRenders"
import {
	toPodcastEpisodeImageObjectKeys,
	toTopicImageObjectKeys,
	toTopicPostImageObjectKeys,
} from "./topicImages/topicImageFiles"
import { replaceTopicImage } from "./topicImages/topicImageRenders"
import {
	publishTopicPodcastEpisodeVideoImage,
	toTopicPodcastEpisodeVideoImageObjectKeys,
} from "./topicPodcastEpisodeVideo/topicPodcastEpisodeVideoImage"
import { replaceTopicPostImage } from "./topicPosts/topicPostImageRenders"

// the two kinds of unchecked image that are an avatar, which is stored under its own key and no content hash
type UncheckedAvatarKind = "userAvatar" | "teamAvatar"

// the kinds of unchecked image stored under a content hash: every kind but the two avatars
export type UncheckedImageHashKind = Exclude<UncheckedImageSubjectKind, UncheckedAvatarKind>

/**
 * Returns whether an unchecked image's kind is a user's or a team's avatar.
 */
export function isUncheckedAvatarKind(subjectKind: UncheckedImageSubjectKind): subjectKind is UncheckedAvatarKind {
	return subjectKind === "userAvatar" || subjectKind === "teamAvatar"
}

// what an unchecked image stored under a content hash is for: its kind, and the id of its topic, podcast episode, or
// Topic Post. a film's image names its podcast episode
export type UncheckedImageHashSubject = { subjectKind: UncheckedImageHashKind; subjectId: string }

// how a stored upload ended: published as its subject's current image, or saved as unchecked for its uploader alone
export type UploadedImageOutcome = "published" | "unchecked"

// a stored upload to make its subject's current image: what it is for, its content hash, the pixel size of a topic
// image's original, and a film image's film
export type PublishUploadedImageOptions = UncheckedImageHashSubject & {
	imageHash: string
	width?: number
	height?: number
	topicPodcastEpisodeVideoId?: string
}

/**
 * Makes a stored upload its subject's current image, as an upload of its kind that passed its check is. A film's image
 * also starts the rebuild of its intro and sign-off, and a film's image with no film named publishes nothing.
 */
export async function publishUploadedImage({
	subjectKind,
	subjectId,
	imageHash,
	width,
	height,
	topicPodcastEpisodeVideoId,
}: PublishUploadedImageOptions): Promise<void> {
	// an upload has no render, no image prompt, and no cost
	const uploadedImageRow = { renderId: null, origin: "uploaded", imagePrompt: null, costDollars: 0 } as const
	switch (subjectKind) {
		// a topic's image becomes its current one at its original's pixel size
		case "topicImage": {
			const topicImageSize = { width: width ?? 0, height: height ?? 0 }
			const topicImageRow = { ...uploadedImageRow, hash: imageHash, ...topicImageSize, scene: null, model: null }
			return replaceTopicImage({ topicId: subjectId, ...topicImageRow })
		}
		// a podcast episode's and a Topic Post's image become their current ones
		case "podcastEpisodeImage":
			return replacePodcastEpisodeImage({ podcastEpisodeId: subjectId, ...uploadedImageRow, hash: imageHash })
		case "topicPostImage":
			return replaceTopicPostImage({ topicPostId: subjectId, ...uploadedImageRow, hash: imageHash })
		// a film's image also starts the rebuild of its intro and sign-off
		case "topicPodcastEpisodeVideoImage": {
			if (!topicPodcastEpisodeVideoId) {
				return
			}

			// the film, its podcast episode, and the image's hash
			const filmImageRow = { topicPodcastEpisodeVideoId, podcastEpisodeId: subjectId, imageHash }
			return publishTopicPodcastEpisodeVideoImage({ ...filmImageRow, ...uploadedImageRow })
		}
	}
}

// a stored upload to publish or save as unchecked: the upload to publish, who uploaded it, and whether its image
// moderation could not run
export type PublishOrSaveUncheckedImageOptions = PublishUploadedImageOptions & {
	uploaderUserId: string
	isUnchecked: boolean
}

/**
 * Makes a stored upload its subject's current image, or shows it to its uploader alone if its image moderation could
 * not run on an invite or public Topic. A private Topic's unchecked upload is published at once and recorded for the
 * sweep to check again. Returns how the upload ended.
 */
export async function publishOrSaveUncheckedImage({
	isUnchecked,
	...uploadedImage
}: PublishOrSaveUncheckedImageOptions): Promise<UploadedImageOutcome> {
	// the Topic whose visibility an unchecked upload reads
	const { subjectKind, subjectId, imageHash } = uploadedImage
	const uncheckedImageSubject = { subjectKind, subjectId }
	const topicId = isUnchecked ? (await loadUncheckedImageSubjectState(uncheckedImageSubject))?.topicId : null

	// publish or save as unchecked under the subject's lock, so no other upload, drop, or check of the subject runs
	// meanwhile
	const { uploadedImageOutcome, deletedObjectKeys } = await runUncheckedImageSubjectTransaction(
		async (transaction): Promise<UploadedImageResult> => {
			// an unchecked upload takes its Topic's image visibility lock first. a write that makes the Topic invite or
			// public waits for the upload, and the upload waits for that write
			if (topicId) {
				await lockTopicImageVisibility(transaction, topicId, "shared")
			}
			await lockUncheckedImageSubject(transaction, uncheckedImageSubject)

			// the upload's files are no longer pending deletion, and an upload whose files are gone fails
			await keepUploadedImageFiles(transaction, { ...uncheckedImageSubject, imageHash })

			// an upload whose check could not run is saved as unchecked, or published and recorded
			if (isUnchecked) {
				return publishOrSaveFailedCheckUpload(transaction, uploadedImage)
			}

			// an upload that passed its check is published in place of the subject's unchecked image
			await publishUploadedImage(uploadedImage)
			const droppedObjectKeys = await deleteSubjectUncheckedImage(transaction, {
				uncheckedImageSubject,
				keptImageHash: imageHash,
			})
			return { uploadedImageOutcome: "published", deletedObjectKeys: droppedObjectKeys }
		},
	)

	// delete the files recorded as pending, now that the lock's transaction has committed
	await deleteUncheckedImageFiles(uncheckedImageSubject, deletedObjectKeys)
	return uploadedImageOutcome
}

/**
 * Drops a subject's unchecked image, published or not, once the subject's image is replaced or removed. Its files are
 * deleted unless they are published or are the files of the image published in its place.
 */
export async function dropUncheckedImage(
	uncheckedImageSubject: UncheckedImageHashSubject,
	publishedImageHash: string | null,
): Promise<void> {
	await deleteFilesAfterUncheckedImageSubjectLock(uncheckedImageSubject, (transaction) =>
		deleteSubjectUncheckedImage(transaction, { uncheckedImageSubject, keptImageHash: publishedImageHash }),
	)
}

/**
 * Drops a subject's unchecked image that is shown to its uploader alone, with its files, once an editor draws the
 * subject's image again. A published unchecked image stays as the record that the subject's current image was
 * never checked.
 */
export async function dropUnpublishedUncheckedImage(uncheckedImageSubject: UncheckedImageHashSubject): Promise<void> {
	// read the subject's unchecked image under its lock, and delete an unpublished one
	await deleteFilesAfterUncheckedImageSubjectLock(uncheckedImageSubject, async (transaction) => {
		const uncheckedImage = await loadUncheckedImage(transaction, uncheckedImageSubject)
		return uncheckedImage && !uncheckedImage.isPublished
			? deleteSubjectUncheckedImage(transaction, { uncheckedImageSubject, keptImageHash: null })
			: []
	})
}

/**
 * Runs work in a transaction that has the lock of a subject's unchecked image, then deletes the stored objects the
 * work returns, once that transaction has committed. The delete takes the subject's lock again and skips a file that
 * an upload of the same bytes saved meanwhile. Returns what the work returns, and deletes nothing for null.
 */
export async function deleteFilesAfterUncheckedImageSubjectLock<ObjectKeys extends string[] | null>(
	uncheckedImageSubject: UncheckedImageHashSubject,
	recordFileDeletions: (transaction: DbTransaction) => Promise<ObjectKeys>,
): Promise<ObjectKeys> {
	const deletedObjectKeys = await withUncheckedImageSubjectLock(uncheckedImageSubject, recordFileDeletions)
	if (deletedObjectKeys) {
		await deleteUncheckedImageFiles(uncheckedImageSubject, deletedObjectKeys)
	}
	return deletedObjectKeys
}

// delete the files that are still pending deletion, under their subject's lock. an upload of the same bytes clears its
// files' pending deletions under that lock, so the files it saved stay
async function deleteUncheckedImageFiles(
	uncheckedImageSubject: UncheckedImageHashSubject,
	objectKeys: string[],
): Promise<void> {
	if (objectKeys.length > 0) {
		await withUncheckedImageSubjectLock(uncheckedImageSubject, (transaction) =>
			deletePendingStoredObjects(objectKeys, transaction),
		)
	}
}

// clear the pending deletions of an upload's files on the transaction that has its subject's lock. files that were
// pending may be deleted already, so an upload whose first file is gone throws an error
async function keepUploadedImageFiles(
	transaction: DbHandle,
	uploadedImage: UncheckedImageHashSubject & { imageHash: string },
): Promise<void> {
	// no file of the upload was pending deletion
	const uploadedObjectKeys = toUncheckedImageObjectKeys(uploadedImage)
	const pendingKeyCount = await clearPendingObjectDeletions(uploadedObjectKeys, transaction)
	const [firstObjectKey] = uploadedObjectKeys
	if (pendingKeyCount === 0 || !firstObjectKey) {
		return
	}

	// a delete removes the first file before the others, so the files are all stored if the first one is
	if (!(await attachmentExists(firstObjectKey))) {
		throw new Error("an uploaded image's files were deleted before the image was saved")
	}
}

// what a check or an upload needs to know of an image's subject: the hash of its current image, its Topic and that
// Topic's visibility, both null for an avatar and for a podcast episode whose Topic is gone, and its film's id for a
// film
export type UncheckedImageSubjectState = {
	currentImageHash: string | null
	topicId: string | null
	topicVisibility: Visibility | null
	topicPodcastEpisodeVideoId?: string
}

/**
 * Returns what a check or an upload needs to know of an image's subject, read on the caller's transaction if there is
 * one, or null for a subject that is gone.
 */
export async function loadUncheckedImageSubjectState(
	{ subjectKind, subjectId }: UncheckedImageSubject,
	handle: DbHandle = db,
): Promise<UncheckedImageSubjectState | null> {
	switch (subjectKind) {
		// an avatar's subject is its user or its team, which has no image hash and no Topic
		case "userAvatar": {
			const [user] = await handle.select({ id: users.id }).from(users).where(eq(users.id, subjectId))
			return user ? { currentImageHash: null, topicId: null, topicVisibility: null } : null
		}
		case "teamAvatar": {
			const [team] = await handle.select({ id: teams.id }).from(teams).where(eq(teams.id, subjectId))
			return team ? { currentImageHash: null, topicId: null, topicVisibility: null } : null
		}
		// a topic names its current image by its hash
		case "topicImage": {
			const [topic] = await handle
				.select({ currentImageHash: topics.imageHash, topicId: topics.id, topicVisibility: topics.visibility })
				.from(topics)
				.where(eq(topics.id, subjectId))
			return topic ?? null
		}
		// a Topic Post names its current image the same way, under its Topic's visibility
		case "topicPostImage": {
			const [topicPost] = await handle
				.select({ currentImageHash: topicPosts.imageHash, topicId: topics.id, topicVisibility: topics.visibility })
				.from(topicPosts)
				.innerJoin(topics, eq(topics.id, topicPosts.topicId))
				.where(eq(topicPosts.id, subjectId))
			return topicPost ?? null
		}
		// a removed podcast episode is gone
		case "podcastEpisodeImage": {
			const [podcastEpisode] = await handle
				.select({
					currentImageHash: podcastEpisodes.imageHash,
					topicId: topics.id,
					topicVisibility: topics.visibility,
				})
				.from(podcastEpisodes)
				.leftJoin(topics, eq(topics.id, podcastEpisodes.topicId))
				.where(and(eq(podcastEpisodes.id, subjectId), ne(podcastEpisodes.status, "removed")))
			return podcastEpisode ?? null
		}
		// a film is read by its podcast episode, and is gone with a removed one
		case "topicPodcastEpisodeVideoImage": {
			const [topicPodcastEpisodeVideo] = await handle
				.select({
					currentImageHash: topicPodcastEpisodeVideos.imageHash,
					topicId: topics.id,
					topicVisibility: topics.visibility,
					topicPodcastEpisodeVideoId: topicPodcastEpisodeVideos.id,
				})
				.from(topicPodcastEpisodeVideos)
				.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, topicPodcastEpisodeVideos.podcastEpisodeId))
				.leftJoin(topics, eq(topics.id, podcastEpisodes.topicId))
				.where(and(eq(topicPodcastEpisodeVideos.podcastEpisodeId, subjectId), ne(podcastEpisodes.status, "removed")))

			// a podcast episode with no film has no film image
			return topicPodcastEpisodeVideo ?? null
		}
	}
}

// the unchecked image whose files go, or null for none, and the hash of the image whose files stay
export type RecordUncheckedImageFileDeletionsOptions = {
	uncheckedImage: UncheckedImageRow | null
	keptImageHash: string | null
}

/**
 * Records an unchecked image's files as pending deletions on the caller's transaction, and returns their keys to delete
 * once the transaction has committed. A published unchecked image's files are its subject's, and the files of the image
 * that stays are kept, so either records nothing.
 */
export async function recordUncheckedImageFileDeletions(
	transaction: DbHandle,
	{ uncheckedImage, keptImageHash }: RecordUncheckedImageFileDeletionsOptions,
): Promise<string[]> {
	if (!uncheckedImage?.imageHash || uncheckedImage.isPublished || uncheckedImage.imageHash === keptImageHash) {
		return []
	}

	// record every file of the unchecked image as a pending deletion
	const uncheckedImageObjectKeys = toUncheckedImageObjectKeys(uncheckedImage)
	await recordPendingObjectDeletions({ handle: transaction, objectKeys: uncheckedImageObjectKeys })
	return uncheckedImageObjectKeys
}

// how an upload's publish or save as unchecked ended, and the stored objects to delete once the lock's transaction has
// committed
type UploadedImageResult = { uploadedImageOutcome: UploadedImageOutcome; deletedObjectKeys: string[] }

// publish or save as unchecked an upload whose image moderation could not run, on the transaction that has its
// subject's lock
async function publishOrSaveFailedCheckUpload(
	transaction: DbHandle,
	uploadedImage: Omit<PublishOrSaveUncheckedImageOptions, "isUnchecked">,
): Promise<UploadedImageResult> {
	// the subject's current image and its Topic's visibility, and the subject's unchecked image
	const { subjectKind, subjectId, imageHash } = uploadedImage
	const uncheckedImageSubject = { subjectKind, subjectId }
	const subjectState = await loadUncheckedImageSubjectState(uncheckedImageSubject, transaction)
	const uncheckedImage = await loadUncheckedImage(transaction, uncheckedImageSubject)

	// bytes that are already the subject's current image are published again, in place of an unpublished unchecked image
	if (subjectState?.currentImageHash === imageHash) {
		await publishUploadedImage(uploadedImage)
		const droppedObjectKeys =
			uncheckedImage && !uncheckedImage.isPublished
				? await deleteSubjectUncheckedImage(transaction, { uncheckedImageSubject, keptImageHash: imageHash })
				: []
		return { uploadedImageOutcome: "published", deletedObjectKeys: droppedObjectKeys }
	}

	// save the upload as unchecked first, so an unchecked image is never published with no record of it. a private
	// Topic's upload is then published at once, and any other is shown to its uploader alone
	const isPrivate = subjectState?.topicVisibility === "private"
	const replacedUncheckedImage = await saveUncheckedImage(transaction, {
		...uploadedImage,
		isPublished: isPrivate,
	})
	if (isPrivate) {
		await publishUploadedImage(uploadedImage)
	}

	// the upload replaced the subject's earlier unchecked image, whose files go unless they are published or are this
	// upload's own
	const replacedObjectKeys = await recordUncheckedImageFileDeletions(transaction, {
		uncheckedImage: replacedUncheckedImage,
		keptImageHash: imageHash,
	})
	return { uploadedImageOutcome: isPrivate ? "published" : "unchecked", deletedObjectKeys: replacedObjectKeys }
}

// the subject whose unchecked image goes, and the hash of the image whose files stay
type DeleteSubjectUncheckedImageOptions = {
	uncheckedImageSubject: UncheckedImageHashSubject
	keptImageHash: string | null
}

// delete a subject's unchecked image on the caller's transaction, and record its files as pending deletions. returns
// the stored objects to delete once the transaction has committed
async function deleteSubjectUncheckedImage(
	transaction: DbHandle,
	{ uncheckedImageSubject, keptImageHash }: DeleteSubjectUncheckedImageOptions,
): Promise<string[]> {
	const deletedUncheckedImage = await deleteUncheckedImage(transaction, uncheckedImageSubject)
	return recordUncheckedImageFileDeletions(transaction, { uncheckedImage: deletedUncheckedImage, keptImageHash })
}

// every stored object of an image stored under a content hash
function toUncheckedImageObjectKeys({
	subjectKind,
	subjectId,
	imageHash,
}: Pick<UncheckedImageRow, "subjectKind" | "subjectId" | "imageHash">): string[] {
	// an avatar has no content hash
	if (!imageHash || isUncheckedAvatarKind(subjectKind)) {
		return []
	}
	switch (subjectKind) {
		// the original and the six derived files of a topic's and a podcast episode's image
		case "topicImage":
			return toTopicImageObjectKeys(subjectId, imageHash)
		case "podcastEpisodeImage":
			return toPodcastEpisodeImageObjectKeys(subjectId, imageHash)
		// the same files of a Topic Post's image, and a film image's two jpegs
		case "topicPostImage":
			return toTopicPostImageObjectKeys(subjectId, imageHash)
		case "topicPodcastEpisodeVideoImage":
			return toTopicPodcastEpisodeVideoImageObjectKeys(subjectId, imageHash)
	}
}
