// object storage through Bun's built-in S3 client the S3_* env values alone select: the uploads, the reads,
// the object keys, deleteStoredObject, and the pending object deletions

import { runWithConcurrency } from "@carlnotes/server/concurrency"
import { eq, sql } from "drizzle-orm"
import { type DbHandle, db } from "./index"
import { pendingObjectDeletions } from "./schema/storage"

// how many keys one insert records, and how many objects are deleted at once
const PENDING_OBJECT_DELETION_BATCH_SIZE = 500
const OBJECT_DELETE_CONCURRENCY = 10

// how long the sweep waits before it deletes an uploaded object with no row
const UPLOAD_GRACE_MS = 60 * 60 * 1000

// the keys to record on the caller's transaction, and when the sweep may first try them. the default is at once
export type RecordPendingObjectDeletionsOptions = { handle: DbHandle; objectKeys: string[]; nextTryAt?: Date }

// upload an attachment's bytes to object storage under the given key, tagged with its content type
export async function uploadAttachment(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
	await bucket().write(key, bytes, { type: contentType })
}

/**
 * Records object keys as pending deletions on the caller's transaction, in batches. A key already pending stays as
 * it is.
 */
export async function recordPendingObjectDeletions({
	handle,
	objectKeys,
	nextTryAt,
}: RecordPendingObjectDeletionsOptions): Promise<void> {
	for (let i = 0; i < objectKeys.length; i += PENDING_OBJECT_DELETION_BATCH_SIZE) {
		// insert one batch, keeping any key already pending
		const pendingObjectDeletionRows = objectKeys
			.slice(i, i + PENDING_OBJECT_DELETION_BATCH_SIZE)
			.map((objectKey) => ({ objectKey, nextTryAt }))
		await handle.insert(pendingObjectDeletions).values(pendingObjectDeletionRows).onConflictDoNothing()
	}
}

/**
 * Records an upload's key as a pending deletion that the sweep may first try after the upload grace period.
 */
export function recordPendingObjectDeletionBeforeUpload(objectKey: string): Promise<void> {
	return recordPendingObjectDeletions({
		handle: db,
		objectKeys: [objectKey],
		nextTryAt: new Date(Date.now() + UPLOAD_GRACE_MS),
	})
}

/**
 * Clears a key's pending deletion on the caller's transaction.
 */
export async function clearPendingObjectDeletion(objectKey: string, handle: DbHandle = db): Promise<void> {
	await handle.delete(pendingObjectDeletions).where(eq(pendingObjectDeletions.objectKey, objectKey))
}

/**
 * Returns the object keys among rows whose key may be null, such as a chat room attachment still uploading.
 */
export function toStoredObjectKeys(rows: { objectKey: string | null }[]): string[] {
	return rows.map((row) => row.objectKey).filter((objectKey): objectKey is string => objectKey !== null)
}

/**
 * Deletes a stored object and returns whether the bucket accepted the delete. An object already gone counts as
 * deleted. A success clears the key's pending row. A failure is logged and written to the pending row with the next
 * try time pushed back. A failed pending row write is logged, and nothing is thrown.
 */
export async function deleteStoredObject(objectKey: string): Promise<boolean> {
	// delete the object, keeping a failure for the pending row
	let deleteError: unknown = null
	try {
		await bucket().delete(objectKey)
	} catch (error) {
		console.error(`stored object delete failed for ${objectKey}`, error)
		deleteError = error
	}

	// write the outcome to the pending row, and log a failed write
	try {
		await savePendingObjectDeletionOutcome(objectKey, deleteError)
	} catch (error) {
		console.error(`pending object deletion write failed for ${objectKey}`, error)
	}
	return deleteError === null
}

/**
 * Deletes stored objects a few at a time.
 */
export async function deleteStoredObjects(objectKeys: string[]): Promise<void> {
	// delete the objects a few at a time
	await runWithConcurrency(objectKeys, OBJECT_DELETE_CONCURRENCY, deleteStoredObject)
}

// clear the pending row of a deleted object, or raise a pending key's attempt count, save the failure, and push the
// next try back by a doubling delay up to a day
async function savePendingObjectDeletionOutcome(objectKey: string, deleteError: unknown): Promise<void> {
	// clear the pending row of a deleted object
	if (deleteError === null) {
		await clearPendingObjectDeletion(objectKey)
		return
	}

	// save the failure and push back the next try
	const lastError = (deleteError instanceof Error ? deleteError.message : String(deleteError)).slice(0, 500)
	await db
		.update(pendingObjectDeletions)
		.set({
			attemptCount: sql`${pendingObjectDeletions.attemptCount} + 1`,
			lastError,
			nextTryAt: sql`now() + make_interval(mins => least(power(2, ${pendingObjectDeletions.attemptCount} + 1), 1440)::integer)`,
		})
		.where(eq(pendingObjectDeletions.objectKey, objectKey))
}

// how long a filename may run inside an object key, so a very long name cannot dominate the path
export const MAX_KEY_FILENAME_CHARS = 200

// the object key for an attachment, namespaced by topic and attachment id so keys never collide
export function toAttachmentKey(topicId: string, attachmentId: string, filename: string): string {
	// sanitize the untrusted filename into one safe key segment anything but letters, digits
	const safeFilename = filename
		.replace(/[^a-z0-9.]+/gi, "-")
		.slice(0, MAX_KEY_FILENAME_CHARS)
		.replace(/^\.*$/, "file")
	return `topics/${topicId}/attachments/${attachmentId}/${safeFilename}`
}

