// the chat room deletes: clearing a room, deleting one message or one shared file, and the file download behind the
// delete's permission check

import { db } from "@carlnotes/db"
import { chatRoomAttachments, chatRoomMessages, chatRoomSummaries } from "@carlnotes/db/schema/chat"
import { attachmentStream, deleteStoredObjects } from "@carlnotes/db/store"
import { and, eq } from "drizzle-orm"
import type { Context } from "hono"
import { isLeaderRole, loadUserAccess } from "../authorization"
import { currentUser } from "../currentUser"
import { toTeamRole } from "../team/members"
import { toStoredFileHeaders } from "../topic/attachments"
import { streamVideoAttachment } from "./chatAttachmentReads"
import { decryptChatText } from "./encryption"
import { loadChatRoom, toTopicFilter } from "./roomAccess"
import { deleteChatRoomAttachmentRows } from "./roomAttachments"

// a team leader or an admin clears the chat room for the whole team
export async function clearChatRoom(context: Context, topicId: string | null, teamId: string): Promise<Response> {
	const userId = currentUser(context)
	const chatRoom = await loadChatRoom(userId, topicId, teamId)
	if (!userId || !chatRoom) {
		return context.json({ error: "not found" }, 404)
	}

	// clearing belongs to a leader of the team, and to an admin moderating it
	const isTeamLeader = isLeaderRole(await toTeamRole(userId, chatRoom.teamId))
	if (!isTeamLeader && !(await loadUserAccess(userId)).isAdmin) {
		return context.json({ error: "not found" }, 404)
	}

	// delete the shared files' rows and record their keys, then the chat messages with their mentions, and the summary,
	// in one transaction. shared text has no stored object, so only the file rows reach storage
	const objectKeys = await db.transaction(async (transaction) => {
		// the shared files' rows, with their keys as pending
		const objectKeys = await deleteChatRoomAttachmentRows(
			transaction,
			and(toTopicFilter(chatRoomAttachments.topicId, topicId), eq(chatRoomAttachments.teamId, chatRoom.teamId)),
		)

		// the chat messages and the summary
		await transaction
			.delete(chatRoomMessages)
			.where(and(toTopicFilter(chatRoomMessages.topicId, topicId), eq(chatRoomMessages.teamId, chatRoom.teamId)))
		await transaction
			.delete(chatRoomSummaries)
			.where(and(toTopicFilter(chatRoomSummaries.topicId, topicId), eq(chatRoomSummaries.teamId, chatRoom.teamId)))
		return objectKeys
	})

	// delete the objects once the rows are gone
	await deleteStoredObjects(objectKeys)
	return context.json({ ok: true })
}

// a shared file streams back to any member, under the same gate the chat room itself uses
export async function downloadChatRoomAttachment(
	context: Context,
	chatRoomAttachment: typeof chatRoomAttachments.$inferSelect,
): Promise<Response> {
	// shared text has no stored object, so its text comes back as a plain text file
	if (!chatRoomAttachment.objectKey) {
		const text = decryptChatText(chatRoomAttachment.context) ?? ""
		return context.body(text, 200, toStoredFileHeaders(`${chatRoomAttachment.name}.txt`, "text/plain; charset=utf-8"))
	}

	// a video shows inline so the bubble's player can stream it. everything else stays a download
	if (chatRoomAttachment.kind === "video") {
		return streamVideoAttachment(context, {
			name: chatRoomAttachment.name,
			objectKey: chatRoomAttachment.objectKey,
			contentType: chatRoomAttachment.contentType ?? "application/octet-stream",
			byteSize: chatRoomAttachment.byteSize,
		})
	}
	return context.body(
		attachmentStream(chatRoomAttachment.objectKey),
		200,
		toStoredFileHeaders(chatRoomAttachment.name, chatRoomAttachment.contentType ?? "application/octet-stream"),
	)
}

