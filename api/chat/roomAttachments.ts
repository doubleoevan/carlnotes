// the room's shared attachment files: screening and reading an upload before anything stores, the write beside its message
import { CHAT_ROOM_ATTACHMENT_LIMIT, type ChatAttachment } from "@shared/contracts"
import { and, count, eq } from "drizzle-orm"
import { db } from "../../db"
import { chatRoomAttachments, users } from "../../db/schema"
import { extractText, generateImageContext, putAttachment, toChatRoomAttachmentKey } from "../../worker"
import { contentTypeFromDataUrl, decodeDataUrl, screenAttachmentText } from "./attachments"
import { encryptChatText } from "./encryption"
import { toTopicFilter } from "./roomTurns"

// what a shared attachment file becomes before its message posts
export type PreparedChatRoomAttachment = {
	attachment: ChatAttachment
	// the document's words for carl's turns, empty for an image until its description arrives
	contextText: string
	bytes: Uint8Array | null
	contentType: string | null
}

/**
 * Screen and read every attachment file a message shares, answering null when any one of them is refused,
 * so a rejected attachment file leaves neither a stored file nor a message standing beside one that never landed.
 */
export async function prepareChatRoomAttachments(
	userId: string,
	topicId: string | null,
	teamId: string,
	attachments: ChatAttachment[],
): Promise<PreparedChatRoomAttachment[] | null> {
	if (attachments.length === 0) {
		return []
	}

	// the uploader's file count in this room is limited, so one member cannot fill the room alone
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
		return null
	}

	// one refusal refuses the message, so the files are read in order, and the first refusal ends it
	const preparedAttachments: PreparedChatRoomAttachment[] = []
	for (const attachment of attachments) {
		const preparedAttachment = await prepareChatRoomAttachment(topicId, teamId, attachment)
		if (preparedAttachment === null) {
			return null
		}
		preparedAttachments.push(preparedAttachment)
	}
	// every attachment file cleared, so the message posts with all of them
	return preparedAttachments
}

// screen and read one shared attachment file, with the uploader's limit already weighed for the whole message
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
	if (attachment.kind === "pdf") {
		// an unreadable pdf rejects the post, so nothing half-read ever stores
		let pdfText: string
		try {
			pdfText = await extractText("application/pdf", new Uint8Array(bytes))
		} catch {
			return null
		}
		// the screen may also redact in place, so its returned text is the one that stores
		const screenedText = await screenAttachmentText(pdfText, "room attachment", topicId ?? teamId)
		if (screenedText === null) {
			return null
		}
		return { attachment, contextText: screenedText, bytes, contentType: "application/pdf" }
	}
	// an image stores as-is, and its description arrives after the post
	return { attachment, contextText: "", bytes, contentType: contentTypeFromDataUrl(attachment.dataUrl) }
}

// store the shared file beside its message
export async function storeChatRoomAttachment(
	userId: string,
	username: string,
	topicId: string | null,
	teamId: string,
	messageId: number,
	preparedAttachment: PreparedChatRoomAttachment,
): Promise<void> {
	// the bytes are stored first, so a row never points at an object that failed to store
	const attachmentId = crypto.randomUUID()
	let objectKey: string | null = null
	if (preparedAttachment.bytes) {
		// the team's own chat room stores under a team path
		objectKey = toChatRoomAttachmentKey(topicId ?? `team-${teamId}`, attachmentId, preparedAttachment.attachment.name)
		await putAttachment(
			objectKey,
			preparedAttachment.bytes,
			preparedAttachment.contentType ?? "application/octet-stream",
		)
	}
	await db.insert(chatRoomAttachments).values({
		id: attachmentId,
		topicId,
		teamId,
		messageId,
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

	// an image's description arrives after the post, on the uploader's own key
	if (preparedAttachment.attachment.kind === "image" && "dataUrl" in preparedAttachment.attachment) {
		const { dataUrl } = preparedAttachment.attachment
		void describeChatRoomImage(attachmentId, userId, dataUrl)
	}
}

// the background description of a shared image, filling the row carl's turns read
async function describeChatRoomImage(attachmentId: string, userId: string, dataUrl: string): Promise<void> {
	try {
		// the description fills the row's context and marks it ready
		const [uploader] = await db.select({ key: users.litellmVirtualKey }).from(users).where(eq(users.id, userId))
		const context = await generateImageContext(dataUrl, uploader?.key ?? undefined)
		await db
			.update(chatRoomAttachments)
			.set({ context: encryptChatText(context), status: "ready" })
			.where(eq(chatRoomAttachments.id, attachmentId))
	} catch (error) {
		// a failed description is saved to the chat room attachment row, so carl's turns skip it instead of reading an empty one
		console.error(`room image description failed for attachment ${attachmentId}`, error)
		await db.update(chatRoomAttachments).set({ status: "failed" }).where(eq(chatRoomAttachments.id, attachmentId))
	}
}
