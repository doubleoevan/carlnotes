// the private chat routes on each page, and answering an allowed chat turn with the worker's streamed reply
import { zValidator } from "@hono/zod-validator"
import { trackEvent } from "@shared/analytics"
import { type ChatConversation, type ChatTurnRow, withAttachmentNote } from "@shared/contracts/chat"
import { type ChatTurnPayload, chatTurnPayload } from "@shared/payloads"
import { ADMIN_QUOTA } from "@shared/plans"
import { EMPTY_TOPIC_DRAFT, type TopicDraft } from "@shared/topicPayloads"
import { eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { db } from "../../db"
import { topics } from "../../db/schema/topics"
import { type ChatTurnInput, loadOrProvisionUserLiteLLMKey, streamChatReply } from "../../worker"
import { topicLimit } from "../authorization"
import { type AnalyticsProperties, type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { toolCallerRateLimiter } from "../rateLimit"
import {
	type ChatTurnToolCalls,
	toChatTopicTools,
	toOpenNewTopicChatTool,
	toTopicEditPreviewTools,
} from "../tool/chatTools"
import { toNewTopicChatTools, toSuggestTopicSourcesTool } from "../tool/newTopicChatTools"
import { deleteTopicDraft, loadTopicDraft } from "../topic/topicDrafts"
import { resolveChatAttachments } from "./attachments"
import { loadKeptTopicAttachments } from "./chatAttachmentReads"
import {
	authorizeChatTurn,
	authorizeNewTopicChatTurn,
	authorizeTeamChatTurn,
	type ChatTurnAuthorization,
} from "./chatTurnAuthorization"
import { streamChatTurn } from "./chatTurnStream"
import { type ChatPage, clearChatTurns, loadChatTurns, toChatPageId } from "./chatTurns"
import { saveLinkPreviews } from "./linkPreviews"

// one body limit for every chat post, sized for a question plus its data url attachments
export const chatBodyLimit = bodyLimit({
	maxSize: 26 * 1024 * 1024,
	onError: (context) => context.json({ error: "Those attachments are too large." }, 413),
})

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

// the response for each status that a chat turn is rejected with
function toChatRejection(context: Context, status: "budget" | "signup" | "forbidden"): Response {
	if (status === "budget") {
		return context.json({ error: "budget exhausted" }, 402)
	}
	if (status === "signup") {
		return context.json({ error: "sign up required" }, 401)
	}

	// reject a page this user may not chat on
	return context.json({ error: "forbidden" }, 403)
}

// an allowed chat turn to answer: its page, the gate's decision, and the question with its attachments
type AnswerChatTurnOptions = {
	page: ChatPage
	authorization: ChatTurnAuthorization & { status: "allowed" }
	chatTurnPayload: ChatTurnPayload
}

// stream the reply to an allowed chat turn, for every chat POST route
async function answerChatTurn(
	context: Context,
	{ page, authorization, chatTurnPayload }: AnswerChatTurnOptions,
): Promise<Response> {
	// read each attached file into its text and reject the chat turn with a message if a file cannot be read
	const { question, history, attachments } = chatTurnPayload
	const chatAttachments = await resolveChatAttachments(attachments)
	if (chatAttachments === null) {
		return context.json({ error: "That file couldn't be read." }, 422)
	}

	// load the topic draft that the new-topic chat's tools read and write
	const { userId } = authorization
	const topicDraft = page.newTopic ? await toNewTopicChatDraft(userId, chatTurnPayload.topicDraft) : undefined

	// the LiteLLM key that the chat turn bills, created first if the user has none
	const litellmApiKey = await loadOrProvisionUserLiteLLMKey(userId)

	// stream the reply from the page's own material: one topic, every topic that the team holds, or the topic draft.
	// the tools record what they did in the tool calls
	const toolCalls: ChatTurnToolCalls = { count: 0, topicSaves: [], topicSaveRejections: [] }
	const analyticsProperties = toAnalyticsProperties(context)
	const chatReply = await streamChatReply({
		...toChatTurnTools({
			userId,
			page,
			canEditTopic: authorization.canEditTopic,
			toolCalls,
			analyticsProperties,
			topicDraft,
		}),
		topicId: page.topicId,
		teamId: page.teamId,
		newTopic: page.newTopic,
		topicDraft,
		topicsRemaining: toPromptTopicsRemaining(authorization.topicsRemaining),
		leaderTeams: authorization.leaderTeams,
		question,
		history,
		chatAttachments,
		userId,
		isTopicOwner: authorization.isTopicOwner,
		litellmApiKey,
	})
	if (!chatReply) {
		return context.json({ error: "not found" }, 404)
	}

	// fetch the question's first link preview card in the background, never delaying the reply
	if (authorization.isPersisted) {
		void saveLinkPreviews(question).catch((error) => console.error("chat link preview failed", error))
	}

	// stream the reply to the user. the stored question names its attachments
	return streamChatTurn(context, {
		chatReply,
		userId,
		page,
		question: withAttachmentNote(question, attachments),
		attachments,
		isPersisted: authorization.isPersisted,
		toolCalls,
		analyticsProperties,
		litellmApiKey,
	})
}

/**
 * Returns the topic draft that a new-topic chat turn starts from: the stored draft over the browser's copy,
 * with the browser's team if it sends one.
 */
async function toNewTopicChatDraft(userId: string, browserTopicDraft?: TopicDraft): Promise<TopicDraft | undefined> {
	const storedTopicDraft = await loadTopicDraft(userId)
	if (!storedTopicDraft) {
		return browserTopicDraft
	}
	return { ...storedTopicDraft, team: browserTopicDraft?.team ?? storedTopicDraft.team }
}

// the tools that a chat turn offers, in the fields that the reply reads them from
type ChatTurnTools = Pick<
	ChatTurnInput,
	"tools" | "openNewTopicChatTool" | "proposeTopicEditTool" | "cancelTopicEditTool" | "suggestSourcesTool"
>

// what one chat turn's tools are bound to
type ToChatTurnToolsOptions = {
	userId: string
	page: ChatPage
	canEditTopic: boolean
	toolCalls: ChatTurnToolCalls
	analyticsProperties: AnalyticsProperties
	topicDraft?: TopicDraft
}

// pick a chat turn's tools: the draft tools for the new-topic chat, the edit tools for an editor on a topic,
// and the tool that opens the new-topic chat everywhere else
function toChatTurnTools({
	userId,
	page,
	canEditTopic,
	toolCalls,
	analyticsProperties,
	topicDraft,
}: ToChatTurnToolsOptions): ChatTurnTools {
	if (page.newTopic) {
		// copy the empty topic draft. the tools write into this object, and EMPTY_TOPIC_DRAFT is frozen
		const chatTurnTopicDraft = topicDraft ?? { ...EMPTY_TOPIC_DRAFT }
		const newTopicToolBinding = { userId, toolCalls, topicDraft: chatTurnTopicDraft, analyticsProperties }
		return {
			tools: toNewTopicChatTools(newTopicToolBinding),
			suggestSourcesTool: toSuggestTopicSourcesTool(newTopicToolBinding),
		}
	}

	// offer the tool that opens the new-topic chat on every other page
	const openNewTopicChatTool = toOpenNewTopicChatTool({ toolCalls })
	if (!canEditTopic || !page.topicId) {
		return { openNewTopicChatTool }
	}
	// add the edit tools for an editor on a topic,
	// and the tools that show a proposed change on the topic's card and take it back off
	return {
		openNewTopicChatTool,
		tools: toChatTopicTools({ userId, topicId: page.topicId, toolCalls, analyticsProperties }),
		...toTopicEditPreviewTools({ toolCalls }),
	}
}

// how many more topics the plan allows, as the prompt states it. an admin's unlimited marker becomes no limit at all
function toPromptTopicsRemaining(remainingTopics: number | undefined): number | undefined {
	return remainingTopics === undefined || remainingTopics >= ADMIN_QUOTA ? undefined : remainingTopics
}

// the private chat routes on each page: the conversation, clearing it, and the streamed reply
export const privateChatRoute = new Hono<AppEnv>()
	.get("/topics/:id/chat", async (context) => {
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
	.delete("/topics/:id/chat", (context) => clearChatConversation(context, { topicId: context.req.param("id") }))
	.post(
		"/topics/:id/chat",
		toolCallerRateLimiter,
		chatBodyLimit,
		zValidator("json", chatTurnPayload),
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
	.get("/teams/:id/chat", async (context) => {
		// load the team-wide conversation that the panel opens with. a team chat keeps no attachments of its own
		const userId = currentUser(context)
		const teamId = context.req.param("id")
		const [chatTurns, authorization] = await Promise.all([
			loadChatTurns(userId, { teamId }),
			authorizeTeamChatTurn(userId, teamId),
		])
		return context.json(toChatConversation(chatTurns, authorization))
	})
	.delete("/teams/:id/chat", (context) => clearChatConversation(context, { teamId: context.req.param("id") }))
	.post(
		"/teams/:id/chat",
		toolCallerRateLimiter,
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
	.get("/chat/new-topic", async (context) => {
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
	.delete("/chat/new-topic", (context) => clearChatConversation(context, { newTopic: true }))
	.post(
		"/chat/new-topic",
		toolCallerRateLimiter,
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
