// the chat room's shared attachment files: reading an upload before anything stores, and the write beside its chat
// message
import { CHAT_ROOM_ATTACHMENT_LIMIT, clipAttachmentText } from "@carlnotes/contracts/chat"
import type { ChatAttachment } from "@carlnotes/contracts/payloads"
import { type DbTransaction, db } from "@carlnotes/db"
import { chatRoomAttachments } from "@carlnotes/db/schema/chat"
import {
	clearPendingObjectDeletion,
	recordPendingObjectDeletionBeforeUpload,
	recordPendingObjectDeletions,
	toChatRoomAttachmentKey,
	toStoredObjectKeys,
	uploadAttachment,
} from "@carlnotes/db/store"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { generateImageContext } from "@carlnotes/pipeline/attach"
import { toCanonicalContentType } from "@carlnotes/pipeline/attachContentType"
import { and, count, eq, type SQL } from "drizzle-orm"
import { toExtractionDeadline } from "./attachmentExtraction"
import {
	contentTypeFromDataUrl,
	decodeDataUrl,
	type ExtractableChatAttachment,
	type PastDeadlineRejection,
	readChatAttachmentText,
	VIDEO_ATTACHMENT_CONTEXT,
} from "./chatAttachmentParts"
import { encryptChatText } from "./encryption"
import { toTopicFilter } from "./roomAccess"

/**
 * Deletes the chat room attachment rows the filter names, records their keys as pending, and returns the keys.
 */
export async function deleteChatRoomAttachmentRows(
	transaction: DbTransaction,
	attachmentFilter: SQL | undefined,
): Promise<string[]> {
	const chatRoomAttachmentRows = await transaction
		.delete(chatRoomAttachments)
		.where(attachmentFilter)
		.returning({ objectKey: chatRoomAttachments.objectKey })

	// a row still uploading has no key yet
	const objectKeys = toStoredObjectKeys(chatRoomAttachmentRows)
	await recordPendingObjectDeletions({ handle: transaction, objectKeys })
	return objectKeys
}

// what a shared attachment file becomes before its chat message posts
export type PreparedChatRoomAttachment = {
	attachment: ChatAttachment
	// the document's words for carl's chat turns, empty for an image until its description arrives
	contextText: string
	bytes: Uint8Array | null
	contentType: string | null
}

// one shared attachment file to prepare: the file, and the post's deadline from toExtractionDeadline
type PrepareChatRoomAttachmentOptions = { attachment: ChatAttachment; deadline: number }

/**
 * Reads every attachment file a chat message shares, returning null if any one of them is rejected, or
 * why if one was not read before the post's deadline, so a rejected attachment file leaves neither a stored file
 * nor a chat message standing beside one that never landed.
 */
export async function prepareChatRoomAttachments(
	userId: string,
	topicId: string | null,
	teamId: string,
	attachments: ChatAttachment[],
): Promise<PreparedChatRoomAttachment[] | "attachmentLimitReached" | PastDeadlineRejection | null> {
	if (attachments.length === 0) {
		return []
	}

	// the uploader's file count in this chat room is limited, so one member cannot fill the chat room alone
	// ponytail: the read and the write do not serialize, so an uploader racing themself can land over the limit
	const [attachmentCountRow] = await db
		.select({ count: count() })
		.from(chatRoomAttachments)
		.where(
			and(
				toTopicFilter(chatRoomAttachments.topicId, topicId),
				eq(chatRoomAttachments.teamId, teamId),
				eq(chatRoomAttachments.uploaderUserId, userId),
			),
		)
	if ((attachmentCountRow?.count ?? 0) + attachments.length > CHAT_ROOM_ATTACHMENT_LIMIT) {
		return "attachmentLimitReached"
	}

	// one rejection rejects the whole chat message, so the files are read in order, and the first rejection stops it.
	// every file shares one deadline, so the post always responds before the server's idle timeout
	const preparedAttachments: PreparedChatRoomAttachment[] = []
	const deadline = toExtractionDeadline()
	for (const attachment of attachments) {
		// a rejected file stops the post with why
		const preparedAttachment = await prepareChatRoomAttachment({ attachment, deadline })
		if (preparedAttachment === null || typeof preparedAttachment === "string") {
			return preparedAttachment
		}
		preparedAttachments.push(preparedAttachment)
	}
	// every attachment file cleared, so the chat message posts with all of them
	return preparedAttachments
}

