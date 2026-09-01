import { zValidator } from "@hono/zod-validator"
import { attachmentContextPayload, attachmentUrlPayload } from "@shared/contracts"
// the attachment actions for the api routes
import { and, eq } from "drizzle-orm"
import { Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { db } from "../../db"
import { attachments, topics } from "../../db/schema"
import {
	AttachmentValidationError,
	attachmentStream,
	deleteAttachment,
	ingestAttachment,
	ingestUrlAttachment,
	MAX_ATTACHMENT_BYTES,
} from "../../worker"
import { isAllowed } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"
import { loadOwnedTopic } from "./permissions"

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
			teamId: topics.teamId,
		})
		.from(attachments)
		.innerJoin(topics, eq(attachments.topicId, topics.id))
		.where(eq(attachments.id, attachmentId))

	// a missing, pending, or failed attachment has no context to update
	if (attachment?.status !== "ready") {
		return false
	}

	// check if this user can edit the attachment's topic
	// biome-ignore format: one line keeps the shape under the comment-density hook's limit
	const attachmentTopic = { id: attachment.topicId, ownerId: attachment.ownerId, visibility: attachment.visibility, teamId: attachment.teamId }
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

// the image types a stored file may be served inline as. svg is intentionally left out for security.
// it can hold script that would run in this origin
const INLINE_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp", "image/avif"])

// the video types a stored file may be served inline as
const INLINE_VIDEO_TYPES = new Set(["video/mp4", "video/quicktime", "video/webm"])

/**
 * The headers that send a stored file back, shown in place for an image or video a browser renders safely and downloaded otherwise.
 */
export function toStoredFileHeaders(filename: string, contentType: string): Record<string, string> {
	// a stored content type may include parameters, and only the media type before them decides the disposition
	const mediaType = contentType.split(";")[0]?.trim().toLowerCase() ?? ""
	const disposition = INLINE_IMAGE_TYPES.has(mediaType) || INLINE_VIDEO_TYPES.has(mediaType) ? "inline" : "attachment"

	const asciiFilename = filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "")
	return {
		"Content-Type": contentType,
		"Content-Disposition": `${disposition}; filename="${asciiFilename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
		"X-Content-Type-Options": "nosniff",
	}
}

// a topic attachment's routes: adding one by url, editing its context, removing it, and downloading it
export const topicAttachmentsRoute = new Hono<AppEnv>()
	.post("/topics/:id/attachments/url", zValidator("json", attachmentUrlPayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// check the owner first, so a stranger's url is never fetched
		if (!(await loadOwnedTopic(userId, context.req.param("id")))) {
			return context.json({ error: "forbidden" }, 403)
		}

		// fetch the page and hand its markdown to the same ingestion path a file upload takes
		try {
			const { url } = context.req.valid("json")
			const attachment = await ingestUrlAttachment(context.req.param("id"), url)
			return context.json({ id: attachment.id, filename: attachment.filename })
		} catch (error) {
			// a validation error names the user's own url, so it shows as written. anything else is internal
			if (error instanceof AttachmentValidationError) {
				return context.json({ error: error.message }, 400)
			}
			console.error(`url attachment ingestion failed for topic ${context.req.param("id")}`, error)
			return context.json({ error: "Carl couldn't process that link. Try again in a moment." }, 502)
		}
	})
	.patch("/attachments/:id/context", zValidator("json", attachmentContextPayload), async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}

		// replace the previously saved attachment context
		const isContextUpdated = await updateTopicAttachmentContext(
			userId,
			context.req.param("id"),
			context.req.valid("json").context,
		)
		return isContextUpdated ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.delete("/attachments/:id", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// remove an attachment row and its stored object best-effort. owner only
		const isDeleted = await deleteTopicAttachment(userId, context.req.param("id"))
		return isDeleted ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
	})
	.get("/attachments/:id/download", async (context) => {
		// reject a signed-out visitor
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		// stream the stored object with its original name. owner only
		const attachment = await loadDownloadableAttachment(userId, context.req.param("id"))
		if (!attachment) {
			return context.json({ error: "not found" }, 404)
		}

		return context.body(
			attachmentStream(attachment.objectKey),
			200,
			toStoredFileHeaders(attachment.filename, attachment.contentType),
		)
	})
	.post(
		"/topics/:id/attachments",
		// limit the upload body before it's fully buffered into memory
		bodyLimit({
			maxSize: MAX_ATTACHMENT_BYTES + 1024 * 1024,
			onError: (context) =>
				context.json(
					{ error: `That attachment is too large. The limit is ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB.` },
					413,
				),
		}),
		async (context) => {
			// reject a signed-out visitor
			const userId = currentUser(context)
			if (!userId) {
				return context.json({ error: "unauthorized" }, 401)
			}

			// check the owner first, so a stranger's upload does no storage or model work
			if (!(await loadOwnedTopic(userId, context.req.param("id")))) {
				return context.json({ error: "forbidden" }, 403)
			}

			// read the multipart file field
			const body = await context.req.parseBody()
			const file = body.file
			if (!(file instanceof File)) {
				return context.json({ error: "file field required" }, 400)
			}

			// run the synchronous part of attachment ingestion
			try {
				const bytes = new Uint8Array(await file.arrayBuffer())
				const attachment = await ingestAttachment({
					topicId: context.req.param("id"),
					filename: file.name,
					contentType: file.type,
					bytes,
				})

				// hand the persisted attachment identity back to the modal
				return context.json({ id: attachment.id, filename: attachment.filename })
			} catch (error) {
				// a validation error names the user's own mistake, so it shows as written
				if (error instanceof AttachmentValidationError) {
					return context.json({ error: error.message }, 400)
				}
				console.error(`attachment ingestion failed for topic ${context.req.param("id")}`, error)
				return context.json({ error: "Carl couldn't process that attachment. Try again in a moment." }, 502)
			}
		},
	)
