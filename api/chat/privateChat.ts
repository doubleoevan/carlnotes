// the private chat routes on each page: the conversation, clearing it, and the chat turn
import { zValidator } from "@hono/zod-validator"
import { trackEvent } from "@shared/analytics"
import type { ChatConversation, ChatTurnRow } from "@shared/contracts/chat"
import { chatTurnPayload, topicChatTurnPayload } from "@shared/payloads"
import { isVoiceChatConfigured } from "@shared/voiceChat"
import { eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { db } from "../../db"
import { topics } from "../../db/schema/topics"
import { topicLimit } from "../authorization"
import { toBodyLimit, toSignedOutRejection } from "../bodyLimit"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { toolCallerRateLimiter } from "../rateLimit"
import { deleteTopicDraft, loadTopicDraft } from "../topic/topicDrafts"
import { loadKeptTopicAttachments } from "./chatAttachmentReads"
import { answerChatTurn } from "./chatTurnAnswer"
import {
	authorizeChatTurn,
	authorizeNewTopicChatTurn,
	authorizeTeamChatTurn,
	type ChatTurnAuthorization,
	SIGNUP_REQUIRED_ERROR,
	toChatRejection,
} from "./chatTurnAuthorization"
import { type ChatPage, clearChatTurns, loadChatTurns, toChatPageId } from "./chatTurns"

// the paths of a topic's chat, a team's chat, and the new-topic chat, after the /api base
export const TOPIC_CHAT_PATH = "/topics/:id/chat"
export const TEAM_CHAT_PATH = "/teams/:id/chat"
export const NEW_TOPIC_CHAT_PATH = "/chat/new-topic"

// the largest body a chat post may send, sized for a question plus its data url attachments
const CHAT_BODY_LIMIT_BYTES = 26 * 1024 * 1024

// one body limit for every chat post
export const chatBodyLimit = toBodyLimit(CHAT_BODY_LIMIT_BYTES, "Those attachments are too large.")

// a visitor's chat post is rejected before its body is read, with the error the gate gives a visitor's turn
export const chatSignedOutRejection = toSignedOutRejection(SIGNUP_REQUIRED_ERROR)

// whether the user owns no topic yet
async function ownsNoTopic(userId: string | null): Promise<boolean> {
	if (!userId) {
		return false
	}
	const [ownedTopic] = await db.select({ id: topics.id }).from(topics).where(eq(topics.ownerId, userId)).limit(1)
	return ownedTopic === undefined
}

// the conversation that every chat page opens with: its chat turns and whether the user may chat on it
function toChatConversation(chatTurns: ChatTurnRow[], authorization: ChatTurnAuthorization): ChatConversation {
	return {
		chatTurns,
		canChat: authorization.status === "allowed",
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

// what a chat turn was rejected for, and the page it was sent on
type RejectChatTurnOptions = {
	authorization: Exclude<ChatTurnAuthorization, { status: "allowed" }>
	page: ChatPage
}

// count a chat turn that a spent budget stopped, then return the response for its rejection
function rejectChatTurn(context: Context, { authorization, page }: RejectChatTurnOptions): Response {
	if (authorization.status === "budget") {
		trackEvent("chat_budget_reached", authorization.userId, {
			...toAnalyticsProperties(context),
			topicId: toChatPageId(page),
		})
	}
	return toChatRejection(context, authorization.status)
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
		chatBodyLimit,
		zValidator("json", topicChatTurnPayload),
		async (context) => {
			// authorize the chat turn first. each rejection reads differently to the user, so each gets its own status
			const topicId = context.req.param("id")
			const authorization = await authorizeChatTurn(currentUser(context), topicId)
			if (authorization.status !== "allowed") {
				return rejectChatTurn(context, { authorization, page: { topicId } })
			}
			return answerChatTurn(context, {
				page: { topicId },
				authorization,
				chatTurnPayload: context.req.valid("json"),
			})
		},
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
		chatBodyLimit,
		zValidator("json", chatTurnPayload),
		async (context) => {
			// authorize the chat turn by membership, each rejection with its own status
			const teamId = context.req.param("id")
			const authorization = await authorizeTeamChatTurn(currentUser(context), teamId)
			if (authorization.status !== "allowed") {
				return rejectChatTurn(context, { authorization, page: { teamId } })
			}
			return answerChatTurn(context, {
				page: { teamId },
				authorization,
				chatTurnPayload: context.req.valid("json"),
			})
		},
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
		chatBodyLimit,
		zValidator("json", chatTurnPayload),
		async (context) => {
			// authorize the chat turn by session, each rejection with its own status
			const authorization = await authorizeNewTopicChatTurn(currentUser(context))
			if (authorization.status !== "allowed") {
				return rejectChatTurn(context, { authorization, page: { newTopic: true } })
			}

			// answer the chat turn. its files are read for this chat turn and never stored
			return answerChatTurn(context, {
				page: { newTopic: true },
				authorization,
				chatTurnPayload: context.req.valid("json"),
			})
		},
	)
