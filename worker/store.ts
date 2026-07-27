// object storage for topic attachments through Bun's built-in S3 client
// the S3_* env values alone pick the target, whether R2, MinIO, or AWS S3

// upload an attachment's bytes to object storage under the given key, tagged with its content type
export async function putAttachment(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
	await bucket().write(key, bytes, { type: contentType })
}

// the object key for an attachment, namespaced by topic and attachment id so keys never collide
export function toAttachmentKey(topicId: string, attachmentId: string, filename: string): string {
	// sanitize the untrusted filename into one safe key segment
	// anything but letters, digits, and dots becomes a dash,
	// length caps at 200,
	// and an empty or all-dots name becomes "file"
	const safeFilename = filename
		.replace(/[^a-z0-9.]+/gi, "-")
		.slice(0, 200)
		.replace(/^\.*$/, "file")
	return `topics/${topicId}/attachments/${attachmentId}/${safeFilename}`
}

// delete a stored object. used as best-effort cleanup when ingestion fails after the upload
export async function deleteAttachment(attachmentKey: string): Promise<void> {
	await bucket().delete(attachmentKey)
}

// whether a stored object exists
export async function attachmentExists(attachmentKey: string): Promise<boolean> {
	return bucket().exists(attachmentKey)
}

// read a stored attachment as a byte stream, used by the owner-only download route
export function attachmentStream(attachmentKey: string): ReadableStream {
	return bucket().file(attachmentKey).stream()
}

// read a stored attachment's raw bytes, used by the processing workflow to extract its text
export async function getAttachmentBytes(attachmentKey: string): Promise<Uint8Array> {
	return new Uint8Array(await bucket().file(attachmentKey).arrayBuffer())
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

// build the S3 client from env, throwing if any value is unset so a misconfigured upload never writes to a wrong or default endpoint
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
