// every chat room one user can open, for the chat panel's switch rooms menu
import type { ChatRoom } from "@shared/contracts"
import { and, count, eq, inArray, isNull } from "drizzle-orm"
import { db } from "../../db"
import { chatRoomMentions, teamMembers, teams, teamTopics, topics } from "../../db/schema"
import { loadTeamChatMentions, loadTopicChatMentions } from "./mentions"

/**
 * The chat rooms a user may open: their teams' own chat rooms, and a chat room per topic those teams hold. Newest first.
 */
export async function loadChatRooms(userId: string): Promise<ChatRoom[]> {
	// the teams the user actively belongs to, which is what opens a chat room
	const teamRows = await db
		.select({ teamId: teams.id, name: teams.name, avatarKey: teams.avatarKey, createdAt: teams.createdAt })
		.from(teamMembers)
		.innerJoin(teams, eq(teams.id, teamMembers.teamId))
		.where(and(eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)))
	if (teamRows.length === 0) {
		return []
	}

	// select each topic owned or shared by a team
	const teamIds = teamRows.map((teamRow) => teamRow.teamId)
	const [ownedTopicRows, sharedTopicRows] = await Promise.all([
		db
			.select({ topicId: topics.id, teamId: topics.teamId, name: topics.name, createdAt: topics.createdAt })
			.from(topics)
			.where(inArray(topics.teamId, teamIds)),
		db
			.select({ topicId: topics.id, teamId: teamTopics.teamId, name: topics.name, createdAt: topics.createdAt })
			.from(teamTopics)
			.innerJoin(topics, eq(topics.id, teamTopics.topicId))
			.where(inArray(teamTopics.teamId, teamIds)),
	])

	// load the team chat mentions and topic chat mentions for this user
	const topicRows = [...ownedTopicRows, ...sharedTopicRows]
	const [teamChatMentions, topicChatMentions] = await Promise.all([
		loadTeamChatMentions(userId, teamIds),
		loadTopicChatMentions(
			userId,
			topicRows.map((topicRow) => topicRow.topicId),
		),
	])

	// a team's own chat room, then the chat rooms of what it holds, all sorted newest first together
	const teamById = new Map(teamRows.map((teamRow) => [teamRow.teamId, teamRow]))
	const chatRooms: (ChatRoom & { createdAt: Date })[] = [
		...teamRows.map((teamRow) => ({
			teamId: teamRow.teamId,
			topicId: null,
			name: teamRow.name,
			teamName: teamRow.name,
			teamHasAvatar: teamRow.avatarKey !== null,
			mentions: teamChatMentions.get(teamRow.teamId) ?? [],
			createdAt: teamRow.createdAt,
		})),
		...topicRows.flatMap((topicRow) =>
			topicRow.teamId
				? [
						{
							teamId: topicRow.teamId,
							topicId: topicRow.topicId,
							name: topicRow.name,
							teamName: teamById.get(topicRow.teamId)?.name ?? "",
							teamHasAvatar: teamById.get(topicRow.teamId)?.avatarKey != null,
							// each room counts only what was said in it, so a topic two teams hold never counts twice in a total
							mentions: (topicChatMentions.get(topicRow.topicId) ?? []).filter(
								(mention) => mention.teamId === topicRow.teamId,
							),
							createdAt: topicRow.createdAt,
						},
					]
				: [],
		),
	]
	return chatRooms
		.sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime())
		.map(({ createdAt: _createdAt, ...room }) => room)
}

/**
 * How many unseen chat mentions the user has across every room, as one indexed count.
 */
export async function countUnseenChatMentions(userId: string): Promise<number> {
	const [chatMentionRow] = await db
		.select({ unseen: count() })
		.from(chatRoomMentions)
		.where(and(eq(chatRoomMentions.userId, userId), isNull(chatRoomMentions.seenAt)))
	return chatMentionRow?.unseen ?? 0
}
