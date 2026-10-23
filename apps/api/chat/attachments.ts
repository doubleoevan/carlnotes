// storing and deleting the attachments a user sends with a chat turn, different from the topic attachments that an
// owner uploads, with their routes
import { CHAT_ATTACHMENT_KEEP_LIMIT } from "@carlnotes/contracts/chat"
import type { ChatAttachment } from "@carlnotes/contracts/payloads"
import { db } from "@carlnotes/db"
import { chatAttachments } from "@carlnotes/db/schema/chat"
import {
	attachmentStream,
	clearPendingObjectDeletion,
	deleteStoredObject,
	deleteStoredObjects,
	recordPendingObjectDeletionBeforeUpload,
	recordPendingObjectDeletions,
	toChatAttachmentKey,
	toStoredObjectKeys,
	uploadAttachment,
} from "@carlnotes/db/store"
import { generateAttachmentContext } from "@carlnotes/pipeline/attach"
import { toCanonicalContentType } from "@carlnotes/pipeline/attachContentType"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq, inArray } from "drizzle-orm"
import { Hono } from "hono"
import { type AppEnv, currentUser } from "../currentUser"
import { toStoredFileHeaders } from "../topic/attachments"
import { loadDownloadableChatAttachment, streamVideoAttachment, toKeptAttachmentContext } from "./chatAttachmentReads"
import {
	contentTypeFromDataUrl,
	decodeDataUrl,
	type StorableChatAttachment,
	screenAttachmentText,
} from "./chatAttachmentScreening"
import { toChatRejection } from "./chatTurnAuthorization"
import { encryptChatText } from "./encryption"

/**
 * Store the topic chat attachments that went with the chat turn that just finished.
 * A failure is logged instead of being surfaced.
 */
export async function storeTopicChatAttachments(
	userId: string,
	topicId: string,
	chatTurnId: string | null,
	attachments: StorableChatAttachment[],
	litellmApiKey?: string,
): Promise<void> {
	// most chat turns dont sent an attachment
	if (attachments.length === 0) {
		return
	}

	// calculate how many attachment slots are left under the limit, which only kept attachments take
	const keptAttachments = await db
		.select({ id: chatAttachments.id })
		.from(chatAttachments)
		.where(
			and(eq(chatAttachments.userId, userId), eq(chatAttachments.topicId, topicId), eq(chatAttachments.isKept, true)),
		)
	let remainingAttachmentSlots = CHAT_ATTACHMENT_KEEP_LIMIT - keptAttachments.length

	for (const attachment of attachments) {
		// a kept attachment past the limit does not get stored
		const isAttachmentKept = attachment.keep && remainingAttachmentSlots > 0

		// one failed attachment never stops the rest
		try {
			// only a kept attachment that actually stored uses up a limit slot
			if (
				(await storeTopicChatAttachment(userId, topicId, chatTurnId, attachment, isAttachmentKept, litellmApiKey)) &&
				isAttachmentKept
			) {
				remainingAttachmentSlots -= 1
			}
		} catch (error) {
			// a failed store never surfaces to the user, so the log and the report are the only record of it
			console.error(`storing a chat attachment failed for topic ${topicId}`, error)
			reportError(error, "chat", { topicId, attachmentKind: attachment.kind })
		}
	}
}

// one attachment, stored and summarized only when it is kept
async function storeTopicChatAttachment(
	userId: string,
	topicId: string,
	chatTurnId: string | null,
	attachment: StorableChatAttachment,
	isAttachmentKept: boolean,
	litellmApiKey?: string,
): Promise<boolean> {
	// an unkept PDF or paste is already in the question's own words, so only an image is worth its bytes
	if (!isAttachmentKept && attachment.kind !== "image") {
		return false
	}
	// an unkept image is stored only under its own chat turn
	if (!isAttachmentKept && chatTurnId === null) {
		return false
	}

	// a text attachment has no file, so its own words are what gets stored, encrypted like a chat turn's text
	if (attachment.kind === "text") {
		const text = await screenAttachmentText(attachment.text, "kept chat attachment", topicId)
		if (text === null) {
			return false
		}

		// summarize the attachment and store the row
		const context = await generateAttachmentContext(text, litellmApiKey)
		await db.insert(chatAttachments).values({
			userId,
			topicId,
			chatTurnId,
			isKept: isAttachmentKept,
			kind: "text",
			name: attachment.name,
			rawText: encryptChatText(text),
			context,
			status: "ready",
		})
		return true
	}

	// a kept PDF's text, extracted once for the chat turn, is screened before any of it is stored, so a flagged one
	// leaves no object behind
	const bytes = decodeDataUrl(attachment.dataUrl)
	const documentText =
		attachment.kind === "pdf" || attachment.kind === "document"
			? await screenAttachmentText(attachment.extractedText, "kept chat attachment", topicId)
			: ""
	if (documentText === null) {
		return false
	}

	// image, PDF, and video attachments keep their original bytes under a key namespaced to the user.
	// the key is recorded as pending with the upload grace period first
	const attachmentId = crypto.randomUUID()
	const contentType = toCanonicalContentType(contentTypeFromDataUrl(attachment.dataUrl), attachment.name)
	const objectKey = toChatAttachmentKey(userId, topicId, attachmentId, attachment.name)
	await recordPendingObjectDeletionBeforeUpload(objectKey)
	await uploadAttachment(objectKey, bytes, contentType)

	// summarize a kept attachment, then store the chat attachment row and clear the key's pending deletion in one
	// transaction. a failure deletes the object
	try {
		// the kept attachment's context. a kept image's description is screened first, and a flagged one leaves no row
		// and no object
		const attachmentContext = isAttachmentKept
			? await toScreenedKeptAttachmentContext(attachment, documentText, topicId, litellmApiKey)
			: ""
		if (attachmentContext === null) {
			await discardUploadedObject(objectKey)
			return false
		}

		// the row, with the key's pending deletion cleared
		await db.transaction(async (transaction) => {
			await transaction.insert(chatAttachments).values({
				id: attachmentId,
				userId,
				topicId,
				chatTurnId,
				isKept: isAttachmentKept,
				kind: attachment.kind,
				name: attachment.name,
				objectKey,
				contentType,
				byteSize: bytes.byteLength,
				context: attachmentContext,
				status: "ready",
			})
			await clearPendingObjectDeletion(objectKey, transaction)
		})
	} catch (error) {
		// delete the object, then pass the failure on
		await discardUploadedObject(objectKey)
		throw error
	}
	return true
}

