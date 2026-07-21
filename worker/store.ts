// object storage for topic attachments through Bun's built-in S3 client
// the S3_* env values alone pick the target, whether R2, MinIO, or AWS S3

// upload an attachment's bytes to object storage under the given key, tagged with its content type
export async function putAttachment(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
	await bucket().write(key, bytes, { type: contentType })
}

// the object key for an attachment, namespaced by topic and attachment id so keys never collide
export function attachmentKey(topicId: string, attachmentId: string, filename: string): string {
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
