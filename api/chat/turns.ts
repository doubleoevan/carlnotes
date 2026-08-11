// authorizing and metering one chat turn. the reply itself is generated in the worker
import { zValidator } from "@hono/zod-validator"
import { trackEvent } from "@shared/analytics"
import { type ChatAttachment, type ChatConversation, chatTurnPayload, withAttachmentNote } from "@shared/contracts"
import { reportError } from "@shared/monitoring"
import { and, desc, eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { bodyLimit } from "hono/body-limit"
import { stream } from "hono/streaming"
import { db } from "../../db"
import { chatTurns, topics, users } from "../../db/schema"
import { type ChatReplyStream, streamChatReply } from "../../worker"
import { CHAT_COST_PER_MILLION_TOKENS, EXA_COST_PER_SEARCH, tokenCost } from "../../worker/budget"
import { isAllowed } from "../authorization"
import type { AnalyticsProperties } from "../currentUser"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { deleteChatAttachments, keepChatAttachments, loadKeptAttachments, resolveChatAttachments } from "./attachments"
import { decryptChatText, encryptChatText } from "./encryption"

// the answers to a chat turn request. signup routes a visitor to the signup page and budget prompts an
// upgrade, so the rejections stay apart. an allowed chat turn includes the caller's own model key, so its spend
// lands under their proxy budget the way a scan's does
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type ChatTurnAuthorization = { status: "allowed"; isOwner: boolean; isPersisted: boolean; litellmApiKey?: string } | { status: "signup" } | { status: "forbidden" } | { status: "budget" }

/**
 * Whether this caller may take a chat turn on the topic right now, and how that chat turn should be recorded.
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

	// the one rejection left for a signed-in caller who can see the topic is the budget
	if (!(await isAllowed(userId, "chat:send", topic))) {
		return { status: "budget" }
	}

	// the gate decides whether the chat turn keeps its text, and its model calls bill to the caller's own key
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
 * Record a finished chat turn's spend, keeping its text only when the gate allows the caller that.
 * A chat turn that streamed and then failed still records, so a partial chat turn is never free.
 */
export async function recordChatTurn(
	userId: string,
	topicId: string,
	totalTokens: number,
	searchCount: number,
	isPersisted: boolean,
	question: string,
	answer: string,
	analyticsProperties: AnalyticsProperties,
): Promise<void> {
	await db
		.insert(chatTurns)
		.values(toChatTurnRow(userId, topicId, totalTokens, searchCount, isPersisted, question, answer))

	// the event goes with the row, so a chat turn is counted exactly when it is metered
	trackEvent("chat_turn_sent", userId, { ...analyticsProperties, topicId })
}

/**
 * The row one finished chat turn writes. Its cost is the same best-effort token total a scan uses plus what its
 * web searches cost, since LiteLLM meters the authoritative figure.
 */
export function toChatTurnRow(
	userId: string,
	topicId: string,
	totalTokens: number,
	searchCount: number,
	isPersisted: boolean,
	question: string,
	answer: string,
): typeof chatTurns.$inferInsert {
	// a chat turn that does not persist stores null text, so its row is a meter entry and nothing more.
	// persisted text stores encrypted, so the database never holds the conversation readable
	return {
		userId,
		topicId,
		cost: (tokenCost(totalTokens, CHAT_COST_PER_MILLION_TOKENS) + searchCount * EXA_COST_PER_SEARCH).toFixed(6),
		question: isPersisted ? encryptChatText(question) : null,
		answer: isPersisted ? encryptChatText(answer) : null,
	}
}

/**
 * The caller's stored chat turns for a topic, oldest first. The whole conversation, since the panel virtualizes its list.
 */
export async function loadChatTurns(
	userId: string | null,
	topicId: string,
): Promise<{ question: string; answer: string; at: string }[]> {
	// a visitor, or anyone the gate rejects persistence, has nothing stored to read
	if (!userId || !(await isAllowed(userId, "chat:persist"))) {
		return []
	}

	// newest first off the index, then flipped back into reading order
	const chatTurnRows = await db
		.select({ question: chatTurns.question, answer: chatTurns.answer, createdAt: chatTurns.createdAt })
		.from(chatTurns)
		.where(and(eq(chatTurns.userId, userId), eq(chatTurns.topicId, topicId)))
		.orderBy(desc(chatTurns.createdAt))

	// decrypt each stored pair, dropping the meter-only rows and any text that fails to verify
	return chatTurnRows.reverse().flatMap((row) => {
		if (row.question === null || row.answer === null) {
			return []
		}

		// a pair is replayed only when both sides decrypt, since half a chat turn reads as a glitch
		const question = decryptChatText(row.question)
		const answer = decryptChatText(row.answer)
		return question !== null && answer !== null ? [{ question, answer, at: row.createdAt.toISOString() }] : []
	})
}

/**
 * Clear the caller's conversation with a topic: every chat turn's text is nulled and everything they kept for the
 * topic goes with it, since a kept file is conversation memory. The chat turn rows stay because they are the spend
 * ledger, and deleting them would let a cleared chat reset the month's meter.
 */
export async function clearChatTurns(userId: string, topicId: string): Promise<void> {
	await db
		.update(chatTurns)
		.set({ question: null, answer: null })
		.where(and(eq(chatTurns.userId, userId), eq(chatTurns.topicId, topicId)))
	await deleteChatAttachments(topicId, userId)
}

// stream a chat reply to the user, then record what the chat turn spent and keep the attachments they asked to keep.
// the reply streams as it is generated
function streamChatTurn(
	context: Context,
	reply: ChatReplyStream,
	chatTurn: {
		userId: string
		topicId: string
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
			console.error(`chat stream failed for topic ${chatTurn.topicId}`, error)
			reportError(error, "chat", { topicId: chatTurn.topicId })
		}

		// record the spend whether the stream finished or broke, so a partial chat turn is never free
		try {
			const { text, totalTokens, searchCount } = await reply.completion
			await recordChatTurn(
				chatTurn.userId,
				chatTurn.topicId,
				totalTokens,
				searchCount,
				chatTurn.isPersisted,
				chatTurn.question,
				text,
				chatTurn.analyticsProperties,
			)
		} catch (error) {
			// a failed spend recording must not break a reply
			console.error(`chat turn recording failed for topic ${chatTurn.topicId}`, error)
			reportError(error, "chat", { topicId: chatTurn.topicId })
		}

		// keep what the user marked once the reply has landed. this is not awaited,
		// since generating the summaries takes seconds and would hold a finished stream open long enough to read as a hung reply
		keepChatAttachments(chatTurn.userId, chatTurn.topicId, chatTurn.attachments, chatTurn.litellmApiKey).catch(
			(error) => {
				console.error(`keeping chat attachments failed for topic ${chatTurn.topicId}`, error)
				reportError(error, "chat", { topicId: chatTurn.topicId })
			},
		)
	})
}

