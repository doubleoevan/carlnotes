// the attachment actions behind the api routes. deleting and downloading, and updating the generated context,
// which the topic:edit gate authorizes so an admin can edit attachments as well as a topic owner.
import { and, eq } from "drizzle-orm"
import { db } from "../../db"
import { attachments, topics } from "../../db/schema"
import { deleteAttachment } from "../../worker"
import { isAllowed } from "../authorization"

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
 * Replace an attachment's context
 */
export async function updateTopicAttachmentContext(
	userId: string,
	attachmentId: string,
	updatedContext: string,
): Promise<boolean> {
	// load the attachment's status with its topic's gate fields in one join
	const [attachment] = await db
		.select({
			id: attachments.id,
			status: attachments.status,
			// the topic fields the gate reads
			topicId: topics.id,
			ownerId: topics.ownerId,
			visibility: topics.visibility,
		})
		.from(attachments)
		.innerJoin(topics, eq(attachments.topicId, topics.id))
		.where(eq(attachments.id, attachmentId))

	// a missing, pending, or failed attachment has no context to update
	if (attachment?.status !== "ready") {
		return false
	}

	// check if this user can edit the attachment's topic
	const attachmentTopic = { id: attachment.topicId, ownerId: attachment.ownerId, visibility: attachment.visibility }
	if (!(await isAllowed(userId, "topic:edit", attachmentTopic))) {
		return false
	}

	// replace the attachment context, checking the ready status again so a concurrent failure cannot be overwritten
	const isContextUpdated = await db
		.update(attachments)
		.set({ context: updatedContext })
		.where(and(eq(attachments.id, attachment.id), eq(attachments.status, "ready")))
		.returning({ id: attachments.id })
	return isContextUpdated.length > 0
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
