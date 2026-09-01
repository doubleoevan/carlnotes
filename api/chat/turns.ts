// authorizing and metering one chat turn. the reply itself is generated in the worker
import { zValidator } from "@hono/zod-validator"
import { trackEvent } from "@shared/analytics"
import {
	type ChatAttachment,
	type ChatConversation,
	type ChatTurnPayload,
	type ChatTurnRow,
	chatTurnPayload,
	withAttachmentNote,
} from "@shared/contracts"
import { reportError } from "@shared/monitoring"
import { and, desc, eq, isNull, type SQL } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { stream } from "hono/streaming"
import { db } from "../../db"
import { chatTurns, topics, users } from "../../db/schema"
import { type ChatReplyStream, isBudgetRejection, SPENT_BUDGET_REFUSAL, streamChatReply } from "../../worker"
import { CHAT_COST_PER_MILLION_TOKENS, EXA_COST_PER_SEARCH, tokenCost } from "../../worker/budget"
import { isAllowed, isMonthlySpendExhausted } from "../authorization"
import type { AnalyticsProperties } from "../currentUser"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { toTeamRole } from "../team/members"
import {
	deleteChatAttachments,
	loadKeptTopicAttachments,
	loadTopicChatTurnAttachments,
	resolveChatAttachments,
	storeTopicChatAttachments,
} from "./attachments"
import { decryptChatText, encryptChatText } from "./encryption"
import { loadChatLinkPreviews, saveLinkPreviews } from "./linkPreviews"

// one body limit for every chat post, sized for a question plus its data url attachments
export const chatBodyLimit = bodyLimit({
	maxSize: 26 * 1024 * 1024,
	onError: (context) => context.json({ error: "Those attachments are too large." }, 413),
})

// the outcomes of a chat turn request
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type ChatTurnAuthorization = { status: "allowed"; isOwner: boolean; isPersisted: boolean; litellmApiKey?: string } | { status: "signup" } | { status: "forbidden" } | { status: "budget" }

// the page a private conversation lives under: one topic, or a whole team read across its topics
export type ChatPage = { topicId: string; teamId?: undefined } | { teamId: string; topicId?: undefined }

// the page's filter over the ledger: a topic's chat turns, or a team's own with no topic set
function toPageFilter(page: ChatPage): SQL | undefined {
	return page.topicId !== undefined
		? eq(chatTurns.topicId, page.topicId)
		: and(eq(chatTurns.teamId, page.teamId), isNull(chatTurns.topicId))
}

/**
 * Whether this user may take a chat turn on the topic right now, and how that chat turn should be recorded.
 * A signed-out visitor on a visible topic is sent to signup, so no anonymous chat turn ever spends.
 */
export async function authorizeChatTurn(userId: string | null, topicId: string): Promise<ChatTurnAuthorization> {
	// a missing topic is rejected the same way an invisible one is
	const [topic] = await db.select().from(topics).where(eq(topics.id, topicId))
	if (!topic) {
		return { status: "forbidden" }
	}

	// visibility is asked first, then sign-in
	if (!(await isAllowed(userId, "topic:view", topic))) {
		return { status: "forbidden" }
	}
	if (!userId) {
		return { status: "signup" }
	}

	// the one rejection left for a signed-in user who can see the topic is the budget
	if (!(await isAllowed(userId, "chat:send", topic))) {
		return { status: "budget" }
	}

	// the gate decides whether the chat turn keeps its text, and its model calls bill to the user's own key
	const [isPersisted, [userRow]] = await Promise.all([
		isAllowed(userId, "chat:persist"),
		db.select({ litellmVirtualKey: users.litellmVirtualKey }).from(users).where(eq(users.id, userId)),
	])
	return {
		status: "allowed",
		isOwner: topic.ownerId === userId,
		isPersisted,
		litellmApiKey: userRow?.litellmVirtualKey ?? undefined,
	}
}

/**
 * Whether this user may take a team-wide chat turn: a signed-in, active member under budget.
 */
export async function authorizeTeamChatTurn(userId: string | null, teamId: string): Promise<ChatTurnAuthorization> {
	if (!userId) {
		return { status: "signup" }
	}
	// membership stands where topic visibility stands for a topic chat
	if ((await toTeamRole(userId, teamId)) === null) {
		return { status: "forbidden" }
	}
	if (await isMonthlySpendExhausted(userId)) {
		return { status: "budget" }
	}

	// the gate decides whether the chat turn keeps its text, and its model calls bill to the user's own key
	const [isPersisted, [userRow]] = await Promise.all([
		isAllowed(userId, "chat:persist"),
		db.select({ litellmVirtualKey: users.litellmVirtualKey }).from(users).where(eq(users.id, userId)),
	])
	return { status: "allowed", isOwner: false, isPersisted, litellmApiKey: userRow?.litellmVirtualKey ?? undefined }
}

