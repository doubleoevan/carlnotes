// object storage for topic attachments through Bun's built-in S3 client the S3_* env values alone select

// upload an attachment's bytes to object storage under the given key, tagged with its content type
export async function uploadAttachment(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
	await bucket().write(key, bytes, { type: contentType })
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

// delete a stored object as a best-effort cleanup. a failure is logged instead of throwing an error
export async function deleteAttachment(attachmentKey: string): Promise<void> {
	try {
		await bucket().delete(attachmentKey)
	} catch (error) {
		console.error(`attachment delete failed for ${attachmentKey}`, error)
	}
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

// delete a Resource's stored content object. best-effort cleanup on a resource delete or a storage-write failure
export async function deleteResourceContent(contentKey: string): Promise<void> {
	await bucket().delete(contentKey)
}

// how long a presigned podcast episode audio url works. the url only has to last until a download or a playback starts
const PODCAST_EPISODE_AUDIO_URL_LIFETIME_SECONDS = 60 * 60

// the object key for a Podcast Episode's finished audio
export function toPodcastEpisodeAudioKey(podcastEpisodeId: string): string {
	return `episodes/${podcastEpisodeId}/audio.mp3`
}

// the object key for one chapter's audio, which exists only while its Podcast Episode renders
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