// a kept attachment's context, with a kept image's generated description screened as a document.
// null if the scanner flags the description
async function toScreenedKeptAttachmentContext(
	attachment: Exclude<ChatAttachment, { kind: "text" }>,
	documentText: string,
	topicId: string,
	litellmApiKey?: string,
): Promise<string | null> {
	const attachmentContext = await toKeptAttachmentContext(attachment, documentText, litellmApiKey)
	return attachment.kind === "image"
		? screenAttachmentText(attachmentContext, "kept chat image description", topicId)
		: attachmentContext
}

// record an uploaded object's key as pending again, then delete the object
async function discardUploadedObject(objectKey: string): Promise<void> {
	await recordPendingObjectDeletions({ handle: db, objectKeys: [objectKey] }).catch(() => {})
	await deleteStoredObject(objectKey)
}

/**
 * Delete one kept attachment, scoped to its keeper, freeing its limit slot and best-effort deleting its stored object.
 * False if the attachment is not this user's kept one.
 */
export async function deleteKeptAttachment(userId: string, keptAttachmentId: string): Promise<boolean> {
	// load the row first for its object key and the ownership check
	const [keptAttachment] = await db
		.select({ id: chatAttachments.id, objectKey: chatAttachments.objectKey })
		.from(chatAttachments)
		.where(
			and(
				eq(chatAttachments.id, keptAttachmentId),
				eq(chatAttachments.userId, userId),
				eq(chatAttachments.isKept, true),
			),
		)
	if (!keptAttachment) {
		return false
	}

	// record the key and delete the chat attachment row in one transaction, then delete the stored object
	const objectKeys = toStoredObjectKeys([keptAttachment])
	await db.transaction(async (transaction) => {
		await recordPendingObjectDeletions({ handle: transaction, objectKeys })
		await transaction.delete(chatAttachments).where(eq(chatAttachments.id, keptAttachment.id))
	})
	await deleteStoredObjects(objectKeys)
	return true
}

/**
 * Deletes the chat attachments for a topic, or for one user on that topic, with their stored objects.
 */
export async function deleteChatAttachments(topicId: string, userId?: string): Promise<void> {
	// read the rows, record their keys and delete the rows in one transaction, then delete the objects
	const chatAttachmentRows = await db
		.select({ id: chatAttachments.id, objectKey: chatAttachments.objectKey })
		.from(chatAttachments)
		.where(
			userId
				? and(eq(chatAttachments.topicId, topicId), eq(chatAttachments.userId, userId))
				: eq(chatAttachments.topicId, topicId),
		)
	if (chatAttachmentRows.length === 0) {
		return
	}

	// record the keys and delete the rows in one transaction, then delete the objects
	const objectKeys = toStoredObjectKeys(chatAttachmentRows)
	await db.transaction(async (transaction) => {
		await recordPendingObjectDeletions({ handle: transaction, objectKeys })
		await transaction.delete(chatAttachments).where(
			inArray(
				chatAttachments.id,
				chatAttachmentRows.map((chatAttachmentRow) => chatAttachmentRow.id),
			),
		)
	})
	await deleteStoredObjects(objectKeys)
}

// a chat attachment's routes, both scoped to the user who sent it
export const chatAttachmentsRoute = new Hono<AppEnv>()
	.delete("/chat-attachments/:id", async (context) => {
		// deleting a kept attachment is signed-in only and scoped to its keeper, freeing its limit slot. another
		// user's kept attachment reads as a missing one
		const userId = currentUser(context)
		if (!userId) {
			return toChatRejection(context, "signup")
		}
		const isDeleted = await deleteKeptAttachment(userId, context.req.param("id"))
		return isDeleted ? context.json({ ok: true }) : context.json({ error: "not found" }, 404)
	})
	.get("/chat-attachments/:id/download", async (context) => {
		// downloading a chat attachment is signed-in only and scoped to the user who sent it
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "unauthorized" }, 401)
		}
		const chatAttachment = await loadDownloadableChatAttachment(userId, context.req.param("id"))
		if (!chatAttachment) {
			return context.json({ error: "not found" }, 404)
		}

		// text has no stored file, so its words download back directly
		if (chatAttachment.kind === "text") {
			return context.body(
				chatAttachment.text,
				200,
				toStoredFileHeaders(chatAttachment.name, "text/plain; charset=utf-8"),
			)
		}

		// a video serves inline so the bubble's player can stream it. everything else stays a download
		if (chatAttachment.kind === "video") {
			return streamVideoAttachment(context, chatAttachment)
		}
		return context.body(
			attachmentStream(chatAttachment.objectKey),
			200,
			toStoredFileHeaders(chatAttachment.name, chatAttachment.contentType),
		)
	})