/**
 * Record a finished chat turn's spend, keeping its text only when the gate allows the user that, and answer its id.
 * A chat turn that streamed and then failed still records, so a partial chat turn is never free.
 */
export async function recordChatTurn(
	userId: string,
	page: ChatPage,
	totalTokens: number,
	searchCount: number,
	isPersisted: boolean,
	question: string,
	answer: string,
	analyticsProperties: AnalyticsProperties,
): Promise<string | null> {
	// the id comes back so the attachments sent with the question can point at this chat turn
	const [chatTurnRow] = await db
		.insert(chatTurns)
		.values(
			toChatTurnRow(userId, page.topicId ?? null, totalTokens, searchCount, isPersisted, question, answer, page.teamId),
		)
		.returning({ id: chatTurns.id })

	// the event goes with the row, so a chat turn is counted exactly when it is metered
	trackEvent("chat_turn_sent", userId, { ...analyticsProperties, topicId: page.topicId ?? page.teamId ?? "" })
	return chatTurnRow?.id ?? null
}

/**
 * Record a chat room completion into the same chat ledger a private chat turn writes, with the chat room message it
 * answered and its token total. The billed member's monthly budget reads this row like any other.
 */
export async function recordChatRoomTurn(
	userId: string,
	topicId: string | null,
	teamId: string,
	chatRoomMessageId: number,
	completion: { totalTokens: number; searchCount: number },
): Promise<void> {
	// the text lives in the chat room's messages, so the ledger row stores only the meter and the reference
	const chatTurnRow = toChatTurnRow(userId, topicId, completion.totalTokens, completion.searchCount, false, "", "")
	await db.insert(chatTurns).values({
		...chatTurnRow,
		roomMessageId: chatRoomMessageId,
		teamId: topicId === null ? teamId : null,
		totalTokens: completion.totalTokens,
	})
}

/**
 * The row one finished chat turn writes. Its cost is the same best-effort token total a scan uses plus what its
 * web searches cost.
 */
export function toChatTurnRow(
	userId: string,
	topicId: string | null,
	totalTokens: number,
	searchCount: number,
	isPersisted: boolean,
	question: string,
	answer: string,
	teamId?: string,
): typeof chatTurns.$inferInsert {
	// a chat turn that does not persist stores null text, so its row is a meter entry and nothing more
	return {
		userId,
		topicId,
		teamId: teamId ?? null,
		cost: (tokenCost(totalTokens, CHAT_COST_PER_MILLION_TOKENS) + searchCount * EXA_COST_PER_SEARCH).toFixed(6),
		question: isPersisted ? encryptChatText(question) : null,
		answer: isPersisted ? encryptChatText(answer) : null,
	}
}

/**
 * The user's stored chat turns for a topic, oldest first. The whole conversation.
 */
export async function loadChatTurns(userId: string | null, page: ChatPage): Promise<ChatTurnRow[]> {
	// a visitor, or anyone the gate rejects persistence, has nothing stored to read
	if (!userId || !(await isAllowed(userId, "chat:persist"))) {
		return []
	}

	// the conversation newest first off the index, beside the attachments that were sent with it.
	// a team conversation stores no attachments, so its lookup is an empty map
	const [chatTurnRows, attachmentsByChatTurnId] = await Promise.all([
		db
			.select({
				id: chatTurns.id,
				question: chatTurns.question,
				answer: chatTurns.answer,
				createdAt: chatTurns.createdAt,
			})
			.from(chatTurns)
			.where(and(eq(chatTurns.userId, userId), toPageFilter(page)))
			.orderBy(desc(chatTurns.createdAt)),
		page.topicId ? loadTopicChatTurnAttachments(userId, page.topicId) : new Map<string, never[]>(),
	])

	// decrypt each stored pair back into reading order, dropping the meter-only rows and any text that fails to verify
	const decryptedChatTurns = chatTurnRows.reverse().flatMap((chatTurnRow) => {
		if (chatTurnRow.question === null || chatTurnRow.answer === null) {
			return []
		}

		// a pair is replayed only when both sides decrypt
		const question = decryptChatText(chatTurnRow.question)
		const answer = decryptChatText(chatTurnRow.answer)
		if (question === null || answer === null) {
			return []
		}

		// what was sent with this question, which the bubble shows again
		const attachments = attachmentsByChatTurnId.get(chatTurnRow.id) ?? []
		return [{ question, answer, at: chatTurnRow.createdAt.toISOString(), attachments }]
	})

	// each question's and answer's first link resolves against the shared link preview cache in one query.
	// even indexes key the questions and odd ones the answers
	const linkPreviewEntries: [number, string][] = decryptedChatTurns.flatMap((chatTurn, index) => [
		[index * 2, chatTurn.question],
		[index * 2 + 1, chatTurn.answer],
	])
	const linkPreviewsByIndex = await loadChatLinkPreviews(new Map(linkPreviewEntries))
	return decryptedChatTurns.map((chatTurn, index) => ({
		...chatTurn,
		linkPreviews: linkPreviewsByIndex.get(index * 2) ?? [],
		answerLinkPreviews: linkPreviewsByIndex.get(index * 2 + 1) ?? [],
	}))
}