// whether a stored object exists
export async function attachmentExists(attachmentKey: string): Promise<boolean> {
	return bucket().exists(attachmentKey)
}

// read a stored attachment as a byte stream, so the whole file doesn't sit in memory
export function attachmentStream(attachmentKey: string): ReadableStream {
	return bucket().file(attachmentKey).stream()
}

// read one byte range of a stored attachment, with the end exclusive
export function attachmentRangeStream(attachmentKey: string, start: number, end: number): ReadableStream {
	return bucket().file(attachmentKey).slice(start, end).stream()
}

// read a stored attachment's raw bytes, for work that needs the whole file
export async function getAttachmentBytes(attachmentKey: string): Promise<Uint8Array> {
	return new Uint8Array(await bucket().file(attachmentKey).arrayBuffer())
}

// sanitize an untrusted filename into one safe key segment before it joins an object key
function toSafeFilename(filename: string): string {
	return filename
		.replace(/[^a-z0-9.]+/gi, "-")
		.slice(0, 200)
		.replace(/^\.*$/, "file")
}

// the object key for a chat attachment, namespaced by the user who sent it as well as by the topic.
export function toChatAttachmentKey(
	userId: string,
	topicId: string,
	chatAttachmentId: string,
	filename: string,
): string {
	return `topics/${topicId}/chat-attachments/${userId}/${chatAttachmentId}/${toSafeFilename(filename)}`
}

// the object key for a chat room's shared attachment, namespaced by the topic whose chat room holds it
export function toChatRoomAttachmentKey(topicId: string, roomAttachmentId: string, filename: string): string {
	return `topics/${topicId}/room-attachments/${roomAttachmentId}/${toSafeFilename(filename)}`
}

// the object key for a link preview's proxied image, namespaced by link preview id
export function toLinkPreviewImageKey(linkPreviewId: string): string {
	return `link-previews/${linkPreviewId}/image`
}

// the object key for a host's favicon, namespaced by host
export function toFaviconKey(host: string): string {
	return `favicons/${host}`
}

// the object key for a Resource's fetched content, namespaced by resource id, mirroring toAttachmentKey
export function toResourceContentKey(resourceId: string): string {
	return `resources/${resourceId}/content.md`
}

// upload a Resource's fetched Markdown to object storage, returning its key and byte size for the resource row
export async function uploadResourceContent(
	resourceId: string,
	markdown: string,
): Promise<{ contentKey: string; bytes: number }> {
	// write the Markdown under the resource's content key, then report the content key and size to store on the row
	const contentKey = toResourceContentKey(resourceId)
	const body = new TextEncoder().encode(markdown)
	await bucket().write(contentKey, body, { type: "text/markdown" })
	return { contentKey, bytes: body.byteLength }
}

// read a Resource's stored Markdown back to score a reused or revalidated Resource
export async function getResourceContent(contentKey: string): Promise<string> {
	return bucket().file(contentKey).text()
}

// how long a presigned podcast episode audio url works. the url only has to last until a download or a playback starts
export const PODCAST_EPISODE_AUDIO_URL_LIFETIME_SECONDS = 60 * 60

// the object key for a Podcast Episode's finished audio
export function toPodcastEpisodeAudioKey(podcastEpisodeId: string): string {
	return `episodes/${podcastEpisodeId}/audio.mp3`
}

// the object key for one chapter's audio, which exists only while its Podcast Episode is recording
export function toPodcastEpisodeChapterKey(podcastEpisodeId: string, position: number): string {
	return `episodes/${podcastEpisodeId}/chapters/${position}.wav`
}

// a podcast episode object's key, the local file, and the file's content type
type UploadPodcastEpisodeFileOptions = { key: string; filePath: string; contentType: string }

// upload a local file to object storage under a podcast episode key, streamed instead of read into memory
export async function uploadPodcastEpisodeFile({
	key,
	filePath,
	contentType,
}: UploadPodcastEpisodeFileOptions): Promise<void> {
	await bucket().write(key, Bun.file(filePath), { type: contentType })
}

// a podcast episode object's key, and the local file to write it to
type DownloadPodcastEpisodeFileOptions = { key: string; filePath: string }

// download a stored podcast episode object to a local file, streamed instead of read into memory
export async function downloadPodcastEpisodeFile({ key, filePath }: DownloadPodcastEpisodeFileOptions): Promise<void> {
	await Bun.write(filePath, bucket().file(key))
}

// a presigned url that reads a Podcast Episode's audio from object storage, with range requests
export function toPodcastEpisodeAudioUrl(audioKey: string): string {
	return bucket().file(audioKey).presign({ expiresIn: PODCAST_EPISODE_AUDIO_URL_LIFETIME_SECONDS, method: "GET" })
}

// build the S3 client from env, throwing if any value is unset
function bucket(): Bun.S3Client {
	// every S3_* value is required. a missing one fails loudly
	const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = Bun.env
	if (!S3_ENDPOINT || !S3_REGION || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
		throw new Error(
			"S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY must be set to store attachments",
		)
	}
	// the endpoint is a configuration, so the same code can target Cloudflare R2, MinIO, or AWS S3
	return new Bun.S3Client({
		endpoint: S3_ENDPOINT,
		region: S3_REGION,
		bucket: S3_BUCKET,
		accessKeyId: S3_ACCESS_KEY_ID,
		secretAccessKey: S3_SECRET_ACCESS_KEY,
	})
}