// the chat routes: the conversation, clearing it, and the streamed reply
export const chatRoute = new Hono<AppEnv>()
	.get("/topics/:id/chat", async (context) => {
		// what the panel opens with. the caller's stored conversation, what they have kept, and whether they may chat
		const userId = currentUser(context)
		const topicId = context.req.param("id")
		const [chatTurns, authorization, keptAttachments] = await Promise.all([
			loadChatTurns(userId, topicId),
			authorizeChatTurn(userId, topicId),
			loadKeptAttachments(userId, topicId),
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
	.delete("/topics/:id/chat", async (context) => {
		// clearing a chat wipes the chat owner's conversation text while the spend rows stay
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "sign up required" }, 401)
		}
		await clearChatTurns(userId, context.req.param("id"))
		return context.json({ ok: true })
	})
	.post(
		"/topics/:id/chat",
		// cap the chat turn body before json parsing buffers it. four data-url images at their contract cap, with room to spare
		bodyLimit({
			maxSize: 26 * 1024 * 1024,
			onError: (context) => context.json({ error: "Those attachments are too large." }, 413),
		}),
		zValidator("json", chatTurnPayload),
		async (context) => {
			// authorize the chat turn first. each rejection reads differently to the user, so each gets its own status
			const userId = currentUser(context)
			const topicId = context.req.param("id")
			const { question, history, attachments } = context.req.valid("json")
			const authorization = await authorizeChatTurn(userId, topicId)

			// an exhausted budget prompts an upgrade
			if (authorization.status === "budget") {
				if (userId) {
					trackEvent("chat_budget_reached", userId, { ...toAnalyticsProperties(context), topicId })
				}
				return context.json({ error: "budget exhausted" }, 402)
			}
			// a signed-out caller is sent to signup instead
			if (authorization.status === "signup") {
				return context.json({ error: "sign up required" }, 401)
			}
			// anything left is a visibility rejection
			if (authorization.status !== "allowed") {
				return context.json({ error: "forbidden" }, 403)
			}
			// the gate already rejected a signed-out caller with "signup", so this narrows the type alone
			if (!userId) {
				return context.json({ error: "sign up required" }, 401)
			}

			// a PDF attachment becomes its extracted text here, and an unreadable one rejects the chat turn in words
			const resolvedAttachments = await resolveChatAttachments(attachments)
			if (resolvedAttachments === null) {
				return context.json({ error: "That PDF couldn't be read." }, 422)
			}

			// stream a chat reply against the topic's own material
			const chatReply = await streamChatReply({
				topicId,
				question,
				history,
				attachments: resolvedAttachments,
				userId,
				isOwner: authorization.isOwner,
				litellmApiKey: authorization.litellmApiKey,
			})
			if (!chatReply) {
				return context.json({ error: "not found" }, 404)
			}
			// the stored question names its attachments, since the attachments themselves are sent only to the model
			return streamChatTurn(context, chatReply, {
				userId,
				topicId,
				question: withAttachmentNote(question, attachments),
				isPersisted: authorization.isPersisted,
				attachments,
				litellmApiKey: authorization.litellmApiKey,
				analyticsProperties: toAnalyticsProperties(context),
			})
		},
	)