// read one shared attachment file, with the uploader's limit already checked for the whole chat message.
// null if the file is rejected, and why if it was not read before the post's deadline
async function prepareChatRoomAttachment({
	attachment,
	deadline,
}: PrepareChatRoomAttachmentOptions): Promise<PreparedChatRoomAttachment | PastDeadlineRejection | null> {
	// shared text stores its own words, clipped like a kept attachment's
	if (attachment.kind === "text") {
		return { attachment, contextText: clipAttachmentText(attachment.text), bytes: null, contentType: null }
	}

	// decode the file's bytes from its data url
	const bytes = decodeDataUrl(attachment.dataUrl)

	// a video has no words and carl can't watch it, so its bytes store with a fixed context
	if (attachment.kind === "video") {
		return {
			attachment,
			contextText: VIDEO_ATTACHMENT_CONTEXT,
			bytes,
			contentType: contentTypeFromDataUrl(attachment.dataUrl),
		}
	}
	// a pdf, word file, or workbook has words to pull out, and the room picker offers all three
	if (attachment.kind === "pdf" || attachment.kind === "document") {
		return prepareExtractableChatRoomAttachment({ attachment, deadline, bytes })
	}
	// an image stores as-is, and its description is written after the post
	return { attachment, contextText: "", bytes, contentType: contentTypeFromDataUrl(attachment.dataUrl) }
}

// read a shared PDF, Word file, or workbook, whose bytes the caller decoded. null if the file is rejected,
// and why if it was not read before the post's deadline
async function prepareExtractableChatRoomAttachment({
	attachment,
	deadline,
	bytes,
}: PrepareChatRoomAttachmentOptions & {
	attachment: ExtractableChatAttachment
	bytes: Uint8Array
}): Promise<PreparedChatRoomAttachment | PastDeadlineRejection | null> {
	// a file that cannot be read rejects the post with why, so nothing half-read ever stores. the worker thread takes a
	// copy, since the bytes store after the post
	const chatAttachmentText = await readChatAttachmentText({ attachment, bytes: new Uint8Array(bytes), deadline })
	if ("rejection" in chatAttachmentText) {
		return chatAttachmentText.rejection === "attachmentUnreadable" ? null : chatAttachmentText.rejection
	}

	// the clipped text is the one that stores
	const contentType = toCanonicalContentType(contentTypeFromDataUrl(attachment.dataUrl), attachment.name)
	return { attachment, contextText: clipAttachmentText(chatAttachmentText.text), bytes, contentType }
}

// store the shared file beside its chat message
export async function storeChatRoomAttachment(
	userId: string,
	username: string,
	topicId: string | null,
	teamId: string,
	chatMessageId: number,
	preparedAttachment: PreparedChatRoomAttachment,
): Promise<void> {
	// the key is recorded as pending with the upload grace period, then the bytes are stored, so a row never points at
	// an object that failed to store
	const attachmentId = crypto.randomUUID()
	let objectKey: string | null = null
	if (preparedAttachment.bytes) {
		// the team's own chat room stores under a team path
		objectKey = toChatRoomAttachmentKey(topicId ?? `team-${teamId}`, attachmentId, preparedAttachment.attachment.name)
		await recordPendingObjectDeletionBeforeUpload(objectKey)
		await uploadAttachment(
			objectKey,
			preparedAttachment.bytes,
			preparedAttachment.contentType ?? "application/octet-stream",
		)
	}

	// the row, with the key's pending deletion cleared in the same transaction
	await db.transaction(async (transaction) => {
		await transaction.insert(chatRoomAttachments).values({
			id: attachmentId,
			topicId,
			teamId,
			messageId: chatMessageId,
			uploaderUserId: userId,
			uploaderUsername: username,
			kind: preparedAttachment.attachment.kind,
			name: preparedAttachment.attachment.name,
			objectKey,
			contentType: preparedAttachment.contentType,
			byteSize: preparedAttachment.bytes?.byteLength,
			context: preparedAttachment.contextText ? encryptChatText(preparedAttachment.contextText) : "",
			status: preparedAttachment.attachment.kind === "image" ? "pending" : "ready",
		})
		if (objectKey) {
			await clearPendingObjectDeletion(objectKey, transaction)
		}
	})

	// an image's description arrives after the post, on the uploader's own key
	if (preparedAttachment.attachment.kind === "image" && "dataUrl" in preparedAttachment.attachment) {
		const { dataUrl } = preparedAttachment.attachment
		void describeChatRoomImage({ attachmentId, userId, dataUrl })
	}
}

// the shared image's row, its uploader, and its data url
type DescribeChatRoomImageOptions = { attachmentId: string; userId: string; dataUrl: string }

/**
 * Describes a shared image in the background, filling the row that carl's chat turns read as data inside the fence.
 * A description that fails to generate marks the row failed.
 */
export async function describeChatRoomImage({
	attachmentId,
	userId,
	dataUrl,
}: DescribeChatRoomImageOptions): Promise<void> {
	try {
		// write the description, which fills the row's context and marks it ready
		const generatedContext = await generateImageContext(dataUrl, await loadOrProvisionUserLiteLLMKey(userId))
		await db
			.update(chatRoomAttachments)
			.set({ context: encryptChatText(clipAttachmentText(generatedContext)), status: "ready" })
			.where(eq(chatRoomAttachments.id, attachmentId))
	} catch (error) {
		// a failed description is saved to the chat room attachment row, so carl's chat turns skip it instead of reading an empty one
		console.error(`room image description failed for attachment ${attachmentId}`, error)
		await db.update(chatRoomAttachments).set({ status: "failed" }).where(eq(chatRoomAttachments.id, attachmentId))
	}
}
