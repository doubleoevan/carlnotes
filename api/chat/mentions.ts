// the chat room mentions api helpers to update the badge counts
import { toMentionedUserIds } from "@shared/chatMentions"
import type { ChatMention } from "@shared/contracts"
import { and, desc, eq, inArray, isNull } from "drizzle-orm"
import { db } from "../../db"
import { chatRoomMentions, chatRoomMessages, teamMembers, users } from "../../db/schema"
import { decryptChatText } from "./encryption"
import { toTopicFilter } from "./roomTurns"

// how much of the chat message the badge tooltip shows
const CHAT_MESSAGE_SNIPPET_LENGTH = 120

/**
 * The chat mention rows a chat message writes: one per team member the chat message names, plus the author of the replied-to chat message.
 * Carl does not have a team member row, and the room-wide @all reaches every team member without naming them.
 */
export async function saveChatMentions(
	teamId: string,
	senderId: string,
	chatMessageId: number,
	chatMessage: string,
	replyToChatMessageId: number | null,
): Promise<void> {
	// every notified member becomes one row, inserted in a single statement
	const teamMembers = await teamMemberUsernames(teamId)
	const mentionedUserIds = new Set(toMentionedUserIds(chatMessage, teamMembers, senderId))

	// a reply notifies the replied-to user like a chat mention would
	const repliedToUserId = await toRepliedToUserId(replyToChatMessageId)
	if (
		repliedToUserId &&
		repliedToUserId !== senderId &&
		teamMembers.some((teamMember) => teamMember.userId === repliedToUserId)
	) {
		mentionedUserIds.add(repliedToUserId)
	}

	// insert all mentioned users letting the database dedup
	if (mentionedUserIds.size > 0) {
		await db
			.insert(chatRoomMentions)
			.values([...mentionedUserIds].map((userId) => ({ messageId: chatMessageId, userId })))
			.onConflictDoNothing()
	}
}

/**
 * Returns unseen chat mention mapped to a topic id for this user.
 */
export async function loadTopicChatMentions(
	userId: string | null,
	topicIds: string[],
): Promise<Map<string, ChatMention[]>> {
	if (!userId || topicIds.length === 0) {
		return new Map()
	}

	// every unseen chat mention row for these topics for this user
	const repliedChatMessages = db
		.select({ id: chatRoomMessages.id, authorUserId: chatRoomMessages.authorUserId })
		.from(chatRoomMessages)
		.as("replied_to")
	const chatMentionRows = await db
		.select({
			topicId: chatRoomMessages.topicId,
			teamId: chatRoomMessages.teamId,
			chatMessageId: chatRoomMessages.id,
			authorUsername: chatRoomMessages.authorUsername,
			content: chatRoomMessages.content,
			repliedToUserId: repliedChatMessages.authorUserId,
		})
		.from(chatRoomMentions)
		.innerJoin(chatRoomMessages, eq(chatRoomMentions.messageId, chatRoomMessages.id))
		.leftJoin(repliedChatMessages, eq(chatRoomMessages.replyToMessageId, repliedChatMessages.id))
		.where(
			and(
				eq(chatRoomMentions.userId, userId),
				isNull(chatRoomMentions.seenAt),
				inArray(chatRoomMessages.topicId, topicIds),
			),
		)
		.orderBy(desc(chatRoomMessages.id))

	// return a map of unseen chat mentions mapped to a topic id for this user
	const chatMentionsByTopicId = new Map<string, ChatMention[]>()
	for (const chatMentionRow of chatMentionRows) {
		if (chatMentionRow.topicId === null) {
			continue
		}
		const chatMentions = chatMentionsByTopicId.get(chatMentionRow.topicId) ?? []
		chatMentions.push({
			teamId: chatMentionRow.teamId,
			authorUsername: chatMentionRow.authorUsername,
			isReply: chatMentionRow.repliedToUserId === userId,
			excerpt: (decryptChatText(chatMentionRow.content) ?? "").slice(0, CHAT_MESSAGE_SNIPPET_LENGTH),
		})
		chatMentionsByTopicId.set(chatMentionRow.topicId, chatMentions)
	}
	return chatMentionsByTopicId
}

