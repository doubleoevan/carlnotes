import type { PushNotificationKind } from "@carlnotes/contracts/pushDevices"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { db } from "@carlnotes/db"
import { toUnblockedAuthorFilter, toUnreportedFilter } from "@carlnotes/db/contentFilters"
import { chatRoomMentions, chatRoomMessages } from "@carlnotes/db/schema/chat"
import { pushDevices } from "@carlnotes/db/schema/pushDevices"
import { scans } from "@carlnotes/db/schema/scans"
import { teamMembers, teams, teamTopics } from "@carlnotes/db/schema/teams"
import { topics } from "@carlnotes/db/schema/topics"
import { sessions, users } from "@carlnotes/db/schema/users"
import { appBaseUrl } from "@carlnotes/server/appUrl"
import { and, eq, gt, inArray, ne, type SQLWrapper, sql } from "drizzle-orm"
import { toDigestSubscriberIdsQuery } from "./notify"
import { deliverPushes, type PushOutcome, type PushProgress, UNWATCHED_PUSH_PROGRESS } from "./pushDelivery"
import { toChatMentionPushBody, toScanPushBody } from "./pushNotificationCopy"
import { newFindingsForScan } from "./scanEmailContent"

// one live phone of a recipient
type LivePushDevice = { pushDeviceId: string; expoPushToken: string; recipientUserId: string }

/**
 * Pushes a scheduled Scan's new Findings to the Scan's digest recipients who turned Topic pushes on, one push per
 * live phone. Skips a Scan that did not succeed, has no new Findings, or whose Topic is gone.
 */
export async function sendScanPush(
	scanId: string,
	pushProgress: PushProgress = UNWATCHED_PUSH_PROGRESS,
): Promise<PushOutcome> {
	// a Scan and its Topic, if the Topic still exists
	const [scanTopic] = await db
		.select({ status: scans.status, topic: { id: topics.id, name: topics.name } })
		.from(scans)
		.innerJoin(topics, eq(scans.topicId, topics.id))
		.where(eq(scans.id, scanId))

	// a push opens a site link, so an app with no base url sends none
	const appUrl = appBaseUrl()
	if (scanTopic?.status !== "succeeded" || !appUrl) {
		return { outcome: "skipped" }
	}

	// a Scan that kept nothing new sends no push
	const newFindings = await newFindingsForScan(scanId)
	if (newFindings.length === 0) {
		return { outcome: "skipped" }
	}

	// the digest's recipients who turned Topic pushes on, at each live phone
	const { topic } = scanTopic
	const livePushDevices = await loadLivePushDevices(toDigestSubscriberIdsQuery(topic.id), "topic-scan")

	// every phone gets the same push, which opens the Topic
	const body = toScanPushBody(newFindings.length, newFindings[0]?.title ?? null)
	const url = `${appUrl}${toTopicPath(topic)}`
	const pushTargets = livePushDevices.map((livePushDevice) => ({ ...livePushDevice, title: topic.name, body, url }))
	return deliverPushes({ kind: "topic-scan", scanId }, pushTargets, pushProgress)
}

/**
 * Pushes a room message's chat mentions to each member it mentioned or replied to who turned mention pushes on, one
 * push per live phone. Access is checked as the push sends: the member is still on the Team, the room's Topic is
 * still the Team's, and the member has neither blocked the author nor reported the message. The author is never pushed.
 */
