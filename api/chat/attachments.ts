// the attachments a user sends with a chat turn, different from the topic attachments that an owner uploads
import { CHAT_ATTACHMENT_KEEP_LIMIT, clipAttachmentText } from "@shared/contracts/chat"
import { reportError } from "@shared/monitoring"
import type { ChatAttachment } from "@shared/payloads"
import { and, eq, inArray } from "drizzle-orm"
import { Hono } from "hono"
import { db } from "../../db"
import { chatAttachments } from "../../db/schema/chat"
import {
	attachmentStream,
	clearPendingObjectDeletion,
	deleteStoredObject,
	deleteStoredObjects,
	extractText,
	generateAttachmentContext,
	recordPendingObjectDeletionBeforeUpload,
	recordPendingObjectDeletions,
	toCanonicalContentType,
	toChatAttachmentKey,
	toStoredObjectKeys,
	uploadAttachment,
} from "../../worker"
import { screenText, toFlaggedReason } from "../../worker/guard"
import { type AppEnv, currentUser } from "../currentUser"
import { toStoredFileHeaders } from "../topic/attachments"
import { loadDownloadableChatAttachment, streamVideoAttachment, toKeptAttachmentContext } from "./chatAttachmentReads"
import { encryptChatText } from "./encryption"

// what stands in for a video's content wherever carl reads attachments
export const VIDEO_ATTACHMENT_CONTEXT = "A video Carl can't watch yet."

/**
 * Resolves a chat turn's attachments into what the model takes. A PDF becomes its extracted text, an image passes through,
 * a video becomes a line saying it can't be watched, and text is screened by llm-guard first.
 * Null if a PDF cannot be read, so the route can reject the chat turn.
 */
export async function resolveChatAttachments(attachments: ChatAttachment[]): Promise<ChatAttachment[] | null> {
	const chatAttachments: ChatAttachment[] = []
	for (const attachment of attachments) {
		// an image includes no text to screen and already has the shape the worker takes
		if (attachment.kind === "image") {
			chatAttachments.push(attachment)
			continue
		}

		// a video has no words and carl can't watch it, so the model reads only that a clip was attached
		if (attachment.kind === "video") {
			chatAttachments.push({ kind: "text", name: attachment.name, text: VIDEO_ATTACHMENT_CONTEXT, keep: false })
			continue
		}

		// a pdf, word file, or workbook hands over bytes, so its words come out here. a text attachment has its own
		let text: string
		if (attachment.kind === "pdf" || attachment.kind === "document") {
			try {
				const bytes = decodeDataUrl(attachment.dataUrl)
				const contentType = toCanonicalContentType(contentTypeFromDataUrl(attachment.dataUrl), attachment.name)
				text = clipAttachmentText(await extractText(contentType, bytes))
			} catch (error) {
				// an unreadable file rejects the whole chat turn instead of sending half of it
				console.error("chat attachment extraction failed", error)
				reportError(error, "chat", { attachmentKind: attachment.kind })
				return null
			}
		} else {
			text = attachment.text
		}

		// the screened text is what gets posted
		const screenVerdict = await screenText(text, "document")
		const screenedText = screenVerdict.isFlagged
			? `[This attachment was withheld: ${toFlaggedReason(screenVerdict)}.]`
			: screenVerdict.text
		// keep stays false on this copy
		chatAttachments.push({ kind: "text", name: attachment.name, text: screenedText, keep: false })
	}
	return chatAttachments
}

// the words that a kept attachment stores, or null if the scanner flags it
export async function screenAttachmentText(text: string, sourceLabel: string, topicId: string): Promise<string | null> {
	// clip before screening. the scanner fails once it runs past its own deadline. an unbounded body should not skip the check
	const screenVerdict = await screenText(clipAttachmentText(text), "document")
	if (screenVerdict.isFlagged) {
		console.error(`a ${sourceLabel} for topic ${topicId} was ${toFlaggedReason(screenVerdict)}`)
		reportError(new Error(toFlaggedReason(screenVerdict)), "chat", { topicId })
		return null
	}
	return screenVerdict.text
}

// a data url's base64 tail, decoded to the bytes it encodes
export function decodeDataUrl(dataUrl: string): Uint8Array {
	return Uint8Array.from(Buffer.from(dataUrl.split(",")[1] ?? "", "base64"))
}

// the media type a data url declares, read from its own prefix instead of being assumed by the attachment kind
export function contentTypeFromDataUrl(dataUrl: string): string {
	return dataUrl.slice("data:".length, dataUrl.indexOf(";")) || "application/octet-stream"
}

/**
 * Store the topic chat attachments that went with the chat turn that just finished.
 * A failure is logged instead of being surfaced.
 */
export async function storeTopicChatAttachments(
	userId: string,
	topicId: string,
	chatTurnId: string | null,
	attachments: ChatAttachment[],
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
	attachment: ChatAttachment,
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

	// a kept PDF is read and screened before any of it is stored, so a flagged one leaves no object behind
	const bytes = decodeDataUrl(attachment.dataUrl)
	const documentText =
		attachment.kind === "pdf" || attachment.kind === "document"
			? await screenAttachmentText(
					await extractText(
						toCanonicalContentType(contentTypeFromDataUrl(attachment.dataUrl), attachment.name),
						new Uint8Array(bytes),
					),
					"kept chat attachment",
					topicId,
				)
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
		// the kept attachment's context
		const attachmentContext = isAttachmentKept
			? await toKeptAttachmentContext(attachment, documentText, litellmApiKey)
			: ""

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
		// record the key again, then delete the object
		await recordPendingObjectDeletions({ handle: db, objectKeys: [objectKey] }).catch(() => {})
		await deleteStoredObject(objectKey)
		throw error
	}
	return true
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
		// deleting a kept attachment is signed-in only and scoped to its keeper, freeing its limit slot
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "sign up required" }, 401)
		}
		const isDeleted = await deleteKeptAttachment(userId, context.req.param("id"))
		return isDeleted ? context.json({ ok: true }) : context.json({ error: "forbidden" }, 403)
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