// the uploader or a team leader removes a shared file, which drops it from carl's future chat turns
export async function deleteChatRoomAttachment(
	context: Context,
	userId: string,
	chatRoomAttachment: typeof chatRoomAttachments.$inferSelect,
): Promise<Response> {
	// the uploader removes their own file, and a leader removes anyone's
	if (
		chatRoomAttachment.uploaderUserId !== userId &&
		!isLeaderRole(await toTeamRole(userId, chatRoomAttachment.teamId))
	) {
		return context.json({ error: "not found" }, 404)
	}

	// delete the row with its key recorded in one transaction, then delete the object
	const objectKeys = await db.transaction((transaction) =>
		deleteChatRoomAttachmentRows(transaction, eq(chatRoomAttachments.id, chatRoomAttachment.id)),
	)
	await deleteStoredObjects(objectKeys)
	return context.json({ ok: true })
}

/**
 * Whether the user may delete one chat room message: its author, a leader of its team, or an admin.
 */
export function canDeleteChatRoomMessage(
	userId: string,
	authorUserId: string | null,
	teamRole: "leader" | "member" | null,
	isAdmin: boolean,
): boolean {
	return authorUserId === userId || isLeaderRole(teamRole) || isAdmin
}

/**
 * Delete a chat room message, taking its shared files with it. Its author, a leader of its team, or an admin.
 */
export async function deleteChatRoomMessage(
	context: Context,
	userId: string,
	chatRoomMessage: typeof chatRoomMessages.$inferSelect,
): Promise<Response> {
	// the team role and the admin flag are only read when the user is not the chat message's own author
	const isAuthor = chatRoomMessage.authorUserId === userId
	const teamRole = isAuthor ? null : await toTeamRole(userId, chatRoomMessage.teamId)
	const isAdmin = isAuthor || isLeaderRole(teamRole) ? false : (await loadUserAccess(userId)).isAdmin
	if (!canDeleteChatRoomMessage(userId, chatRoomMessage.authorUserId, teamRole, isAdmin)) {
		return context.json({ error: "not found" }, 404)
	}

	// delete the shared file rows, which no foreign key takes along, record their keys, and delete the chat message,
	// which takes its chat mention rows with it, in one transaction
	const objectKeys = await db.transaction(async (transaction) => {
		// the shared file rows, with their keys as pending
		const objectKeys = await deleteChatRoomAttachmentRows(
			transaction,
			eq(chatRoomAttachments.messageId, chatRoomMessage.id),
		)

		// the chat message
		await transaction.delete(chatRoomMessages).where(eq(chatRoomMessages.id, chatRoomMessage.id))
		return objectKeys
	})

	// delete the objects once the rows are gone
	await deleteStoredObjects(objectKeys)
	return context.json({ ok: true })
}

// one chat message by id, gated by its own chat room's membership rule
export async function loadChatRoomMessage(
	context: Context,
	topicId: string | null,
	chatMessageId: string,
): Promise<typeof chatRoomMessages.$inferSelect | null> {
	// a non-numeric id never matches a row, and the column is a bigint
	const numericMessageId = Number(chatMessageId)
	if (!Number.isSafeInteger(numericMessageId)) {
		return null
	}

	const [chatRoomMessage] = await db
		.select()
		.from(chatRoomMessages)
		.where(and(eq(chatRoomMessages.id, numericMessageId), toTopicFilter(chatRoomMessages.topicId, topicId)))

	// the membership gate decides for the row's own chat room
	const userId = currentUser(context)
	if (!chatRoomMessage || !userId || !(await loadChatRoom(userId, topicId, chatRoomMessage.teamId))) {
		return null
	}
	return chatRoomMessage
}

// one shared-file row by id under its chat room's own gate, or null if either rejects the user
export async function loadChatRoomAttachment(
	context: Context,
	topicId: string | null,
	attachmentId: string,
): Promise<typeof chatRoomAttachments.$inferSelect | null> {
	// the row names its chat room, and the chat room's own gate decides the access
	const [chatRoomAttachment] = await db
		.select()
		.from(chatRoomAttachments)
		.where(and(eq(chatRoomAttachments.id, attachmentId), toTopicFilter(chatRoomAttachments.topicId, topicId)))
	// the membership gate decides for the row's own chat room
	const userId = currentUser(context)
	if (!chatRoomAttachment || !userId || !(await loadChatRoom(userId, topicId, chatRoomAttachment.teamId))) {
		return null
	}
	return chatRoomAttachment
}