export async function sendChatMentionPush(
	chatMessageId: number,
	pushProgress: PushProgress = UNWATCHED_PUSH_PROGRESS,
): Promise<PushOutcome> {
	// the message with its room's name, or nothing if it was deleted
	const [chatMessage] = await db
		.select({
			teamId: chatRoomMessages.teamId,
			topicId: chatRoomMessages.topicId,
			authorUserId: chatRoomMessages.authorUserId,
			authorUsername: chatRoomMessages.authorUsername,
			replyToMessageId: chatRoomMessages.replyToMessageId,
			topicName: topics.name,
			teamName: teams.name,
		})
		.from(chatRoomMessages)
		.innerJoin(teams, eq(chatRoomMessages.teamId, teams.id))
		.leftJoin(topics, eq(chatRoomMessages.topicId, topics.id))
		.where(eq(chatRoomMessages.id, chatMessageId))

	// a deleted message, a room the Team no longer holds, and an app with no base url send nothing
	const appUrl = appBaseUrl()
	if (!chatMessage || !appUrl || !(await isChatRoomHeld(chatMessage))) {
		return { outcome: "skipped" }
	}

	// the members the message named who may still read it, and who it replied to
	const [mentionedUserIds, repliedToUserId] = await Promise.all([
		loadReachableMentionedUserIds(chatMessageId, chatMessage),
		loadRepliedToUserId(chatMessage.replyToMessageId),
	])
	const livePushDevices = await loadLivePushDevices(mentionedUserIds, "chat-mention")

	// each push names the room and says who mentioned or replied, never the message, and opens the room
	const title = chatMessage.topicName ?? chatMessage.teamName
	const url = chatMessage.topicId
		? `${appUrl}/topics/${chatMessage.topicId}/chat?chatTeamId=${chatMessage.teamId}`
		: `${appUrl}/teams/${chatMessage.teamId}/chat`
	const pushTargets = livePushDevices.map((livePushDevice) => ({
		...livePushDevice,
		title,
		body: toChatMentionPushBody(chatMessage.authorUsername, livePushDevice.recipientUserId === repliedToUserId),
		url,
	}))
	return deliverPushes({ kind: "chat-mention", chatMessageId }, pushTargets, pushProgress)
}

// whether the chat message's room is still its Team's: the Team's own room, or a Topic the Team still holds
async function isChatRoomHeld({ teamId, topicId }: { teamId: string; topicId: string | null }): Promise<boolean> {
	if (!topicId) {
		return true
	}

	// a Topic's room stays open while the Team holds the Topic
	const heldTopicRows = await db
		.select({ topicId: teamTopics.topicId })
		.from(teamTopics)
		.where(and(eq(teamTopics.teamId, teamId), eq(teamTopics.topicId, topicId)))
	return heldTopicRows.length > 0
}

// the message's author, and the Team whose members may read it
type MentionChatMessage = { teamId: string; authorUserId: string | null }

// the members a message mentioned who are still on its Team, are not its author, have not blocked the author, and
// have not reported the message
async function loadReachableMentionedUserIds(
	chatMessageId: number,
	{ teamId, authorUserId }: MentionChatMessage,
): Promise<string[]> {
	const mentionedUserRows = await db
		.select({ userId: chatRoomMentions.userId })
		.from(chatRoomMentions)
		.innerJoin(
			teamMembers,
			and(
				eq(teamMembers.teamId, teamId),
				eq(teamMembers.userId, chatRoomMentions.userId),
				eq(teamMembers.isActive, true),
			),
		)
		.where(
			and(
				eq(chatRoomMentions.messageId, chatMessageId),
				authorUserId ? ne(chatRoomMentions.userId, authorUserId) : undefined,
				toUnblockedAuthorFilter(chatRoomMentions.userId, sql`${authorUserId}`),
				toUnreportedFilter(chatRoomMentions.userId, "chatMessage", sql`${chatMessageId}`),
			),
		)
	return mentionedUserRows.map((mentionedUserRow) => mentionedUserRow.userId)
}

// the author of the message a reply answers, or null for a message that answers none
async function loadRepliedToUserId(replyToMessageId: number | null): Promise<string | null> {
	if (replyToMessageId === null) {
		return null
	}

	// the replied-to message's author, null once their account closed
	const [repliedToRow] = await db
		.select({ authorUserId: chatRoomMessages.authorUserId })
		.from(chatRoomMessages)
		.where(eq(chatRoomMessages.id, replyToMessageId))
	return repliedToRow?.authorUserId ?? null
}

// the phones of the given users who turned this kind on, each bound to a session that has not ended
async function loadLivePushDevices(
	userIds: string[] | SQLWrapper,
	kind: PushNotificationKind,
): Promise<LivePushDevice[]> {
	if (Array.isArray(userIds) && userIds.length === 0) {
		return []
	}

	// a phone's session must still be live, since an expired row can outlast its session until it is cleaned up
	const pushPreferenceColumn = kind === "topic-scan" ? users.isTopicPushEnabled : users.isChatMentionPushEnabled
	return db
		.select({
			pushDeviceId: pushDevices.id,
			expoPushToken: pushDevices.expoPushToken,
			recipientUserId: pushDevices.userId,
		})
		.from(pushDevices)
		.innerJoin(sessions, eq(pushDevices.sessionId, sessions.id))
		.innerJoin(users, eq(pushDevices.userId, users.id))
		.where(
			and(inArray(pushDevices.userId, userIds), gt(sessions.expiresAt, new Date()), eq(pushPreferenceColumn, true)),
		)
}