/**
 * Save the chat mentions as seen for a user and topic or team chat.
 */
export async function saveSeenChatMentions(userId: string, topicId: string | null, teamId: string): Promise<void> {
	// the chat room messages for a topic or team chat
	const chatRoomMessageIds = db
		.select({ id: chatRoomMessages.id })
		.from(chatRoomMessages)
		.where(and(toTopicFilter(chatRoomMessages.topicId, topicId), eq(chatRoomMessages.teamId, teamId)))

	// save the seen at date for the chat room mentions that match the chat message ids
	await db
		.update(chatRoomMentions)
		.set({ seenAt: new Date() })
		.where(
			and(
				eq(chatRoomMentions.userId, userId),
				isNull(chatRoomMentions.seenAt),
				inArray(chatRoomMentions.messageId, chatRoomMessageIds),
			),
		)
}

// the user id of the author that a chat message was replied to or null for @carl
async function toRepliedToUserId(replyToChatMessageId: number | null): Promise<string | null> {
	if (!replyToChatMessageId) {
		return null
	}
	const [repliedTo] = await db
		.select({ authorUserId: chatRoomMessages.authorUserId })
		.from(chatRoomMessages)
		.where(eq(chatRoomMessages.id, replyToChatMessageId))

	// return the chat message author or null for carl
	return repliedTo?.authorUserId ?? null
}

// the active team members' usernames, keyed by user id who have access to the chat room
async function teamMemberUsernames(teamId: string): Promise<{ userId: string; username: string }[]> {
	return db
		.select({ userId: users.id, username: users.username })
		.from(teamMembers)
		.innerJoin(users, eq(users.id, teamMembers.userId))
		.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.isActive, true)))
}

/**
 Returns unseen chat mention mapped to a team id for this user.
 */
export async function loadTeamChatMentions(
	userId: string | null,
	teamIds: string[],
): Promise<Map<string, ChatMention[]>> {
	if (!userId || teamIds.length === 0) {
		return new Map()
	}

	// every unseen row in these teams' own chat rooms, with the replied-to author resolved like the topic read
	const repliedChatMessages = db
		.select({ id: chatRoomMessages.id, authorUserId: chatRoomMessages.authorUserId })
		.from(chatRoomMessages)
		.as("replied_to")
	const chatMentionRows = await db
		.select({
			teamId: chatRoomMessages.teamId,
			authorUsername: chatRoomMessages.authorUsername,
			content: chatRoomMessages.content,
			repliedToUserId: repliedChatMessages.authorUserId,
		})
		.from(chatRoomMentions)
		.innerJoin(chatRoomMessages, eq(chatRoomMentions.messageId, chatRoomMessages.id))
		.leftJoin(repliedChatMessages, eq(chatRoomMessages.replyToMessageId, repliedChatMessages.id))
		.where(
			and(
				eq(chatRoomMentions.userId, userId),
				isNull(chatRoomMentions.seenAt),
				isNull(chatRoomMessages.topicId),
				inArray(chatRoomMessages.teamId, teamIds),
			),
		)
		.orderBy(desc(chatRoomMessages.id))

	// return a map of unseen chat mentions mapped to a team id for this user
	const chatMentionsByTeamId = new Map<string, ChatMention[]>()
	for (const row of chatMentionRows) {
		const mentions = chatMentionsByTeamId.get(row.teamId) ?? []
		mentions.push({
			teamId: row.teamId,
			authorUsername: row.authorUsername,
			isReply: row.repliedToUserId === userId,
			excerpt: (decryptChatText(row.content) ?? "").slice(0, CHAT_MESSAGE_SNIPPET_LENGTH),
		})
		chatMentionsByTeamId.set(row.teamId, mentions)
	}
	return chatMentionsByTeamId
}
