// the private chat routes on each page: the conversation, clearing it, and the chat turn, which is authorized before
// its body is read

import { CHAT_ROOM_ATTACHMENT_ERRORS, type ChatConversation, type ChatTurnRow } from "@carlnotes/contracts/chat"
import { chatTurnPayload, topicChatTurnPayload } from "@carlnotes/contracts/payloads"
import { db } from "@carlnotes/db"
import { topics } from "@carlnotes/db/schema/topics"
import { isVoiceChatConfigured } from "@carlnotes/server/voiceChat"
import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { type Context, Hono, type MiddlewareHandler } from "hono"
import { every } from "hono/combine"
import { topicLimit } from "../authorization"
import { toBodyAdmission, toBodyLimit, toSignedOutRejection } from "../bodyLimit"
import { type AppEnv, currentUser } from "../currentUser"
import { toolCallerRateLimiter } from "../rateLimit"
import { deleteTopicDraft, loadTopicDraft } from "../topic/topicDrafts"
import { loadKeptTopicAttachments } from "./chatAttachmentReads"
import type { ChatPage } from "./chatPages"
import { type AnswerChatTurnOptions, answerChatTurn, toAttachmentRejectionResponse } from "./chatTurnAnswer"
import {
	authorizeChatTurn,
	authorizeNewTopicChatTurn,
	authorizeTeamChatTurn,
	type ChatTurnAuthorization,
	rejectChatTurn,
	SIGNUP_REQUIRED_ERROR,
	toChatRejection,
} from "./chatTurnAuthorization"
import { clearChatTurns, loadChatTurns } from "./chatTurns"

// the paths of a topic's chat, a team's chat, and the new-topic chat, after the /api base
export const TOPIC_CHAT_PATH = "/topics/:id/chat"
export const TEAM_CHAT_PATH = "/teams/:id/chat"
export const NEW_TOPIC_CHAT_PATH = "/chat/new-topic"

// the largest body a chat post may send, sized for a question plus its data url attachments
const CHAT_BODY_LIMIT_BYTES = 26 * 1024 * 1024

// a chat body past this size waits its turn to be read. an eighth of the body limit, a few megabytes, which a question
// with its history stays under
export const LARGE_CHAT_BODY_BYTES = CHAT_BODY_LIMIT_BYTES / 8

// the most bytes of large chat bodies in progress in the process at once, each from its read until its reply ends:
// four bodies at the body limit
export const CHAT_BODY_BYTES_IN_PROGRESS_LIMIT = 4 * CHAT_BODY_LIMIT_BYTES

// one admission for every chat post, private and chat room alike. a large body waits its turn before the limit lets it
// be read, so the large chat bodies in progress stay within the bytes in progress limit
const toChatBodyAdmission = toBodyAdmission({
	maxBodyBytes: CHAT_BODY_LIMIT_BYTES,
	largeBodyBytes: LARGE_CHAT_BODY_BYTES,
	maxBytesInProgress: CHAT_BODY_BYTES_IN_PROGRESS_LIMIT,
})

// the limit a chat post's body is rejected past
const chatBodySizeLimit = toBodyLimit(CHAT_BODY_LIMIT_BYTES, "Those attachments are too large.")

// a private chat post's body limit. a large body whose turn does not come is busy, as a file that waited behind other
// files is, with the same time to send it again
const chatBodyLimit = every(
	toChatBodyAdmission((context) => toAttachmentRejectionResponse(context, "attachmentBusy")),
	chatBodySizeLimit,
)

// a chat room post's body limit, whose busy body is rejected as a chat room's busy file is
export const chatRoomBodyLimit = every(
	toChatBodyAdmission((context) => context.json({ error: CHAT_ROOM_ATTACHMENT_ERRORS.attachmentBusy }, 400)),
	chatBodySizeLimit,
)

