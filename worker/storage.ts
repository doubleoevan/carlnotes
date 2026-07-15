// the object-storage seam: a Bun-native S3 client for topic attachments, pointed at R2/MinIO/S3 by the S3_* env alone

// upload an attachment's bytes to object storage under the given key, tagged with its content type
export async function putAttachment(key: string, bytes: Uint8Array, contentType: string): Promise<void> {
	// write to the configured bucket; the client is built per call so a missing config fails the upload, not the process
	await bucket().write(key, bytes, { type: contentType })
}

// the object key for an attachment: namespaced by topic and attachment id so keys never collide
export function attachmentKey(topicId: string, attachmentId: string, filename: string): string {
	return `topics/${topicId}/attachments/${attachmentId}/${filename}`
}

// delete a stored object; best-effort cleanup of an orphan when ingestion fails after the upload
export async function deleteAttachment(key: string): Promise<void> {
	await bucket().delete(key)
}

// build the S3 client from env, throwing if any value is unset so a misconfigured upload never writes to a wrong/default endpoint
function bucket(): Bun.S3Client {
	// every S3_* value is required — a missing one must fail loudly, mirroring the LLM seam's fail-fast
	const { S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY } = Bun.env
	if (!S3_ENDPOINT || !S3_REGION || !S3_BUCKET || !S3_ACCESS_KEY_ID || !S3_SECRET_ACCESS_KEY) {
		throw new Error(
			"S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY must be set to store attachments",
		)
	}
	// endpoint is configuration, so the same code targets Cloudflare R2, MinIO, or AWS S3
	return new Bun.S3Client({
		endpoint: S3_ENDPOINT,
		region: S3_REGION,
		bucket: S3_BUCKET,
		accessKeyId: S3_ACCESS_KEY_ID,
		secretAccessKey: S3_SECRET_ACCESS_KEY,
	})
}
