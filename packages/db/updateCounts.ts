// a user's update count, the sum the apps badge their icon with: unseen chat mentions, unread note edits and comments,
// and the topic invitations waiting for an answer
import { and, count, countDistinct, eq, inArray, isNull, or, type SQL } from "drizzle-orm"
import { toUnblockedAuthorFilter, toUnreportedFilter } from "./contentFilters"
import { db } from "./index"
import { loadUserEmail, toPendingTopicInviteFilter } from "./inviteFilters"
import { loadBadgedPages, loadNoteBadges } from "./noteBadges"
import { chatRoomMentions, chatRoomMessages } from "./schema/chat"
import { invites } from "./schema/invites"
import { topics } from "./schema/topics"

/**
 * The filter for a user's unseen chat mentions, leaving out a mention by a person they blocked and one in a chat
 * message they reported.
 */
export function toUnseenChatMentionFilter(userId: string): SQL | undefined {
	return and(
		eq(chatRoomMentions.userId, userId),
		isNull(chatRoomMentions.seenAt),
		toUnblockedAuthorFilter(userId, chatRoomMessages.authorUserId),
		toUnreportedFilter(userId, "chatMessage", chatRoomMessages.id),
	)
}

/**
 * Loads a user's update count: the chat mentions in the chat rooms of their teams, the note badges, and the pending
 * topic invitations, one per topic.
 */
export async function loadUpdateCount(userId: string): Promise<number> {
	// load the three parts together, and sum each note's edit and comment counts
	const [chatMentionCount, noteBadges, topicInviteCount] = await Promise.all([
		loadChatMentionCount(userId),
		loadNoteBadges(userId),
		loadTopicInviteCount(userId),
	])
	const noteCount = noteBadges.reduce((sum, noteBadge) => sum + noteBadge.unreadEdits + noteBadge.unreadComments, 0)
	return chatMentionCount + noteCount + topicInviteCount
}

// the unseen chat mentions in a team's own chat room and in the chat rooms of the topics the user's teams hold
async function loadChatMentionCount(userId: string): Promise<number> {
	// a user on no team has no chat rooms
	const { topicIds, teamIds } = await loadBadgedPages(userId)
	if (teamIds.length === 0) {
		return 0
	}

	// count the mentions in those chat rooms
	const chatRoomFilter = or(
		and(isNull(chatRoomMessages.topicId), inArray(chatRoomMessages.teamId, teamIds)),
		topicIds.length > 0 ? inArray(chatRoomMessages.topicId, topicIds) : undefined,
	)
	const [chatMentionRow] = await db
		.select({ chatMentionCount: count() })
		.from(chatRoomMentions)
		.innerJoin(chatRoomMessages, eq(chatRoomMentions.messageId, chatRoomMessages.id))
		.where(and(toUnseenChatMentionFilter(userId), chatRoomFilter))
	return chatMentionRow?.chatMentionCount ?? 0
}

// the topics with an invitation waiting for the user's answer, since an email and a username invitation to one topic
// count once
async function loadTopicInviteCount(userId: string): Promise<number> {
	// a missing user has no invitations
	const userEmail = await loadUserEmail(userId)
	if (!userEmail) {
		return 0
	}

	// count each topic with a pending invitation once
	const [topicInviteRow] = await db
		.select({ topicInviteCount: countDistinct(invites.topicId) })
		.from(invites)
		.innerJoin(topics, eq(topics.id, invites.topicId))
		.where(toPendingTopicInviteFilter({ userId, ...userEmail }))
	return topicInviteRow?.topicInviteCount ?? 0
}
