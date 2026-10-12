// whether a user may take a chat turn on a topic, in a team chat, or in the new-topic chat, and how it is saved
import type { TopicDraftTeam } from "@shared/topicPayloads"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { topics } from "../../db/schema/topics"
import { isAllowed, isLeaderRole, isMonthlySpendExhausted, topicsRemaining } from "../authorization"
import { loadTeamSummaries } from "../team/helpers"
import { toTeamRole } from "../team/members"

// the outcomes of a chat turn request. a spent budget names its user.
// an allowed chat turn names its user, whether the chat turn keeps its text, and what the chat turn may change
export type ChatTurnAuthorization =
	| {
			status: "allowed"
			userId: string
			isTopicOwner: boolean
			isPersisted: boolean
			canEditTopic: boolean
			// how many more topics the plan allows, and the teams that carl may put the topic on.
			// both are set only on the new-topic chat
			topicsRemaining?: number
			leaderTeams?: TopicDraftTeam[]
	  }
	| { status: "signup" }
	| { status: "forbidden" }
	| { status: "budget"; userId: string }

// the error a signed-out visitor's chat request is rejected with
export const SIGNUP_REQUIRED_ERROR = "sign up required"

/**
 * Decides whether this user may take a chat turn on the topic right now, and how that chat turn is saved.
 * A signed-out visitor on a visible topic is sent to signup.
 */
export async function authorizeChatTurn(userId: string | null, topicId: string): Promise<ChatTurnAuthorization> {
	// reject a missing topic the same way as an invisible one
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		return { status: "forbidden" }
	}

	// check visibility first, then sign-in
	if (!(await isAllowed(userId, "topic:view", topic))) {
		return { status: "forbidden" }
	}
	if (!userId) {
		return { status: "signup" }
	}

	// reject a spent budget, the last check for a signed-in user who can see the topic
	if (!(await isAllowed(userId, "chat:send", topic))) {
		return { status: "budget", userId }
	}

	// ask the gate whether the chat turn keeps its text and whether the user may edit the topic
	const [isPersistAllowed, canEditTopic] = await Promise.all([
		isAllowed(userId, "chat:persist"),
		isAllowed(userId, "topic:edit", topic),
	])
	return {
		status: "allowed",
		userId,
		isTopicOwner: topic.ownerId === userId,
		isPersisted: isPersistAllowed,
		canEditTopic,
	}
}

/**
 * Decides whether this user may take a team-wide chat turn: a signed-in, active member under budget.
 */
export async function authorizeTeamChatTurn(userId: string | null, teamId: string): Promise<ChatTurnAuthorization> {
	// send a visitor to signup
	if (!userId) {
		return { status: "signup" }
	}
	// reject a user who is not an active member, then a spent budget
	if ((await toTeamRole(userId, teamId)) === null) {
		return { status: "forbidden" }
	}
	if (await isMonthlySpendExhausted(userId)) {
		return { status: "budget", userId }
	}

	// ask the gate whether the chat turn keeps its text
	const isPersistAllowed = await isAllowed(userId, "chat:persist")
	return { status: "allowed", userId, isTopicOwner: false, isPersisted: isPersistAllowed, canEditTopic: false }
}

/**
 * Decides whether this user may take a chat turn in the new-topic chat.
 * A visitor is sent to signup, and a signed-in user is gated by their monthly spend alone.
 */
export async function authorizeNewTopicChatTurn(userId: string | null): Promise<ChatTurnAuthorization> {
	// send a visitor to signup and reject a user whose budget is spent
	if (!userId) {
		return { status: "signup" }
	}
	if (await isMonthlySpendExhausted(userId)) {
		return { status: "budget", userId }
	}

	// ask the gate whether the chat turn keeps its text.
	// load how many more topics the plan allows and the teams that the user belongs to
	const [isPersistAllowed, remainingTopics, teamSummaries] = await Promise.all([
		isAllowed(userId, "chat:persist"),
		topicsRemaining(userId),
		loadTeamSummaries(userId),
	])
	return {
		status: "allowed",
		userId,
		isTopicOwner: false,
		isPersisted: isPersistAllowed,
		canEditTopic: false,
		topicsRemaining: remainingTopics,
		// the teams that the user leads, which carl may put the topic on
		leaderTeams: teamSummaries
			.filter((teamSummary) => isLeaderRole(teamSummary.role))
			.map((teamSummary) => ({ teamId: teamSummary.teamId, name: teamSummary.name })),
	}
}