// a visitor's chat post is rejected before its body is read, with the error the gate gives a visitor's turn
export const chatSignedOutRejection = toSignedOutRejection(SIGNUP_REQUIRED_ERROR)

// an allowed chat post's turn: the page its url names, and the gate's decision for its user
type AllowedChatTurn = Pick<AnswerChatTurnOptions, "page" | "authorization">

// the hono environment of a chat post. its turn is set once the post's authorizer allows it
type ChatPostEnv = AppEnv & { Variables: { allowedChatTurn?: AllowedChatTurn } }

// whether the user owns no topic yet
async function ownsNoTopic(userId: string | null): Promise<boolean> {
	if (!userId) {
		return false
	}
	const [ownedTopic] = await db.select({ id: topics.id }).from(topics).where(eq(topics.ownerId, userId)).limit(1)
	return ownedTopic === undefined
}

// the conversation that every chat page opens with: its chat turns and whether the user may chat on it. a free user
// the unverified accounts switch limits, or one past the chat cutoff, keeps the chat open, and a chat turn says why
// carl does not answer
function toChatConversation(chatTurns: ChatTurnRow[], authorization: ChatTurnAuthorization): ChatConversation {
	return {
		chatTurns,
		canChat: ["allowed", "emailUnverified", "chatPaused"].includes(authorization.status),
		isSignupRequired: authorization.status === "signup",
		isBudgetExhausted: authorization.status === "budget",
		isVoiceChatConfigured: isVoiceChatConfigured(),
		keptAttachments: [],
		canEditTopic: authorization.status === "allowed" && authorization.canEditTopic,
	}
}

// clear the user's conversation on one page and keep the spend rows. the new-topic chat also deletes its topic draft
async function clearChatConversation(context: Context, page: ChatPage): Promise<Response> {
	const userId = currentUser(context)
	if (!userId) {
		return toChatRejection(context, "signup")
	}
	await Promise.all([clearChatTurns(userId, page), page.newTopic ? deleteTopicDraft(userId) : undefined])
	return context.json({ ok: true })
}

