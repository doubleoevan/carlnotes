// whether a user may take a chat turn on a topic, in a team chat, or in the new-topic chat, and how it is saved
import { CHAT_PAUSED_ERROR, EMAIL_UNVERIFIED_ERROR } from "@carlnotes/contracts/chat"
import type { TopicDraftTeam } from "@carlnotes/contracts/topicPayloads"
import { db } from "@carlnotes/db"
import { isUnverifiedAccountLimited, isUserPastDailySpendCutoff } from "@carlnotes/db/dailySpendCutoffs"
import { topics } from "@carlnotes/db/schema/topics"
import { trackEvent } from "@carlnotes/server/analytics"
import { eq } from "drizzle-orm"
import type { Context } from "hono"
import { isAllowed, isLeaderRole, isMonthlySpendExhausted, topicsRemaining } from "../authorization"
import { toAnalyticsProperties } from "../currentUser"
import { loadTeamSummaries } from "../team/helpers"
import { toTeamRole } from "../team/members"
import { type ChatPage, toChatPageId } from "./chatPages"

// the outcomes of a chat turn request. a spent budget names its user, and so do a free user the unverified accounts
// switch limits and a free user past the chat cutoff. an allowed chat turn names its user, whether the chat turn keeps
// its text, and what the chat turn may change
export type ChatTurnAuthorization =
	| {
			status: "allowed"
			userId: string
			isTopicOwner: boolean
			isPersisted: boolean
			canEditTopic: boolean
			// how many more topics the plan allows, and the teams that carl may put the topic on, the default team first.
			// both are set only on the new-topic chat
			topicsRemaining?: number
			leaderTeams?: TopicDraftTeam[]
	  }
	| { status: "signup" }
	| { status: "forbidden" }
	| { status: "budget"; userId: string }
	| { status: "emailUnverified"; userId: string }
	| { status: "chatPaused"; userId: string }

// the rejections that only a free user's chat turn gets: the unverified accounts switch's and the chat cutoff's
type FreeUserChatRejection = Extract<ChatTurnAuthorization, { status: "emailUnverified" | "chatPaused" }>

// the error a signed-out visitor's chat request is rejected with
export const SIGNUP_REQUIRED_ERROR = "sign up required"

// the error that each rejection of a free user's chat turn names
export const FREE_USER_CHAT_REJECTION_ERRORS: Record<FreeUserChatRejection["status"], string> = {
	emailUnverified: EMAIL_UNVERIFIED_ERROR,
	chatPaused: CHAT_PAUSED_ERROR,
}

/**
 * Returns the response for each status that a chat turn, or a voice request on its page, is rejected with.
 */
export function toChatRejection(
	context: Context,
	status: Exclude<ChatTurnAuthorization["status"], "allowed">,
): Response {
	// reject a spent budget
	if (status === "budget") {
		return context.json({ error: "budget exhausted" }, 402)
	}

	// reject a free user the unverified accounts switch limits, and a free user past the chat cutoff
	if (status === "emailUnverified") {
		return context.json({ error: FREE_USER_CHAT_REJECTION_ERRORS.emailUnverified }, 403)
	}
	if (status === "chatPaused") {
		return context.json({ error: FREE_USER_CHAT_REJECTION_ERRORS.chatPaused }, 429)
	}

	// send a visitor to signup
	if (status === "signup") {
		return context.json({ error: SIGNUP_REQUIRED_ERROR }, 401)
	}

	// reject a page this user may not chat on
	return context.json({ error: "forbidden" }, 403)
}

// what a chat turn was rejected for, and the page it was sent on
export type RejectChatTurnOptions = {
	authorization: Exclude<ChatTurnAuthorization, { status: "allowed" }>
	page: ChatPage
}

/**
 * Counts a chat turn that a spent budget stopped, then returns the response for its rejection.
 */
export function rejectChatTurn(context: Context, { authorization, page }: RejectChatTurnOptions): Response {
	if (authorization.status === "budget") {
		trackEvent("chat_budget_reached", authorization.userId, {
			...toAnalyticsProperties(context),
			topicId: toChatPageId(page),
		})
	}
	return toChatRejection(context, authorization.status)
}

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

	// reject a spent budget, then a free user the unverified accounts switch limits or one past the chat cutoff, the
	// last checks for a signed-in user who can see the topic
	if (!(await isAllowed(userId, "chat:send", topic))) {
		return { status: "budget", userId }
	}
	const freeUserChatRejection = await loadFreeUserChatRejection(userId)
	if (freeUserChatRejection) {
		return freeUserChatRejection
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
	// reject a user who is not an active member, then a spent budget, the unverified accounts switch, or the chat
	// cutoff
	if ((await toTeamRole(userId, teamId)) === null) {
		return { status: "forbidden" }
	}
	const chatUserRejection = await loadChatUserRejection(userId)
	if (chatUserRejection) {
		return chatUserRejection
	}

	// ask the gate whether the chat turn keeps its text
	const isPersistAllowed = await isAllowed(userId, "chat:persist")
	return { status: "allowed", userId, isTopicOwner: false, isPersisted: isPersistAllowed, canEditTopic: false }
}

/**
 * Decides whether this user may take a chat turn in the new-topic chat.
 * A visitor is sent to signup, and a signed-in user is gated by their monthly spend, the unverified accounts switch,
 * and the chat cutoff alone.
 */
export async function authorizeNewTopicChatTurn(userId: string | null): Promise<ChatTurnAuthorization> {
	// send a visitor to signup, and reject a user whose budget is spent, whom the unverified accounts switch limits, or
	// who is past the chat cutoff
	if (!userId) {
		return { status: "signup" }
	}
	const chatUserRejection = await loadChatUserRejection(userId)
	if (chatUserRejection) {
		return chatUserRejection
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
		// the teams that the user leads, which carl may put the topic on, the default team first
		leaderTeams: teamSummaries
			.filter((teamSummary) => isLeaderRole(teamSummary.role))
			.toSorted((teamSummaryA, teamSummaryB) => Number(teamSummaryB.isDefaultTeam) - Number(teamSummaryA.isDefaultTeam))
			.map((teamSummary) => ({ teamId: teamSummary.teamId, name: teamSummary.name })),
	}
}

/**
 * Returns the rejection for a user whose monthly budget is spent, or for a free user the unverified accounts switch
 * limits or who is past the chat cutoff, or null if none stops the chat turn.
 */
export async function loadChatUserRejection(
	userId: string,
): Promise<Extract<ChatTurnAuthorization, { status: "budget" }> | FreeUserChatRejection | null> {
	if (await isMonthlySpendExhausted(userId)) {
		return { status: "budget", userId }
	}
	return loadFreeUserChatRejection(userId)
}

/**
 * Returns the rejection for a free user the unverified accounts switch limits, or for one past the chat cutoff, or
 * null if neither stops the chat turn.
 */
export async function loadFreeUserChatRejection(userId: string): Promise<FreeUserChatRejection | null> {
	if (await isUnverifiedAccountLimited(userId)) {
		return { status: "emailUnverified", userId }
	}
	return (await isUserPastDailySpendCutoff(userId, "chat")) ? { status: "chatPaused", userId } : null
}
