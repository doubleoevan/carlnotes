// reading chat attachments: the kept ones and their context for a chat turn, a chat turn's own, a download, and the
// object keys behind a user's or a topic's
import type { ChatMessageAttachment, KeptChatAttachment } from "@shared/contracts/chat"
import type { ChatAttachment } from "@shared/payloads"
import { and, eq } from "drizzle-orm"
import type { Context } from "hono"
import { type DbHandle, db } from "../../db"
import { chatAttachments } from "../../db/schema/chat"
import {
	attachmentRangeStream,
	attachmentStream,
	generateAttachmentContext,
	generateImageContext,
	toStoredObjectKeys,
} from "../../worker"
import { toStoredFileHeaders } from "../topic/attachments"
import { decryptChatText } from "./encryption"
import { toVideoRange } from "./videoRange"

/**
 * Returns what future chat turns read for a kept attachment file. A PDF gives its extracted words, an image generated
 * notes, a video a fixed line
 */
export async function toKeptAttachmentContext(
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
	const keptAttachmentRows = await db
		.select({
			id: chatAttachments.id,
			name: chatAttachments.name,
			kind: chatAttachments.kind,
			createdAt: chatAttachments.createdAt,
		})
		.from(chatAttachments)
		.where(
			and(eq(chatAttachments.userId, userId), eq(chatAttachments.topicId, topicId), eq(chatAttachments.isKept, true)),
		)
		.orderBy(chatAttachments.createdAt)

	// return attachments with the created time as an iso string
	return keptAttachmentRows.map(({ createdAt, ...keptAttachment }) => ({
		...keptAttachment,
		at: createdAt.toISOString(),
	}))
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

// the chat attachments to read the stored object keys of: every one of a user's, on every topic, or every one of a topic's
export type LoadChatAttachmentObjectKeysOptions = { userId: string } | { topicId: string }

/**
 * Returns the keys of the stored objects behind a user's chat attachments on every topic, or behind a topic's.
 */
export async function loadChatAttachmentObjectKeys(
	options: LoadChatAttachmentObjectKeysOptions,
	handle: DbHandle = db,
): Promise<string[]> {
	// read the rows and keep the keys among them
	const chatAttachmentRows = await handle
		.select({ objectKey: chatAttachments.objectKey })
		.from(chatAttachments)
		.where(
			"userId" in options ? eq(chatAttachments.userId, options.userId) : eq(chatAttachments.topicId, options.topicId),
		)
	return toStoredObjectKeys(chatAttachmentRows)
}

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
