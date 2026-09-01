// the read path for a team's chat room: loading chat messages, their link preview cards, and the deduped SSE delta
import type { ChatLinkPreview, ChatRoomMessage } from "@shared/contracts"
import { and, asc, desc, eq, gt, inArray } from "drizzle-orm"
import { db } from "../../db"
import { chatRoomAttachments, chatRoomMessages, users } from "../../db/schema"
import { decryptChatText } from "./encryption"
import { loadChatLinkPreviews } from "./linkPreviews"
import { toTopicFilter } from "./roomTurns"

// how many chat messages one load returns
const CHAT_ROOM_LOAD_LIMIT = 500

/**
 * The chat room's chat messages after a cursor, decrypted, oldest first.
 */
export async function loadChatRoomMessages(
	topicId: string | null,
	teamId: string,
	afterChatMessageId: number,
): Promise<ChatRoomMessage[]> {
	// the newest chat messages under a limit, reversed back into id order. the author avatar is null for carl or a closed account
	const newestMessageRows = await db
		.select({ chatMessage: chatRoomMessages, authorAvatarSource: users.avatarSource })
		.from(chatRoomMessages)
		.leftJoin(users, eq(users.id, chatRoomMessages.authorUserId))
		.where(
			and(
				toTopicFilter(chatRoomMessages.topicId, topicId),
				eq(chatRoomMessages.teamId, teamId),
				gt(chatRoomMessages.id, afterChatMessageId),
			),
		)
		.orderBy(desc(chatRoomMessages.id))
		.limit(CHAT_ROOM_LOAD_LIMIT)
	const chatMessageRows = newestMessageRows
		.reverse()
		.map(({ chatMessage, authorAvatarSource }) => ({ ...chatMessage, authorAvatarSource }))

	// each chat message's shared files, fetched once for only the loaded chat messages
	const attachmentRows =
		chatMessageRows.length === 0
			? []
			: await db
					.select({
						id: chatRoomAttachments.id,
						chatMessageId: chatRoomAttachments.messageId,
						kind: chatRoomAttachments.kind,
						name: chatRoomAttachments.name,
					})
					.from(chatRoomAttachments)
					.where(
						and(
							toTopicFilter(chatRoomAttachments.topicId, topicId),
							inArray(
								chatRoomAttachments.messageId,
								chatMessageRows.map((chatMessageRow) => chatMessageRow.id),
							),
						),
					)
					.orderBy(asc(chatRoomAttachments.createdAt))

	// a chat message may share several attachments, so each one's files map to its id in the order they were stored
	const attachmentsByMessageId = new Map<number, typeof attachmentRows>()
	for (const attachmentRow of attachmentRows) {
		attachmentsByMessageId.set(attachmentRow.chatMessageId, [
			...(attachmentsByMessageId.get(attachmentRow.chatMessageId) ?? []),
			attachmentRow,
		])
	}

	// each chat message's text, decrypted once for both the link lookup and the chat message itself
	const contentByChatMessageId = new Map(
		chatMessageRows.map((chatMessageRow) => [chatMessageRow.id, decryptChatText(chatMessageRow.content) ?? ""]),
	)

	// the stored link preview for each chat message's first link, looked up once for the whole batch
	const linkPreviewsByMessageId = await loadChatLinkPreviews(contentByChatMessageId)

	// decrypted chat messages for the team member reading them
	return chatMessageRows.map((chatMessageRow) => {
		const messageAttachments = attachmentsByMessageId.get(chatMessageRow.id) ?? []
		return {
			id: chatMessageRow.id,
			authorUserId: chatMessageRow.authorUserId,
			authorUsername: chatMessageRow.authorUsername,
			authorAvatarSource: chatMessageRow.authorAvatarSource,
			replyToChatMessageId: chatMessageRow.replyToMessageId,
			content: contentByChatMessageId.get(chatMessageRow.id) ?? "",
			createdAt: chatMessageRow.createdAt.toISOString(),
			attachments: messageAttachments.map((attachmentRow) => ({
				id: attachmentRow.id,
				kind: attachmentRow.kind,
				name: attachmentRow.name,
			})),
			linkPreviews: linkPreviewsByMessageId.get(chatMessageRow.id) ?? [],
		}
	})
}

/**
 * The link preview cards for a few of a chat room's chat messages by id, keyed by chat message id. The link preview poll reads
 * only these instead of the whole chat room, so a card landing after a post costs one small query, not a reload.
 */
export async function loadChatRoomMessageLinkPreviews(
	topicId: string | null,
	teamId: string,
	chatMessageIds: number[],
): Promise<Record<number, ChatLinkPreview[]>> {
	// no ids asked for needs no query
	if (chatMessageIds.length === 0) {
		return {}
	}

	// only the asked-for chat messages, scoped to the chat room, decrypted for their own link lookup
	const chatMessageRows = await db
		.select({ id: chatRoomMessages.id, content: chatRoomMessages.content })
		.from(chatRoomMessages)
		.where(
			and(
				toTopicFilter(chatRoomMessages.topicId, topicId),
				eq(chatRoomMessages.teamId, teamId),
				inArray(chatRoomMessages.id, chatMessageIds),
			),
		)
	const contentByChatMessageId = new Map(chatMessageRows.map((row) => [row.id, decryptChatText(row.content) ?? ""]))

	// the stored cards for those chat messages' links, as a plain object the client merges by id
	const linkPreviewsByMessageId = await loadChatLinkPreviews(contentByChatMessageId)
	return Object.fromEntries(linkPreviewsByMessageId)
}

// the chat message ids from a link preview query's comma-separated list, kept to numbers and bounded
export function toChatMessageIds(idsParam: string | undefined): number[] {
	return (idsParam ?? "")
		.split(",")
		.map((id) => Number(id))
		.filter((id) => Number.isInteger(id) && id > 0)
		.slice(0, MESSAGE_PREVIEW_POLL_LIMIT)
}

// how many chat messages one link preview poll may ask about
const MESSAGE_PREVIEW_POLL_LIMIT = 20

// the delta fetches in flight, keyed by topic, team, cursor, and the notified chat message id
const chatRoomDeltasByKey = new Map<string, Promise<ChatRoomMessage[]>>()

// one notification's delta, fetched once for every stream of the chat room on this instance
export function loadChatRoomDeltas(
	topicId: string | null,
	teamId: string,
	afterChatMessageId: number,
	chatMessageId: number,
): Promise<ChatRoomMessage[]> {
	// the notified id keys the fetch too, so a later notification never reuses a stale snapshot
	const key = `${topicId ?? "team"}:${teamId}:${afterChatMessageId}:${chatMessageId}`
	const pendingChatMessages = chatRoomDeltasByKey.get(key)
	if (pendingChatMessages) {
		return pendingChatMessages
	}

	// the fetch clears its slot when it settles
	const chatRoomDeltas = loadChatRoomMessages(topicId, teamId, afterChatMessageId).finally(() =>
		chatRoomDeltasByKey.delete(key),
	)
	chatRoomDeltasByKey.set(key, chatRoomDeltas)
	return chatRoomDeltas
}
