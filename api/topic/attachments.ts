// the attachment actions behind the api routes. deleting and downloading, restricted to the topic owner
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { attachments, topics } from "../../db/schema"
import { deleteAttachment } from "../../worker"

/**
 * Delete an attachment row and best-effort delete its stored object, restricted to the topic owner.
 */
export async function deleteTopicAttachment(userId: string, attachmentId: string): Promise<boolean> {
	// load the attachment with its topic's owner in one join
	const [attachment] = await db
		.select({ id: attachments.id, objectKey: attachments.objectKey, ownerId: topics.ownerId })
		.from(attachments)
		.innerJoin(topics, eq(attachments.topicId, topics.id))
		.where(eq(attachments.id, attachmentId))
	if (!attachment || attachment.ownerId !== userId) {
		return false
	}

	// delete the row, then best-effort delete the stored object
	await db.delete(attachments).where(eq(attachments.id, attachment.id))
	await deleteAttachment(attachment.objectKey).catch(() => {})
	return true
}

/**
 * The attachment's storage details for a download, restricted to the topic owner.
 */
export async function loadDownloadableAttachment(
	userId: string,
	attachmentId: string,
): Promise<{ objectKey: string; filename: string; contentType: string } | null> {
	// load the attachment with its topic's owner in one join
	const [attachment] = await db
		.select({
			// the storage details for the response
			objectKey: attachments.objectKey,
			filename: attachments.filename,
			contentType: attachments.contentType,
			// the owner for the access check
			ownerId: topics.ownerId,
		})
		.from(attachments)
		.innerJoin(topics, eq(attachments.topicId, topics.id))
		.where(eq(attachments.id, attachmentId))

	// downloads are restricted to the topic owner
	if (!attachment || attachment.ownerId !== userId) {
		return null
	}
	return { objectKey: attachment.objectKey, filename: attachment.filename, contentType: attachment.contentType }
}
