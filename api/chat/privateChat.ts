// the private chat routes and one chat turn end to end:
// authorizing it, answering it with the worker's streamed reply, and saving its row
import { zValidator } from "@hono/zod-validator"
import { trackEvent } from "@shared/analytics"
import {
	type ChatAttachment,
	type ChatConversation,
	type ChatTurnPayload,
	type ChatTurnRow,
	chatTurnPayload,
	EMPTY_TOPIC_DRAFT,
	type TopicDraft,
	type TopicDraftTeam,
	toChatReplyLineText,
	withAttachmentNote,
} from "@shared/contracts"
import { reportError } from "@shared/monitoring"
import { ADMIN_QUOTA } from "@shared/plans"
import { eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { stream } from "hono/streaming"
import { db } from "../../db"
import { topics } from "../../db/schema"
import {
	type ChatReplyStream,
	type ChatTurnInput,
	isBudgetRejection,
	loadOrProvisionUserLiteLLMKey,
	SPENT_BUDGET_REJECTION,
	streamChatReply,
} from "../../worker"
import { isAllowed, isLeaderRole, isMonthlySpendExhausted, topicLimit, topicsRemaining } from "../authorization"
import { type AnalyticsProperties, type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { toolCallerRateLimiter } from "../rateLimit"
import { loadTeamSummaries } from "../team/helpers"
import { toTeamRole } from "../team/members"
import {
	type ChatTurnToolCalls,
	toChatTopicTools,
	toNewTopicChatTools,
	toOpenNewTopicChatTool,
	toSuggestTopicSourcesTool,
	toTopicEditPreviewTools,
} from "../tool/chatTools"
import { deleteTopicDraft, loadTopicDraft, saveTopicDraft } from "../topic/topicDrafts"
import { loadKeptTopicAttachments, resolveChatAttachments, storeTopicChatAttachments } from "./attachments"
import { type ChatPage, clearChatTurns, loadChatTurns, saveChatTurn, toChatPageId } from "./chatTurns"
import { saveLinkPreviews } from "./linkPreviews"
import { writeReplyStream } from "./replyStream"

// one body limit for every chat post, sized for a question plus its data url attachments
export const chatBodyLimit = bodyLimit({
	maxSize: 26 * 1024 * 1024,
	onError: (context) => context.json({ error: "Those attachments are too large." }, 413),
})

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
		tools: toChatTopicTools({ userId, topicId: page.topicId, toolCalls }),
		...toTopicEditPreviewTools({ toolCalls }),
	}
}

// how many more topics the plan allows, as the prompt states it. an admin's unlimited marker becomes no limit at all
function toPromptTopicsRemaining(remainingTopics: number | undefined): number | undefined {
	return remainingTopics === undefined || remainingTopics >= ADMIN_QUOTA ? undefined : remainingTopics
}

// one chat turn whose reply is streaming
type StreamedChatTurn = {
	chatReply: ChatReplyStream
	// who asked on which page, and what they sent
	userId: string
	page: ChatPage
	question: string
	attachments: ChatAttachment[]
	// whether the gate keeps the text, and what the topic tools did
	isPersisted: boolean
	toolCalls: ChatTurnToolCalls
	// the properties that the analytics event is sent with, and the LiteLLM key for the attachment summaries
	analyticsProperties: AnalyticsProperties
	litellmApiKey: string
}

// stream a chat reply to the user, then save the chat turn whether the stream finished or broke
function streamChatTurn(context: Context, chatTurn: StreamedChatTurn): Response {
	return stream(context, async (writeStream) => {
		// forward the reply, with the tool calls as each tool returns
		try {
			await writeReplyStream(writeStream, chatTurn.chatReply, chatTurn.toolCalls)
		} catch (error) {
			// log the broken stream. it still spent tokens, so the save below still runs
			console.error(`chat stream failed for ${toChatPageId(chatTurn.page)}`, error)
			// close with the spent budget's text. the stream is the only place left to show it.
			// report any other failure and close with the failed line
			let closingLine = toChatReplyLineText({ type: "text", text: `\n\n${SPENT_BUDGET_REJECTION}` })
			if (!isBudgetRejection(error)) {
				reportError(error, "chat", { topicId: toChatPageId(chatTurn.page) })
				closingLine = toChatReplyLineText({ type: "failed" })
			}

			// write the closing line. a user who already left cannot be written to, and that must not skip the save below
			try {
				await writeStream.write(closingLine)
			} catch (closingError) {
				console.error("chat stream close failed", closingError)
			}
		}

		// save the spend whether the stream finished or broke. a partial chat turn is never free
		const chatTurnId = await saveFinishedChatTurn(chatTurn)

		// store the topic draft that the chat turn wrote. a chat turn that created the topic already deleted it
		if (chatTurn.toolCalls.topicDraft && !chatTurn.toolCalls.createdTopicId) {
			await saveTopicDraft(chatTurn.userId, chatTurn.toolCalls.topicDraft).catch((error) => {
				console.error("topic draft save failed", error)
				reportError(error, "chat")
			})
		}

		// store the sent attachments in the background once the reply has finished. their summaries take seconds.
		// a team or new-topic conversation stores none
		const storedTopicId = chatTurn.page.topicId
		if (storedTopicId !== undefined) {
			storeTopicChatAttachments(
				chatTurn.userId,
				storedTopicId,
				chatTurnId,
				chatTurn.attachments,
				chatTurn.litellmApiKey,
			).catch((error) => {
				console.error(`storing chat attachments failed for topic ${storedTopicId}`, error)
				reportError(error, "chat", { topicId: storedTopicId })
			})
		}
	})
}

// save the finished chat turn's spend and text, and fetch the answer's link preview in the background.
// return null if the chat turn stored no text or the save failed
async function saveFinishedChatTurn(chatTurn: StreamedChatTurn): Promise<string | null> {
	try {
		// save the chat turn. a topic tool call keeps the chat turn's text even if the gate rejects persistence
		const { text, totalTokens, searchCount, toolCalls } = await chatTurn.chatReply.completion
		const isChatTurnPersisted = chatTurn.isPersisted || chatTurn.toolCalls.count > 0
		const savedChatTurnId = await saveChatTurn({
			userId: chatTurn.userId,
			page: chatTurn.page,
			totalTokens,
			searchCount,
			isPersisted: isChatTurnPersisted,
			question: chatTurn.question,
			answer: text,
			toolCalls,
			analyticsProperties: chatTurn.analyticsProperties,
		})

		// fetch the answer's first link preview card in the background, like the question's
		if (isChatTurnPersisted) {
			void saveLinkPreviews(text).catch((error) => console.error("chat link preview failed", error))
		}

		// return the id only if the chat turn stored text. without text there is no bubble for an attachment to show in
		return isChatTurnPersisted ? savedChatTurnId : null
	} catch (error) {
		console.error(`chat turn save failed for ${toChatPageId(chatTurn.page)}`, error)
		reportError(error, "chat", { topicId: toChatPageId(chatTurn.page) })
		return null
	}
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
