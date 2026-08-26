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

// the outcomes of a chat turn request
// biome-ignore format: one line keeps the union under the comment-density hook's limit
export type ChatTurnAuthorization = { status: "allowed"; isOwner: boolean; isPersisted: boolean; litellmApiKey?: string } | { status: "signup" } | { status: "forbidden" } | { status: "budget" }

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
 * Record a finished chat turn's spend, keeping its text only when the gate allows the user that.
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
 * Record a chat room completion into the same chat ledger a private chat turn writes, with the chat room message it
 * answered and its token total. The billed member's monthly budget reads this row like any other.
 */
export async function recordChatRoomTurn(
	userId: string,
	topicId: string | null,
	teamId: string,
	roomMessageId: number,
	completion: { totalTokens: number; searchCount: number },
): Promise<void> {
	// the text lives in the room's messages, so the ledger row stores only the meter and the reference
	const row = toChatTurnRow(userId, topicId, completion.totalTokens, completion.searchCount, false, "", "")
	await db
		.insert(chatTurns)
		.values({ ...row, roomMessageId, teamId: topicId === null ? teamId : null, totalTokens: completion.totalTokens })
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
): typeof chatTurns.$inferInsert {
	// a chat turn that does not persist stores null text, so its row is a meter entry and nothing more
	return {
		userId,
		topicId,
		cost: (tokenCost(totalTokens, CHAT_COST_PER_MILLION_TOKENS) + searchCount * EXA_COST_PER_SEARCH).toFixed(6),
		question: isPersisted ? encryptChatText(question) : null,
		answer: isPersisted ? encryptChatText(answer) : null,
	}
}

/**
 * The user's stored chat turns for a topic, oldest first. The whole conversation.
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
	return chatTurnRows.reverse().flatMap((chatTurnRow) => {
		if (chatTurnRow.question === null || chatTurnRow.answer === null) {
			return []
		}

		// a pair is replayed only when both sides decrypt
		const question = decryptChatText(chatTurnRow.question)
		const answer = decryptChatText(chatTurnRow.answer)
		return question !== null && answer !== null ? [{ question, answer, at: chatTurnRow.createdAt.toISOString() }] : []
	})
}

/**
 * Clear the user's conversation with a topic: every chat turn's text is nulled and everything they kept for the
 * topic goes with it. The chat turn rows stay as the spend
 * ledger, and deleting them would let a cleared chat reset the month's meter.
 */
export async function clearChatTurns(userId: string, topicId: string): Promise<void> {
	await db
		.update(chatTurns)
		.set({ question: null, answer: null })
		.where(and(eq(chatTurns.userId, userId), eq(chatTurns.topicId, topicId)))
	await deleteChatAttachments(topicId, userId)
}

// stream a chat reply to the user
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

		// keep what the user marked once the reply has finished. the summaries take seconds, so they run on
		// past the closed stream
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
		// what the panel opens with. the user's stored conversation, what they have kept, and whether they may chat
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
		// limit the chat turn body before json parsing buffers it
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
			// a signed-out visitor is sent to signup instead
			if (authorization.status === "signup") {
				return context.json({ error: "sign up required" }, 401)
			}
			// anything left is a visibility rejection
			if (authorization.status !== "allowed") {
				return context.json({ error: "forbidden" }, 403)
			}
			// the gate already rejected a signed-out visitor with "signup", so this narrows the type alone
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
			// the stored question names its attachments
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
