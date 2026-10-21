// the chat room's shared attachment files: screening and reading an upload before anything stores,
// the write beside its chat message
import { CHAT_ROOM_ATTACHMENT_LIMIT } from "@carlnotes/contracts/chat"
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
import { screenImage } from "@carlnotes/models/guard"
import { loadOrProvisionUserLiteLLMKey } from "@carlnotes/models/litellm"
import { generateImageContext } from "@carlnotes/pipeline/attach"
import { toCanonicalContentType } from "@carlnotes/pipeline/attachContentType"
import { extractText } from "@carlnotes/pipeline/attachText"
import { and, count, eq, type SQL } from "drizzle-orm"
import {
	contentTypeFromDataUrl,
	decodeDataUrl,
	reportFlaggedAttachment,
	screenAttachmentText,
	VIDEO_ATTACHMENT_CONTEXT,
} from "./chatAttachmentScreening"
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

/**
 * Screen and read every attachment file a chat message shares, answering null if any one of them is rejected,
 * so a rejected attachment file leaves neither a stored file nor a chat message standing beside one that never landed.
 */
export async function prepareChatRoomAttachments(
	userId: string,
	topicId: string | null,
	teamId: string,
	attachments: ChatAttachment[],
): Promise<PreparedChatRoomAttachment[] | "attachmentLimitReached" | null> {
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

	// one rejection rejects the whole chat message, so the files are read in order, and the first rejection stops it
	const preparedAttachments: PreparedChatRoomAttachment[] = []
	for (const attachment of attachments) {
		const preparedAttachment = await prepareChatRoomAttachment(topicId, teamId, attachment)
		if (preparedAttachment === null) {
			return null
		}
		preparedAttachments.push(preparedAttachment)
	}
	// every attachment file cleared, so the chat message posts with all of them
	return preparedAttachments
}

// screen and read one shared attachment file, with the uploader's limit already weighed for the whole chat message
async function prepareChatRoomAttachment(
	topicId: string | null,
	teamId: string,
	attachment: ChatAttachment,
): Promise<PreparedChatRoomAttachment | null> {
	// shared text stores its own words, screened like a kept attachment's
	if (attachment.kind === "text") {
		const screenedText = await screenAttachmentText(attachment.text, "room attachment", topicId ?? teamId)
		if (screenedText === null) {
			return null
		}
		return { attachment, contextText: screenedText, bytes: null, contentType: null }
	}

	// a PDF's words come out and get screened before its bytes may store. an image has no text yet
	const bytes = decodeDataUrl(attachment.dataUrl)

	// a video has no words to screen and carl can't watch it, so its bytes store with a fixed context
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
		const contentType = toCanonicalContentType(contentTypeFromDataUrl(attachment.dataUrl), attachment.name)

		// an unreadable file rejects the post, so nothing half-read ever stores
		let documentText: string
		try {
			documentText = await extractText(contentType, new Uint8Array(bytes))
		} catch {
			return null
		}

		// the screen may also redact in place, so its returned text is the one that stores
		const screenedText = await screenAttachmentText(documentText, "room attachment", topicId ?? teamId)
		if (screenedText === null) {
			return null
		}
		return { attachment, contextText: screenedText, bytes, contentType }
	}
	// an image is screened by the text it shows, and a flagged one rejects the post before anything stores.
	// a passed image stores as-is, and its description arrives after the post
	const imageScreenVerdict = await screenImage(bytes)
	if (imageScreenVerdict.isFlagged) {
		reportFlaggedAttachment(imageScreenVerdict, "room image", topicId ?? teamId)
		return null
	}
	return { attachment, contextText: "", bytes, contentType: contentTypeFromDataUrl(attachment.dataUrl) }
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
		void describeChatRoomImage({ attachmentId, userId, chatPageId: topicId ?? teamId, dataUrl })
	}
}

// the shared image's row, its uploader, the id of the topic or team it was shared on, and its data url
type DescribeChatRoomImageOptions = { attachmentId: string; userId: string; chatPageId: string; dataUrl: string }

/**
 * Describes a shared image in the background, filling the row that carl's chat turns read.
 * The description is screened before the row turns ready, and a flagged one marks the row failed.
 */
export async function describeChatRoomImage({
	attachmentId,
	userId,
	chatPageId,
	dataUrl,
}: DescribeChatRoomImageOptions): Promise<void> {
	try {
		// write the description and screen it. a flagged one marks the row failed, so carl's chat turns never read it
		const generatedContext = await generateImageContext(dataUrl, await loadOrProvisionUserLiteLLMKey(userId))
		const screenedImageContext = await screenAttachmentText(generatedContext, "room image description", chatPageId)
		if (screenedImageContext === null) {
			await db.update(chatRoomAttachments).set({ status: "failed" }).where(eq(chatRoomAttachments.id, attachmentId))
			return
		}

		// the description fills the row's context and marks it ready
		await db
			.update(chatRoomAttachments)
			.set({ context: encryptChatText(screenedImageContext), status: "ready" })
			.where(eq(chatRoomAttachments.id, attachmentId))
	} catch (error) {
		// a failed description is saved to the chat room attachment row, so carl's chat turns skip it instead of reading an empty one
		console.error(`room image description failed for attachment ${attachmentId}`, error)
		await db.update(chatRoomAttachments).set({ status: "failed" }).where(eq(chatRoomAttachments.id, attachmentId))
	}
}
