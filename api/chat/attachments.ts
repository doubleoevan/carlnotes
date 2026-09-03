// the attachments a user sends with a chat turn, different from the topic attachments that an owner uploads
import {
	CHAT_ATTACHMENT_KEEP_LIMIT,
	type ChatAttachment,
	type ChatMessageAttachment,
	clipAttachmentText,
	type KeptChatAttachment,
} from "@shared/contracts"
import { reportError } from "@shared/monitoring"
import { and, eq, inArray } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { db } from "../../db"
import { chatAttachments } from "../../db/schema"
import {
	attachmentRangeStream,
	attachmentStream,
	deleteAttachment,
	extractText,
	generateAttachmentContext,
	generateImageContext,
	toCanonicalContentType,
	toChatAttachmentKey,
	uploadAttachment,
} from "../../worker"
import { screenText, toFlaggedReason } from "../../worker/guard"
import { type AppEnv, currentUser } from "../currentUser"
import { toStoredFileHeaders } from "../topic/attachments"
import { decryptChatText, encryptChatText } from "./encryption"
import { toVideoRange } from "./videoRange"

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

	// image, PDF, and video attachments keep their original bytes under a key namespaced to the user
	const attachmentId = crypto.randomUUID()
	const contentType = toCanonicalContentType(contentTypeFromDataUrl(attachment.dataUrl), attachment.name)
	const objectKey = toChatAttachmentKey(userId, topicId, attachmentId, attachment.name)
	await uploadAttachment(objectKey, bytes, contentType)

	// summarize a kept attachment and store the chat attachment row
	try {
		const attachmentContext = isAttachmentKept
			? await toKeptAttachmentContext(attachment, documentText, litellmApiKey)
			: ""
		await db.insert(chatAttachments).values({
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
	} catch (error) {
		await deleteAttachment(objectKey).catch(() => {})
		throw error
	}
	return true
}

// what future chat turns read for a kept attachment file. a PDF gives its extracted words, an image generated notes, a video a fixed line
async function toKeptAttachmentContext(
	attachment: Exclude<ChatAttachment, { kind: "text" }>,
	documentText: string,
	litellmApiKey?: string,
): Promise<string> {
	// a pdf, word file, or workbook summarizes from the words already screened by llm-guard
	if (attachment.kind === "pdf" || attachment.kind === "document") {
		return generateAttachmentContext(documentText, litellmApiKey)
	}

	// a video's line only names the file
	if (attachment.kind === "video") {
		return `The reader attached a video named "${attachment.name}". Carl can't watch videos yet.`
	}
	return generateImageContext(attachment.dataUrl, litellmApiKey)
}

/**
 * The attachments that this user keeps for the topic, oldest first.
 * The composer ui lists them for deletion and counts them against the limit.
 */
export async function loadKeptTopicAttachments(userId: string | null, topicId: string): Promise<KeptChatAttachment[]> {
	// a logged-out visitor keeps nothing
	if (!userId) {
		return []
	}
	// the user and topic index makes this a cheap read on every conversation load
	return db
		.select({ id: chatAttachments.id, name: chatAttachments.name, kind: chatAttachments.kind })
		.from(chatAttachments)
		.where(
			and(eq(chatAttachments.userId, userId), eq(chatAttachments.topicId, topicId), eq(chatAttachments.isKept, true)),
		)
		.orderBy(chatAttachments.createdAt)
}

/**
 * The attachments this user sent on the topic, grouped under the chat turn each one went with, oldest first.
 */
export async function loadTopicChatTurnAttachments(
	userId: string,
	topicId: string,
): Promise<Map<string, ChatMessageAttachment[]>> {
	// every attachment this user sent on the topic, in one query
	const attachmentRows = await db
		.select({
			id: chatAttachments.id,
			chatTurnId: chatAttachments.chatTurnId,
			kind: chatAttachments.kind,
			name: chatAttachments.name,
		})
		.from(chatAttachments)
		.where(and(eq(chatAttachments.userId, userId), eq(chatAttachments.topicId, topicId)))
		.orderBy(chatAttachments.createdAt)
	return toAttachmentsByChatTurnId(attachmentRows)
}

/**
 * Groups attachments under the chat turn each one went with, dropping the ones no chat turn owns.
 */
export function toAttachmentsByChatTurnId(
	attachmentRows: (ChatMessageAttachment & { chatTurnId: string | null })[],
): Map<string, ChatMessageAttachment[]> {
	// each attachment joins its chat turn's list in the order it was stored
	const attachmentsByChatTurnId = new Map<string, ChatMessageAttachment[]>()
	for (const attachmentRow of attachmentRows) {
		if (attachmentRow.chatTurnId === null) {
			continue
		}
		const { id, kind, name } = attachmentRow
		attachmentsByChatTurnId.set(attachmentRow.chatTurnId, [
			...(attachmentsByChatTurnId.get(attachmentRow.chatTurnId) ?? []),
			{ id, kind, name },
		])
	}
	return attachmentsByChatTurnId
}

// what a chat attachment sends back. an image, PDF, or video comes from its stored object, and text from its own words
export type DownloadableChatAttachment =
	| { kind: "text"; name: string; text: string }
	// a stored file answers with the key to stream it from, plus what the response headers need
	| {
			kind: "image" | "pdf" | "document" | "video"
			name: string
			objectKey: string
			contentType: string
			byteSize: number | null
	  }

/**
 * One of the user's own chat attachments ready to download, kept or not. Null if the id is not this user's,
 * when a stored file has no object key, or when the raw text no longer decrypts.
 */
export async function loadDownloadableChatAttachment(
	userId: string,
	chatAttachmentId: string,
): Promise<DownloadableChatAttachment | null> {
	const [chatAttachment] = await db
		.select({
			kind: chatAttachments.kind,
			name: chatAttachments.name,
			objectKey: chatAttachments.objectKey,
			contentType: chatAttachments.contentType,
			byteSize: chatAttachments.byteSize,
			rawText: chatAttachments.rawText,
		})
		.from(chatAttachments)
		.where(and(eq(chatAttachments.id, chatAttachmentId), eq(chatAttachments.userId, userId)))
	if (!chatAttachment) {
		return null
	}

	// a text attachment has no file, so its stored words are what comes back
	if (chatAttachment.kind === "text") {
		const text = chatAttachment.rawText ? decryptChatText(chatAttachment.rawText) : null
		return text === null ? null : { kind: "text", name: chatAttachment.name, text }
	}

	// an image, PDF, or video streams from the object it was stored under
	if (!chatAttachment.objectKey) {
		return null
	}
	return {
		kind: chatAttachment.kind,
		name: chatAttachment.name,
		objectKey: chatAttachment.objectKey,
		contentType: chatAttachment.contentType ?? "application/octet-stream",
		byteSize: chatAttachment.byteSize,
	}
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

	// delete the chat attachment row, then best-effort delete the stored object the way that topic attachments do
	await db.delete(chatAttachments).where(eq(chatAttachments.id, keptAttachment.id))
	if (keptAttachment.objectKey) {
		await deleteAttachment(keptAttachment.objectKey).catch(() => {})
	}
	return true
}

/**
 * Delete the chat attachments for a topic, or for one user on that topic, taking their stored objects with their rows.
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

/**
 * Delete user's stored objects when their account is closing.
 * Only the objects. the table rows cascade with the users row.
 */
export async function deleteStoredChatAttachments(userId: string): Promise<void> {
	const keptAttachments = await db
		.select({ objectKey: chatAttachments.objectKey })
		.from(chatAttachments)
		.where(eq(chatAttachments.userId, userId))

	// only an attachment with an object key can be deleted from storage
	const objectKeys = keptAttachments.map((keptAttachment) => keptAttachment.objectKey).filter(Boolean)
	await Promise.all(objectKeys.map((objectKey) => deleteAttachment(objectKey as string).catch(() => {})))
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

/**
 * Stream a stored video inline, honoring one byte range. Safari's player reads nothing from a server that ignores ranges.
 */
export function streamVideoAttachment(
	context: Context,
	video: { name: string; objectKey: string; contentType: string; byteSize: number | null },
): Response {
	const headers = { ...toStoredFileHeaders(video.name, video.contentType), "Accept-Ranges": "bytes" }

	// the parsed range decides between the whole file, one slice of it, and a 416 naming the size
	const videoRange = toVideoRange(context.req.header("Range"), video.byteSize)
	if (videoRange.kind === "whole") {
		return context.body(attachmentStream(video.objectKey), 200, headers)
	}
	if (videoRange.kind === "unsatisfiable") {
		return context.body(null, 416, { "Content-Range": `bytes */${videoRange.byteSize}` })
	}

	// the asked-for piece streams back with the range headers that let the player keep seeking
	return context.body(attachmentRangeStream(video.objectKey, videoRange.start, videoRange.end + 1), 206, {
		...headers,
		"Content-Range": `bytes ${videoRange.start}-${videoRange.end}/${videoRange.byteSize}`,
		"Content-Length": String(videoRange.end - videoRange.start + 1),
	})
}