/**
 * Clear the user's conversation with a topic: every chat turn's text is nulled and everything they kept for the
 * topic goes with it. The chat turn rows stay as the spend
 * ledger, and deleting them would let a cleared chat reset the month's meter.
 */
export async function clearChatTurns(userId: string, page: ChatPage): Promise<void> {
	await db
		.update(chatTurns)
		.set({ question: null, answer: null })
		.where(and(eq(chatTurns.userId, userId), toPageFilter(page)))

	// a team conversation stores no attachments, so only a topic clear has files to take with it
	if (page.topicId) {
		await deleteChatAttachments(page.topicId, userId)
	}
}

// stream a chat reply to the user
function streamChatTurn(
	context: Context,
	reply: ChatReplyStream,
	chatTurn: {
		userId: string
		page: ChatPage
		question: string
		isPersisted: boolean
		attachments: ChatAttachment[]
		litellmApiKey?: string
		analyticsProperties: AnalyticsProperties
	},
): Response {
	return stream(context, async (writeStream) => {
		// forward each chunk as it arrives
		try {
			for await (const chunk of reply.textStream) {
				await writeStream.write(chunk)
			}
		} catch (error) {
			// a stream that breaks partway still spent tokens, so it falls through to the recording below
			console.error(`chat stream failed for ${chatTurn.page.topicId ?? chatTurn.page.teamId}`, error)
			// a spent budget is the user's to know about, and the stream is the only place left to say it
			if (isBudgetRejection(error)) {
				await writeStream.write(`\n\n${SPENT_BUDGET_REFUSAL}`)
			} else {
				reportError(error, "chat", { topicId: chatTurn.page.topicId ?? chatTurn.page.teamId ?? "" })
			}
		}

		// record the spend whether the stream finished or broke, so a partial chat turn is never free
		const chatTurnId = await recordFinishedChatTurn(reply, chatTurn)

		// store what was sent once the reply has finished. the summaries take seconds, so they run on
		// past the closed stream. a team conversation stores none
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

// record the finished chat turn's spend and text, and fetch the answer's link preview in the background.
// null if the chat turn stored no text or the recording failed
async function recordFinishedChatTurn(
	reply: ChatReplyStream,
	chatTurn: {
		userId: string
		page: ChatPage
		question: string
		isPersisted: boolean
		analyticsProperties: AnalyticsProperties
	},
): Promise<string | null> {
	try {
		const { text, totalTokens, searchCount } = await reply.completion
		const recordedChatTurnId = await recordChatTurn(
			chatTurn.userId,
			chatTurn.page,
			totalTokens,
			searchCount,
			chatTurn.isPersisted,
			chatTurn.question,
			text,
			chatTurn.analyticsProperties,
		)

		// the answer's first link fetches its link preview card in the background, like the question's
		if (chatTurn.isPersisted) {
			void saveLinkPreviews(text).catch((error) => console.error("chat link preview failed", error))
		}

		// a chat turn that stored no text has no bubble for an attachment to show in
		return chatTurn.isPersisted ? recordedChatTurnId : null
	} catch (error) {
		console.error(`chat turn recording failed for ${chatTurn.page.topicId ?? chatTurn.page.teamId}`, error)
		reportError(error, "chat", { topicId: chatTurn.page.topicId ?? chatTurn.page.teamId ?? "" })
		return null
	}
}

// the response each unallowed authorization status answers with
function toChatRefusal(context: Context, status: "budget" | "signup" | "forbidden"): Response {
	if (status === "budget") {
		return context.json({ error: "budget exhausted" }, 402)
	}
	if (status === "signup") {
		return context.json({ error: "sign up required" }, 401)
	}

	// anything else is a topic this user may not chat on
	return context.json({ error: "forbidden" }, 403)
}

// the answer both chat POST routes stream once authorization allows
async function answerChatTurn(
	context: Context,
	userId: string,
	page: ChatPage,
	authorization: { isOwner: boolean; isPersisted: boolean; litellmApiKey?: string },
	payload: ChatTurnPayload,
	includeAttachments: boolean,
): Promise<Response> {
	// a PDF attachment becomes its extracted text here, and an unreadable one rejects the chat turn in words
	const { question, history, attachments } = payload
	const resolvedAttachments = await resolveChatAttachments(attachments)
	if (resolvedAttachments === null) {
		return context.json({ error: "That PDF couldn't be read." }, 422)
	}

	// the reply reads against the page's own material: one topic, or every topic the team holds
	const chatReply = await streamChatReply({
		topicId: page.topicId,
		teamId: page.teamId,
		question,
		history,
		attachments: resolvedAttachments,
		userId,
		isOwner: authorization.isOwner,
		litellmApiKey: authorization.litellmApiKey,
		includeAttachments,
	})
	if (!chatReply) {
		return context.json({ error: "not found" }, 404)
	}

	// the question's first link fetches its link preview card in the background, never holding the reply
	if (authorization.isPersisted) {
		void saveLinkPreviews(question).catch((error) => console.error("chat link preview failed", error))
	}

	// the stored question names its attachments
	return streamChatTurn(context, chatReply, {
		userId,
		page,
		question: withAttachmentNote(question, attachments),
		isPersisted: authorization.isPersisted,
		attachments,
		litellmApiKey: authorization.litellmApiKey,
		analyticsProperties: toAnalyticsProperties(context),
	})
}

// the chat routes: the conversation, clearing it, and the streamed reply
export const chatRoute = new Hono<AppEnv>()
	.get("/topics/:id/chat", async (context) => {
		// what the panel opens with. the user's stored conversation, what they have kept, and whether they may chat
		const userId = currentUser(context)
		const topicId = context.req.param("id")
		const [chatTurns, authorization, keptAttachments] = await Promise.all([
			loadChatTurns(userId, { topicId }),
			authorizeChatTurn(userId, topicId),
			loadKeptTopicAttachments(userId, topicId),
		])

		// the payload the chat panel renders from
		const chatConversation: ChatConversation = {
			chatTurns,
			canChat: authorization.status === "allowed",
			isSignupRequired: authorization.status === "signup",
			isBudgetExhausted: authorization.status === "budget",
			keptAttachments,
		}
		return context.json(chatConversation)
	})
	.get("/teams/:id/chat", async (context) => {
		// the team-wide conversation the panel opens with. a team chat keeps no attachments of its own
		const userId = currentUser(context)
		const teamId = context.req.param("id")
		const [chatTurns, authorization] = await Promise.all([
			loadChatTurns(userId, { teamId }),
			authorizeTeamChatTurn(userId, teamId),
		])

		// the payload the chat panel renders from, in the topic conversation's own shape
		const chatConversation: ChatConversation = {
			chatTurns,
			canChat: authorization.status === "allowed",
			isSignupRequired: authorization.status === "signup",
			isBudgetExhausted: authorization.status === "budget",
			keptAttachments: [],
		}
		return context.json(chatConversation)
	})
	.delete("/teams/:id/chat", async (context) => {
		// clearing wipes the conversation text while the spend rows stay
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "sign up required" }, 401)
		}
		await clearChatTurns(userId, { teamId: context.req.param("id") })
		return context.json({ ok: true })
	})
	.post("/teams/:id/chat", chatBodyLimit, zValidator("json", chatTurnPayload), async (context) => {
		// membership authorizes the chat turn, and each rejection keeps its own status
		const userId = currentUser(context)
		const teamId = context.req.param("id")
		const authorization = await authorizeTeamChatTurn(userId, teamId)
		if (authorization.status !== "allowed" || !userId) {
			return toChatRefusal(context, authorization.status === "allowed" ? "signup" : authorization.status)
		}

		// the member's own kept files stay out, matching the chat room
		return answerChatTurn(context, userId, { teamId }, authorization, context.req.valid("json"), false)
	})
	.delete("/topics/:id/chat", async (context) => {
		// clearing a chat wipes the chat owner's conversation text while the spend rows stay
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "sign up required" }, 401)
		}
		await clearChatTurns(userId, { topicId: context.req.param("id") })
		return context.json({ ok: true })
	})
	.post("/topics/:id/chat", chatBodyLimit, zValidator("json", chatTurnPayload), async (context) => {
		// authorize the chat turn first. each rejection reads differently to the user, so each gets its own status
		const userId = currentUser(context)
		const topicId = context.req.param("id")
		const authorization = await authorizeChatTurn(userId, topicId)

		// an exhausted budget is counted before it refuses
		if (authorization.status === "budget" && userId) {
			trackEvent("chat_budget_reached", userId, { ...toAnalyticsProperties(context), topicId })
		}
		if (authorization.status !== "allowed") {
			return toChatRefusal(context, authorization.status)
		}

		// the gate already rejected a signed-out visitor with "signup", so this narrows the type alone
		if (!userId) {
			return context.json({ error: "sign up required" }, 401)
		}
		return answerChatTurn(context, userId, { topicId }, authorization, context.req.valid("json"), true)
	})
