// the attachments a user sends with a chat turn, different from the topic attachments that an owner uploads
import { CHAT_ATTACHMENT_KEEP_LIMIT, type ChatAttachment, clipAttachmentText } from "@shared/contracts"
import { reportError } from "@shared/monitoring"
import { and, eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import { chatAttachments } from "../../db/schema"
import {
	deleteAttachment,
	extractText,
	generateContext,
	generateImageContext,
	putAttachment,
	toChatAttachmentKey,
} from "../../worker"
import { screenText, toFlaggedReason } from "../../worker/guard"
import { decryptChatText, encryptChatText } from "./encryption"

/**
 * Resolves a chat turn's attachments into what the model takes. A PDF becomes its extracted text, an image passes through,
 * and text is screened by llm-guard first. Null when a PDF cannot be read, so the route can refuse the chat turn.
 */
export async function resolveChatAttachments(attachments: ChatAttachment[]): Promise<ChatAttachment[] | null> {
	const chatAttachments: ChatAttachment[] = []
	for (const attachment of attachments) {
		// an image includes no text to screen and already has the shape the worker takes
		if (attachment.kind === "image") {
			chatAttachments.push(attachment)
			continue
		}

		// a PDF's words come out of the file here, while a text attachment already includes its own
		let text: string
		if (attachment.kind === "pdf") {
			try {
				text = clipAttachmentText(await extractText("application/pdf", decodeDataUrl(attachment.data)))
			} catch (error) {
				// an unreadable PDF refuses the whole chat turn instead of sending half of it
				console.error("chat pdf extraction failed", error)
				reportError(error, "chat", { attachmentKind: attachment.kind })
				return null
			}
		} else {
			text = attachment.text
		}

		// the screened text is what gets posted, since even an unflagged verdict can carry redactions.
		// a flagged attachment becomes a note in its place, so the chat turn still gets an answer
		const screenVerdict = await screenText(text, "document")
		const screenedText = screenVerdict.isFlagged
			? `[This attachment was withheld: ${toFlaggedReason(screenVerdict)}.]`
			: screenVerdict.text
		// keep stays false on this copy. what gets stored is read from the raw attachments,
		// so a withheld note is never what the chat persists
		chatAttachments.push({ kind: "text", name: attachment.name, text: screenedText, keep: false })
	}
	return chatAttachments
}

// the words that a kept attachment stores, or null when the scanner flags it.
// a flagged attachment is dropped rather than remembered
async function screenKeptText(text: string, topicId: string): Promise<string | null> {
	// clip before screening. the scanner fails once it runs past its own deadline. an unbounded body should not skip the check
	const screenVerdict = await screenText(clipAttachmentText(text), "document")
	if (screenVerdict.isFlagged) {
		console.error(`a kept chat attachment for topic ${topicId} was ${toFlaggedReason(screenVerdict)}`)
		reportError(new Error(toFlaggedReason(screenVerdict)), "chat", { topicId })
		return null
	}
	return screenVerdict.text
}

// a data url's base64 tail, decoded to the bytes it encodes
function decodeDataUrl(dataUrl: string): Uint8Array {
	return Uint8Array.from(Buffer.from(dataUrl.split(",")[1] ?? "", "base64"))
}

// the media type a data url declares, read from its own prefix instead of being assumed by the attachment kind
function contentTypeFromDataUrl(dataUrl: string): string {
	return dataUrl.slice("data:".length, dataUrl.indexOf(";")) || "application/octet-stream"
}

/**
 * Store the attachments a user marked to keep on the chat turn that just finished.
 * Best-effort, since that chat turn already has its answer.
 * a failure is logged instead of being surfaced, and a kept attachment past the attachments cap is skipped.
 */
export async function keepChatAttachments(
	userId: string,
	topicId: string,
	attachments: ChatAttachment[],
	litellmApiKey?: string,
): Promise<void> {
	// most chat turns mark nothing, and those cost no queries at all
	const attachmentsToKeep = attachments.filter((attachment) => attachment.keep)
	if (attachmentsToKeep.length === 0) {
		return
	}

	// how many attachment slots are left under the cap
	const keptAttachments = await db
		.select({ id: chatAttachments.id })
		.from(chatAttachments)
		.where(and(eq(chatAttachments.userId, userId), eq(chatAttachments.topicId, topicId)))
	let remainingAttachmentSlots = CHAT_ATTACHMENT_KEEP_LIMIT - keptAttachments.length

	for (const attachment of attachmentsToKeep) {
		if (remainingAttachmentSlots <= 0) {
			break
		}
		// one failed kept attachment never stops the rest
		try {
			// only a kept attachment that actually stored uses up a cap slot
			if (await keepOneChatAttachment(userId, topicId, attachment, litellmApiKey)) {
				remainingAttachmentSlots -= 1
			}
		} catch (error) {
			// a failed keep never surfaces to the reader, so the log and the report are the only sign of it
			console.error(`keeping a chat attachment failed for topic ${topicId}`, error)
			reportError(error, "chat", { topicId, attachmentKind: attachment.kind })
		}
	}
}

// one kept attachment, stored and summarized. text stores its own encrypted words, an image or PDF stores its original bytes,
// and every attachment kind ends in one insert carrying the summary that later chat turns read
async function keepOneChatAttachment(
	userId: string,
	topicId: string,
	attachment: ChatAttachment,
	litellmApiKey?: string,
): Promise<boolean> {
	// a text attachment has no file, so its own words are what gets stored, encrypted like a chat turn's text
	if (attachment.kind === "text") {
		const text = await screenKeptText(attachment.text, topicId)
		if (text === null) {
			return false
		}

		// summarize the attachment and store the row, since later chat turns read the summary instead of the words
		const context = await generateContext(text, litellmApiKey)
		await db.insert(chatAttachments).values({
			userId,
			topicId,
			kind: "text",
			name: attachment.name,
			rawText: encryptChatText(text),
			context,
			status: "ready",
		})
		return true
	}

	// a kept PDF is read and screened before any of it is stored, so a flagged one leaves no object behind.
	// the extractor reads a copy, since reading a PDF empties the array it was given, and the original is what gets stored
	const bytes = decodeDataUrl(attachment.data)
	const pdfText =
		attachment.kind === "pdf"
			? await screenKeptText(await extractText("application/pdf", new Uint8Array(bytes)), topicId)
			: ""
	if (pdfText === null) {
		return false
	}

	// image and PDF attachments keep their original bytes under a key namespaced to the reader,
	// the same way a topic attachment's file lives in storage while only its summary gets posted to the model
	const attachmentId = crypto.randomUUID()
	const contentType = attachment.kind === "pdf" ? "application/pdf" : contentTypeFromDataUrl(attachment.data)
	const objectKey = toChatAttachmentKey(userId, topicId, attachmentId, attachment.name)
	await putAttachment(objectKey, bytes, contentType)

	// summarize what was kept and store the chat attachment row. the object is already stored,
	// so a summary or insert that fails deletes the object from storage
	try {
		const context =
			attachment.kind === "pdf"
				? await generateContext(pdfText, litellmApiKey)
				: await generateImageContext(attachment.data, litellmApiKey)
		await db.insert(chatAttachments).values({
			id: attachmentId,
			userId,
			topicId,
			kind: attachment.kind,
			name: attachment.name,
			objectKey,
			contentType,
			byteSize: bytes.byteLength,
			context,
			status: "ready",
		})
	} catch (error) {
		await deleteAttachment(objectKey).catch(() => {})
		throw error
	}
	return true
}

/**
 * The attachments that this reader keeps for the topic, oldest first.
 * The composer ui lists them for deletion and counts them against the cap.
 */
export async function loadKeptAttachments(
	userId: string | null,
	topicId: string,
): Promise<{ id: string; name: string; kind: "image" | "pdf" | "text" }[]> {
	// a visitor keeps nothing
	if (!userId) {
		return []
	}
	// the user and topic index makes this a cheap read on every conversation load
	return db
		.select({ id: chatAttachments.id, name: chatAttachments.name, kind: chatAttachments.kind })
		.from(chatAttachments)
		.where(and(eq(chatAttachments.userId, userId), eq(chatAttachments.topicId, topicId)))
		.orderBy(chatAttachments.createdAt)
}

// what a kept attachment sends back. an image or PDF comes from its stored object, and text from its own words
export type DownloadableKeptAttachment =
	| { kind: "text"; name: string; text: string }
	| { kind: "image" | "pdf"; name: string; objectKey: string; contentType: string }

/**
 * One kept attachment ready to download, scoped to its keeper. Null when the id is not this reader's,
 * when an image or PDF has no stored object, or when the raw text no longer decrypts.
 */
export async function loadDownloadableKeptAttachment(
	userId: string,
	keptAttachmentId: string,
): Promise<DownloadableKeptAttachment | null> {
	const [keptAttachment] = await db
		.select({
			kind: chatAttachments.kind,
			name: chatAttachments.name,
			objectKey: chatAttachments.objectKey,
			contentType: chatAttachments.contentType,
			rawText: chatAttachments.rawText,
		})
		.from(chatAttachments)
		.where(and(eq(chatAttachments.id, keptAttachmentId), eq(chatAttachments.userId, userId)))
	if (!keptAttachment) {
		return null
	}

	// a text attachment has no file, so its stored words are what comes back
	if (keptAttachment.kind === "text") {
		const text = keptAttachment.rawText ? decryptChatText(keptAttachment.rawText) : null
		return text === null ? null : { kind: "text", name: keptAttachment.name, text }
	}

	// an image or PDF streams from the object it was stored under
	if (!keptAttachment.objectKey) {
		return null
	}
	return {
		kind: keptAttachment.kind,
		name: keptAttachment.name,
		objectKey: keptAttachment.objectKey,
		contentType: keptAttachment.contentType ?? "application/octet-stream",
	}
}

/**
 * Delete one kept attachment, scoped to its keeper, freeing its cap slot and best-effort deleting its stored object.
 * False when the attachment's user id is not this user's, so a user can never delete another's attachment.
 */
export async function deleteKeptAttachment(userId: string, keptAttachmentId: string): Promise<boolean> {
	// load the row first for its object key and the ownership check
	const [keptAttachment] = await db
		.select({ id: chatAttachments.id, objectKey: chatAttachments.objectKey })
		.from(chatAttachments)
		.where(and(eq(chatAttachments.id, keptAttachmentId), eq(chatAttachments.userId, userId)))
	if (!keptAttachment) {
		return false
	}

	// delete the chat attachment row, then best-effort delete the stored object the way that topic attachments do
	await db.delete(chatAttachments).where(eq(chatAttachments.id, keptAttachment.id))
	if (keptAttachment.objectKey) {
		await deleteAttachment(keptAttachment.objectKey).catch(() => {})
	}
	return true
}

/**
 * Delete the chat attachments for a topic, or for one reader on that topic, taking their stored objects with their rows.
 * The objects go first: a row pointing at a missing object is visible and fixable, while an object with no row is neither,
 * and still bills storage that nobody can account for.
 */
export async function deleteChatAttachments(topicId: string, userId?: string): Promise<void> {
	const keptAttachments = await db
		.select({ id: chatAttachments.id, objectKey: chatAttachments.objectKey })
		.from(chatAttachments)
		.where(
			userId
				? and(eq(chatAttachments.topicId, topicId), eq(chatAttachments.userId, userId))
				: eq(chatAttachments.topicId, topicId),
		)
	if (keptAttachments.length === 0) {
		return
	}

	// a failed object delete leaves the row, so the next pass over the topic finds it again
	const objectKeys = keptAttachments.map((keptAttachment) => keptAttachment.objectKey).filter(Boolean)
	await Promise.all(objectKeys.map((objectKey) => deleteAttachment(objectKey as string).catch(() => {})))
	await db.delete(chatAttachments).where(
		inArray(
			chatAttachments.id,
			keptAttachments.map((keptAttachment) => keptAttachment.id),
		),
	)
}
