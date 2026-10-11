// the fixtures of the chat room smoke: one run's ids, the seeded people, teams, and topics, the checks, and the cleanup
import { toNormalizedUsername } from "@shared/usernames"
import { count, eq, inArray } from "drizzle-orm"
import { db } from "../../db"
import { chatRoomMessages, chatTurns } from "../../db/schema/chat"
import { teamMembers, teams, teamTopics } from "../../db/schema/teams"
import { subscriptions, topics } from "../../db/schema/topics"
import { users } from "../../db/schema/users"
import { postChatRoomMessage } from "./room"

// one id per run, and every fixture id derives from it, so a parallel run never collides
export const runId = `room-smoke-${Date.now()}-${Math.random().toString(36).slice(2)}`

// the two teams and the two topics: the shared topic both teams hold, and one no team holds
export const topicId = `${runId}-topic`
export const unheldTopicId = `${runId}-unheld`
export const teamAId = `${runId}-team-a`
export const teamBId = `${runId}-team-b`

// the six users, each named for the part it plays: the topic's owner who joins no team, team A's
// leader and the member who leaves it, team B's leader, a subscriber on no team, and a spent budget
export const ownerId = `${runId}-owner`
export const leaderId = `${runId}-leader`
export const removedMemberId = `${runId}-removed-member`
export const otherTeamLeaderId = `${runId}-other-team-leader`
export const subscriberId = `${runId}-subscriber`
export const spenderId = `${runId}-spender`

/** Checks one condition: logs the PASS line, or throws an error so the run fails loud. */
export function check(isPassed: boolean, label: string): void {
	if (!isPassed) {
		throw new Error(`FAIL  ${label}`)
	}
	console.log(`PASS  ${label}`)
}

/** Posts into a chat room on the shared topic and returns the stored chat message id, failing loud on a denial. */
export async function postAsTeamMember(userId: string, chatRoomTeamId: string, content: string): Promise<number> {
	const chatPostResult = await postChatRoomMessage(userId, topicId, chatRoomTeamId, content, null, [])

	// a null, a rejection, or a rejected attachment never stored the message
	if (
		chatPostResult === null ||
		chatPostResult === "attachmentRejected" ||
		chatPostResult === "attachmentLimitReached" ||
		chatPostResult.rejectionReason !== null
	) {
		throw new Error(`FAIL  the post as ${userId} did not store: ${JSON.stringify(chatPostResult)}`)
	}

	// the stored chat message id
	return chatPostResult.chatMessageId
}

/** Counts the chat room messages the shared topic has stored, across both of its chat rooms. */
export async function countChatRoomMessages(): Promise<number> {
	const [messageCountRow] = await db
		.select({ count: count() })
		.from(chatRoomMessages)
		.where(eq(chatRoomMessages.topicId, topicId))
	return messageCountRow?.count ?? -1
}

/** Seeds the people, the teams, the shared topic both teams hold, and a topic no team holds. */
export async function seedFixtures(): Promise<void> {
	// six people sharing the run id. the spender's one-cent override lets one cost row exhaust them
	const labels = ["owner", "leader", "removed-member", "other-team-leader", "subscriber", "spender"] as const
	await db.insert(users).values(
		labels.map((label) => ({
			id: `${runId}-${label}`,
			name: label,
			email: `${runId}-${label}@carlnotes.test`,
			username: `${runId}-${label}`,
			usernameNormalized: toNormalizedUsername(`${runId}-${label}`),
			budgetOverrideCents: label === "spender" ? 1 : null,
		})),
	)

	// two teams, each with the shared topic through a share row, so each has its own chat room on it
	await db.insert(teams).values([
		{ id: teamAId, name: `${runId}-a` },
		{ id: teamBId, name: `${runId}-b` },
	])

	// team A has a leader, the removal target, and the spender. team B has one leader
	await db.insert(teamMembers).values([
		{ teamId: teamAId, userId: leaderId, role: "leader" },
		{ teamId: teamAId, userId: removedMemberId },
		{ teamId: teamAId, userId: spenderId },
		{ teamId: teamBId, userId: otherTeamLeaderId, role: "leader" },
	])

	// both topics belong to the owner, who joins neither team
	await db.insert(topics).values([
		{ id: topicId, ownerId, name: "room smoke topic" },
		{ id: unheldTopicId, ownerId, name: "room smoke unheld topic" },
	])
	await db.insert(teamTopics).values([
		{ teamId: teamAId, topicId },
		{ teamId: teamBId, topicId },
	])

	// a subscription with no membership, and the cost row that exhausts the spender's one-cent budget
	await db.insert(subscriptions).values({ topicId, subscriberUserId: subscriberId })
	await db.insert(chatTurns).values({ userId: spenderId, topicId, cost: "100" })
}

/** Deletes the people, whose rows cascade to the topics, chat rooms, chat mentions, and chat turns. */
export async function cleanupFixtures(): Promise<void> {
	console.log("\n=== cleanup ===")
	await db
		.delete(users)
		.where(inArray(users.id, [ownerId, leaderId, removedMemberId, otherTeamLeaderId, subscriberId, spenderId]))
	await db.delete(teams).where(inArray(teams.id, [teamAId, teamBId]))
	check((await countChatRoomMessages()) === 0, "no room chat message survives the fixture delete")
}