// the private chat routes on each page: the conversation, clearing it, and the streamed reply
export const privateChatRoute = new Hono<AppEnv>()
	.get(TOPIC_CHAT_PATH, async (context) => {
		// load what the panel opens with: the user's stored conversation, their kept attachments, and whether they may chat
		const userId = currentUser(context)
		const topicId = context.req.param("id")
		const [chatTurns, authorization, keptAttachments] = await Promise.all([
			loadChatTurns(userId, { topicId }),
			authorizeChatTurn(userId, topicId),
			loadKeptTopicAttachments(userId, topicId),
		])

		// return the conversation with its kept attachments
		const chatConversation: ChatConversation = { ...toChatConversation(chatTurns, authorization), keptAttachments }
		return context.json(chatConversation)
	})
	.delete(TOPIC_CHAT_PATH, (context) => clearChatConversation(context, { topicId: context.req.param("id") }))
	.post(
		TOPIC_CHAT_PATH,
		toolCallerRateLimiter,
		chatSignedOutRejection,
		// authorize the chat turn on the topic before the body limit lets the body be read
		toChatTurnAuthorizer<typeof TOPIC_CHAT_PATH>((context) => ({ topicId: context.req.param("id") })),
		chatBodyLimit,
		zValidator("json", topicChatTurnPayload),
		(context) => answerAllowedChatTurn(context, context.req.valid("json")),
	)
	.get(TEAM_CHAT_PATH, async (context) => {
		// load the team-wide conversation that the panel opens with. a team chat keeps no attachments of its own
		const userId = currentUser(context)
		const teamId = context.req.param("id")
		const [chatTurns, authorization] = await Promise.all([
			loadChatTurns(userId, { teamId }),
			authorizeTeamChatTurn(userId, teamId),
		])
		return context.json(toChatConversation(chatTurns, authorization))
	})
	.delete(TEAM_CHAT_PATH, (context) => clearChatConversation(context, { teamId: context.req.param("id") }))
	.post(
		TEAM_CHAT_PATH,
		toolCallerRateLimiter,
		chatSignedOutRejection,
		// authorize the chat turn by membership before the body limit lets the body be read
		toChatTurnAuthorizer<typeof TEAM_CHAT_PATH>((context) => ({ teamId: context.req.param("id") })),
		chatBodyLimit,
		zValidator("json", chatTurnPayload),
		(context) => answerAllowedChatTurn(context, context.req.valid("json")),
	)
	.get(NEW_TOPIC_CHAT_PATH, async (context) => {
		// load the new-topic conversation and whether this is the user's first topic
		const userId = currentUser(context)
		const [chatTurns, authorization, isFirstTopic, planTopicLimit, topicDraft] = await Promise.all([
			loadChatTurns(userId, { newTopic: true }),
			authorizeNewTopicChatTurn(userId),
			ownsNoTopic(userId),
			userId ? topicLimit(userId) : Promise.resolve(undefined),
			loadTopicDraft(userId),
		])

		// return the conversation with how many more topics the plan allows and the topic draft so far
		const chatConversation: ChatConversation = {
			...toChatConversation(chatTurns, authorization),
			isFirstTopic,
			topicsRemaining: authorization.status === "allowed" ? authorization.topicsRemaining : undefined,
			topicLimit: planTopicLimit,
			topicDraft: topicDraft ?? undefined,
		}
		return context.json(chatConversation)
	})
	.delete(NEW_TOPIC_CHAT_PATH, (context) => clearChatConversation(context, { newTopic: true }))
	.post(
		NEW_TOPIC_CHAT_PATH,
		toolCallerRateLimiter,
		chatSignedOutRejection,
		// authorize the chat turn by session before the body limit lets the body be read
		toChatTurnAuthorizer(() => ({ newTopic: true })),
		chatBodyLimit,
		zValidator("json", chatTurnPayload),
		// answer the chat turn. its files are read for this chat turn and never stored
		(context) => answerAllowedChatTurn(context, context.req.valid("json")),
	)

/**
 * Builds the middleware that authorizes a chat post's turn from its user and the page its url names, before the body
 * is read. A rejected turn gets its gate's response, each rejection with its own status, and an allowed turn goes on
 * with its page and the gate's decision.
 */
function toChatTurnAuthorizer<Path extends string>(
	toChatPage: (context: Context<AppEnv, Path>) => ChatPage,
): MiddlewareHandler<ChatPostEnv, Path> {
	return async (context, next) => {
		// reject a turn that the page's gate does not allow
		const page = toChatPage(context)
		const authorization = await authorizeChatPageTurn(currentUser(context), page)
		if (authorization.status !== "allowed") {
			return rejectChatTurn(context, { authorization, page })
		}

		// set the page and the gate's decision for the handler that answers the turn
		context.set("allowedChatTurn", { page, authorization })
		await next()
	}
}

// answer a chat post's turn from its validated body. a post that no authorizer allowed is never answered
async function answerAllowedChatTurn(
	context: Context<ChatPostEnv>,
	chatTurnPayload: AnswerChatTurnOptions["chatTurnPayload"],
): Promise<Response> {
	const allowedChatTurn = context.get("allowedChatTurn")
	if (!allowedChatTurn) {
		throw new Error("a chat post reached its answer with no authorized chat turn")
	}
	return answerChatTurn(context, { ...allowedChatTurn, chatTurnPayload })
}

// authorize a chat turn under its page's own gate: a topic's, a team's, or the new-topic chat's
function authorizeChatPageTurn(userId: string | null, page: ChatPage): Promise<ChatTurnAuthorization> {
	if (page.topicId !== undefined) {
		return authorizeChatTurn(userId, page.topicId)
	}
	return page.teamId !== undefined ? authorizeTeamChatTurn(userId, page.teamId) : authorizeNewTopicChatTurn(userId)
}
