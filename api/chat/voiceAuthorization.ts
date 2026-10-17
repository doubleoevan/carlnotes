// whether a user may talk to carl on the chat page a voice request names, decided by that page's own chat turn gate,
// and whether a user may use the page at all, decided by the page's access rules alone
import type { VoiceChatPage } from "@shared/payloads"
import { eq } from "drizzle-orm"
import { db } from "../../db"
import { topics } from "../../db/schema/topics"
import { isAllowed, isMonthlySpendExhausted } from "../authorization"
import { toTeamRole } from "../team/members"
import {
	authorizeChatTurn,
	authorizeNewTopicChatTurn,
	authorizeTeamChatTurn,
	type ChatTurnAuthorization,
} from "./chatTurnAuthorization"
import { loadChatRoom } from "./roomAccess"

// the outcomes of a voice request: the chat turn's own rejections, an allowed page that names its user alone, and a
// chat room that answers like a missing one
export type VoiceChatPageAuthorization =
	| Exclude<ChatTurnAuthorization, { status: "allowed" }>
	| { status: "allowed"; userId: string }
	| { status: "notFound" }

// the outcomes of a page's access check, which never reads a budget
export type VoiceChatPageAccess = Exclude<VoiceChatPageAuthorization, { status: "budget" }>

/**
 * Decides whether this user may talk to carl on the page right now: a topic's, a team's, or the new-topic chat under
 * the chat turn's gate, or a chat room the user is a member of under the monthly spend gate.
 */
export async function authorizeVoiceChatPage(
	userId: string | null,
	page: VoiceChatPage,
): Promise<VoiceChatPageAuthorization> {
	if (page.kind === "room") {
		return authorizeChatRoomVoice(userId, page.topicId, page.teamId)
	}

	// a private page keeps the chat turn's own rejection, and an allowed chat turn names its user alone
	const chatTurnAuthorization = await toChatTurnAuthorization(userId, page)
	if (chatTurnAuthorization.status !== "allowed") {
		return chatTurnAuthorization
	}
	return { status: "allowed", userId: chatTurnAuthorization.userId }
}

/**
 * Decides whether this user may use the page at all, by its visibility, team membership, or chat room membership,
 * without the monthly spend sums the chat turn gate runs.
 */
export async function authorizeVoiceChatPageAccess(
	userId: string | null,
	page: VoiceChatPage,
): Promise<VoiceChatPageAccess> {
	if (page.kind === "room") {
		return toChatRoomAccess(userId, page.topicId, page.teamId)
	}
	if (page.kind === "topic") {
		return toTopicAccess(userId, page.topicId)
	}

	// a team page needs an active member, and the new-topic chat needs a signed-in user alone
	if (!userId) {
		return { status: "signup" }
	}
	if (page.kind === "team" && (await toTeamRole(userId, page.teamId)) === null) {
		return { status: "forbidden" }
	}
	return { status: "allowed", userId }
}

// the chat turn's own authorization for a private page
function toChatTurnAuthorization(
	userId: string | null,
	page: Exclude<VoiceChatPage, { kind: "room" }>,
): Promise<ChatTurnAuthorization> {
	if (page.kind === "topic") {
		return authorizeChatTurn(userId, page.topicId)
	}
	return page.kind === "team" ? authorizeTeamChatTurn(userId, page.teamId) : authorizeNewTopicChatTurn(userId)
}

// a topic page's access: a missing or invisible topic is forbidden, and a visitor on a visible one is sent to signup
async function toTopicAccess(userId: string | null, topicId: string): Promise<VoiceChatPageAccess> {
	// reject a missing topic the same way as an invisible one
	const [topic] = await db
		.select({ id: topics.id, ownerId: topics.ownerId, visibility: topics.visibility, teamId: topics.teamId })
		.from(topics)
		.where(eq(topics.id, topicId))
	if (!topic || !(await isAllowed(userId, "topic:view", topic))) {
		return { status: "forbidden" }
	}

	return userId ? { status: "allowed", userId } : { status: "signup" }
}

// a chat room's access: a visitor is sent to signup, and a chat room the user may not use answers like a missing one
async function toChatRoomAccess(
	userId: string | null,
	topicId: string | null,
	teamId: string,
): Promise<VoiceChatPageAccess> {
	if (!userId) {
		return { status: "signup" }
	}
	return (await loadChatRoom(userId, topicId, teamId)) ? { status: "allowed", userId } : { status: "notFound" }
}

// a chat room's authorization: the chat room's access, then a spent budget rejected before any model is called
async function authorizeChatRoomVoice(
	userId: string | null,
	topicId: string | null,
	teamId: string,
): Promise<VoiceChatPageAuthorization> {
	// reject a visitor and a chat room the user may not use
	const chatRoomAccess = await toChatRoomAccess(userId, topicId, teamId)
	if (chatRoomAccess.status !== "allowed") {
		return chatRoomAccess
	}

	// reject a member whose budget is spent
	if (await isMonthlySpendExhausted(chatRoomAccess.userId)) {
		return { status: "budget", userId: chatRoomAccess.userId }
	}
	return chatRoomAccess
}
