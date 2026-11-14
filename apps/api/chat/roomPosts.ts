// the chat room post: the Terms, the chat room's access, the text and image moderation, and then the post, whose daily
// spend cutoff and budget gate decide Carl's chat turn
import { CHAT_ROOM_ATTACHMENT_ERRORS } from "@carlnotes/contracts/chat"
import type { ModerationCategory } from "@carlnotes/contracts/moderation"
import type { ChatAttachment } from "@carlnotes/contracts/payloads"
import type { AnalyticsProperties } from "../currentUser"
import { toObjectionableCategory, toObjectionableImageCategory } from "../moderation"
import { postChatRoomMessage } from "./room"
import { loadChatRoom } from "./roomAccess"

// a chat room post as the poster sent it
export type ChatRoomPost = {
	// the poster, and whether they accepted the published Terms
	userId: string
	isTermsCurrent: boolean
	// the chat room, a topic id of null for the team's own
	topicId: string | null
	teamId: string
	// the chat message, what it replies to, its shared files, and how it reports
	content: string
	replyToChatMessageId: number | null
	attachments: ChatAttachment[]
	analyticsProperties: AnalyticsProperties
	isSpoken?: boolean
}

// the error a rejected shared file names
type ChatRoomAttachmentError = (typeof CHAT_ROOM_ATTACHMENT_ERRORS)[keyof typeof CHAT_ROOM_ATTACHMENT_ERRORS]

// how a post ends: posted, a message to Carl rejected privately before anything posted, or why nothing posted
export type ChatRoomPostResult =
	| { status: "posted"; chatMessageId: number; rejectionReason: string | null }
	| { status: "notFound" }
	| { status: "termsOutdated" }
	| { status: "objectionable"; category: ModerationCategory }
	| { status: "attachmentRejected"; error: ChatRoomAttachmentError }

// the category of the first shared image that reads as a violation, unreadable if the moderation could not read one, or
// null if every image may post. an image whose check could not run posts, as a clean one does, because only a room's
// members see it. the images are checked in parallel
async function toObjectionableRoomImageCategory(
	attachments: ChatAttachment[],
	subjectId: string,
): Promise<ModerationCategory | "unreadable" | null> {
	const imageCategories = await Promise.all(
		attachments.flatMap((attachment) =>
			attachment.kind === "image"
				? [toObjectionableImageCategory({ dataUrl: attachment.dataUrl, subjectKind: "chatRoomImage", subjectId })]
				: [],
		),
	)
	const objectionableCategory = imageCategories.find(
		(imageCategory): imageCategory is ModerationCategory =>
			imageCategory !== null && imageCategory !== "unreadable" && imageCategory !== "unchecked",
	)
	return objectionableCategory ?? (imageCategories.includes("unreadable") ? "unreadable" : null)
}

/**
 * Posts a chat message to a chat room after the Terms, the chat room's access, and the moderation of its text and
 * shared images, or returns why nothing posted.
 */
export async function postCheckedChatRoomMessage({
	userId,
	isTermsCurrent,
	topicId,
	teamId,
	content,
	replyToChatMessageId,
	attachments,
	analyticsProperties,
	isSpoken,
}: ChatRoomPost): Promise<ChatRoomPostResult> {
	// a member who has not accepted the current Terms is asked to first
	if (!isTermsCurrent) {
		return { status: "termsOutdated" }
	}

	// a chat room this user may not post to reads as missing, before any moderation call is spent on the post
	if (!(await loadChatRoom(userId, topicId, teamId))) {
		return { status: "notFound" }
	}

	// a message that reads as a violation is rejected before anything posts. the room's topic and team ids name the check
	// in a failure report
	const moderationSubjectId = `${topicId ?? "team"}:${teamId}`
	const objectionableCategory = await toObjectionableCategory({
		text: content,
		textKind: "a chat room message",
		subjectKind: "chatMessage",
		subjectId: moderationSubjectId,
	})
	if (objectionableCategory) {
		return { status: "objectionable", category: objectionableCategory }
	}

	// a shared image that reads as a violation rejects the whole post the same way, before anything stores. an image
	// the moderation could not read is rejected like any other file that cannot be read
	const objectionableImageCategory = await toObjectionableRoomImageCategory(attachments, moderationSubjectId)
	if (objectionableImageCategory === "unreadable") {
		return { status: "attachmentRejected", error: CHAT_ROOM_ATTACHMENT_ERRORS.attachmentRejected }
	}
	if (objectionableImageCategory) {
		return { status: "objectionable", category: objectionableImageCategory }
	}

	// one rejected file rejects the whole chat message, and a chat room this user may not use reads as missing
	const postChatMessageResult = await postChatRoomMessage(
		userId,
		topicId,
		teamId,
		content,
		replyToChatMessageId,
		attachments,
		{ analyticsProperties, isSpoken },
	)
	if (typeof postChatMessageResult === "string") {
		return { status: "attachmentRejected", error: CHAT_ROOM_ATTACHMENT_ERRORS[postChatMessageResult] }
	}
	return postChatMessageResult ? { status: "posted", ...postChatMessageResult } : { status: "notFound" }
}
