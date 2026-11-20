// the update count that a push sets as the app icon badge: a user's unseen chat mentions, unread note edits and
// comments, and the topic invitations waiting for an answer, counted for many users at once
import { and, count, countDistinct, eq, inArray, isNull, or, type SQL } from "drizzle-orm"
import { toNotUserBlockedAuthorFilter, toTeamHoldsTopicFilter, toUnreportedFilter } from "./contentFilters"
import { db } from "./index"
import { JOINED_USER_INVITE_ADDRESS, toPendingTopicInviteFilter } from "./inviteFilters"
import { loadNoteCounts } from "./noteBadges"
import { chatRoomMentions, chatRoomMessages } from "./schema/chat"
import { invites } from "./schema/invites"
import { teamMembers } from "./schema/teams"
import { topics } from "./schema/topics"
import { users } from "./schema/users"

/**
 * Returns the filter for the unseen chat mentions of one user, or of each of several users, leaving out a mention by a
 * person the mentioned user blocked and one in a chat message that user reported.
 */
export function toUnseenChatMentionFilter(userIds: string | string[]): SQL | undefined {
	// one user's blocks and reports are read by their id, and several users' by each mention's own user
	const mentionedUserId = typeof userIds === "string" ? userIds : chatRoomMentions.userId
	return and(
		typeof userIds === "string" ? eq(chatRoomMentions.userId, userIds) : inArray(chatRoomMentions.userId, userIds),
		isNull(chatRoomMentions.seenAt),
		toNotUserBlockedAuthorFilter(mentionedUserId, chatRoomMessages.authorUserId),
		toUnreportedFilter(mentionedUserId, "chatMessage", chatRoomMessages.id),
	)
}

/**
 * Loads the update count of each given user in three grouped reads: the unseen chat mentions in the chat rooms of their
 * teams, their unread note edits and comments, and their pending topic invitations, one per topic. A user with nothing
 * waiting counts 0.
 */
export async function loadUpdateCounts(userIds: string[]): Promise<Map<string, number>> {
	// no user reads nothing
	if (userIds.length === 0) {
		return new Map()
	}

	// the three parts together, each grouped by user
	const [chatMentionCounts, noteCounts, topicInviteCounts] = await Promise.all([
		loadChatMentionCounts(userIds),
		loadNoteCounts(userIds),
		loadTopicInviteCounts(userIds),
	])

	// sum each user's parts
	const toUpdateCount = (userId: string): number =>
		(chatMentionCounts.get(userId) ?? 0) + (noteCounts.get(userId) ?? 0) + (topicInviteCounts.get(userId) ?? 0)
	return new Map(userIds.map((userId) => [userId, toUpdateCount(userId)]))
}

// each user's unseen chat mentions in the chat rooms of the teams they are an active member of: a team's own chat
// room, and its room of each topic that the same team still owns or holds a share of
async function loadChatMentionCounts(userIds: string[]): Promise<Map<string, number>> {
	// a mention counts only in a chat room of a team that its user is still an active member of
	const isActiveMember = and(
		eq(teamMembers.userId, chatRoomMentions.userId),
		eq(teamMembers.teamId, chatRoomMessages.teamId),
		eq(teamMembers.isActive, true),
	)
	const chatRoomFilter = or(
		isNull(chatRoomMessages.topicId),
		toTeamHoldsTopicFilter(chatRoomMessages.teamId, chatRoomMessages.topicId),
	)

	// count the mentions by their user
	const chatMentionRows = await db
		.select({ userId: chatRoomMentions.userId, chatMentionCount: count() })
		.from(chatRoomMentions)
		.innerJoin(chatRoomMessages, eq(chatRoomMentions.messageId, chatRoomMessages.id))
		.innerJoin(teamMembers, isActiveMember)
		.where(and(toUnseenChatMentionFilter(userIds), chatRoomFilter))
		.groupBy(chatRoomMentions.userId)

	// each user's count under their id
	return new Map(chatMentionRows.map((chatMentionRow) => [chatMentionRow.userId, chatMentionRow.chatMentionCount]))
}

// each user's topics with an invitation waiting for their answer. an email and a username invitation to one topic
// count once, as the Activity page shows one row
async function loadTopicInviteCounts(userIds: string[]): Promise<Map<string, number>> {
	// join each waiting invitation to the user it addresses, and count that user's topics once each
	const topicInviteRows = await db
		.select({ userId: users.id, topicInviteCount: countDistinct(invites.topicId) })
		.from(invites)
		.innerJoin(topics, eq(topics.id, invites.topicId))
		.innerJoin(users, inArray(users.id, userIds))
		.where(toPendingTopicInviteFilter(JOINED_USER_INVITE_ADDRESS))
		.groupBy(users.id)

	// each user's count under their id
	return new Map(topicInviteRows.map((topicInviteRow) => [topicInviteRow.userId, topicInviteRow.topicInviteCount]))
}
