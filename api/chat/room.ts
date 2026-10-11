import { trackEvent } from "@shared/analytics"
import { hasAllMention, hasModelMention, isModelChatMessage } from "@shared/chatMentions"
import { reportError } from "@shared/monitoring"
import type { ChatAttachment } from "@shared/payloads"
import { eq } from "drizzle-orm"
import type { Context } from "hono"
import { streamSSE } from "hono/streaming"
import { db } from "../../db"
import { chatRoomMessages } from "../../db/schema/chat"
import { users } from "../../db/schema/users"
import { isBudgetRejection, MODEL_CHAT_TURN_FAILED_REJECTION, SPENT_BUDGET_REJECTION } from "../../worker"
import { isMonthlySpendExhausted } from "../authorization"
import type { AnalyticsProperties } from "../currentUser"
import { encryptChatText } from "./encryption"
import { saveLinkPreviews } from "./linkPreviews"
import { saveChatMentions } from "./mentions"
import { loadChatRoom } from "./roomAccess"
import { prepareChatRoomAttachments, storeChatRoomAttachment } from "./roomAttachments"
import { loadChatRoomDeltas, loadChatRoomMessages } from "./roomMessages"
import { notifyChatRoomMessage, onChatRoomMessage } from "./roomStream"
import { postModelRejection, runModelChatRoomTurn } from "./roomTurns"

// how long one SSE stream may stay open. the api client's cursor resume makes the reconnect free
const CHAT_ROOM_STREAM_MAX_AGE_MS = 15 * 60 * 1000

/**
 * Post a chat message into the chatRoom. Member chat mentions become notification rows, and a chat message that addresses Carl
 * starts his chat turn, unless the poster's budget is spent, in which case the rejection comes back privately in this
 * response and nothing posts to the chat room.
 */
export async function postChatRoomMessage(
	userId: string,
	topicId: string | null,
	teamId: string,
	content: string,
	replyToChatMessageId: number | null,
	attachments: ChatAttachment[],
	analyticsProperties?: AnalyticsProperties,
): Promise<
	{ chatMessageId: number; rejectionReason: string | null } | "attachmentRejected" | "attachmentLimitReached" | null
> {
	const chatRoom = await loadChatRoom(userId, topicId, teamId)
	if (!chatRoom) {
		return null
	}

	// whether this chat message gives carl the chat turn. his chat mention, the room-wide @all, or a reply to his chat message
	const isModelChatTurn =
		hasModelMention(content) || hasAllMention(content) || (await isReplyToModel(replyToChatMessageId))

	// the budget gate runs before anything posts, so a spent budget is reported privately and spends nothing
	if (isModelChatTurn && (await isMonthlySpendExhausted(userId))) {
		return { chatMessageId: 0, rejectionReason: SPENT_BUDGET_REJECTION }
	}

	// every shared file is screened and read before the chat message is stored, so one rejected file posts nothing at all
	const preparedAttachments = await prepareChatRoomAttachments(userId, topicId, teamId, attachments)
	if (preparedAttachments === null || preparedAttachments === "attachmentLimitReached") {
		return preparedAttachments === null ? "attachmentRejected" : "attachmentLimitReached"
	}

	// the poster's name is recorded at post-time, which is what keeps attribution and deletes the attachment if the account closes
	const [author] = await db.select({ username: users.username }).from(users).where(eq(users.id, userId))
	const [chatMessageRow] = await db
		.insert(chatRoomMessages)
		.values({
			topicId,
			teamId,
			authorUserId: userId,
			authorUsername: author?.username ?? "someone",
			replyToMessageId: replyToChatMessageId ?? undefined,
			content: encryptChatText(content),
		})
		.returning({ id: chatRoomMessages.id })
	if (!chatMessageRow) {
		return null
	}

	// each attachment file's row is stored beside its chat message, so the chat messages and the stream both include it
	for (const preparedAttachment of preparedAttachments) {
		await storeChatRoomAttachment(
			userId,
			author?.username ?? "someone",
			topicId,
			teamId,
			chatMessageRow.id,
			preparedAttachment,
		)
	}

	// the link preview cards fetch in the background, so the chat message loads for everyone without waiting on its links
	void saveLinkPreviews(content, chatRoom.teamId).catch((error) =>
		console.error("chat room link preview failed", error),
	)
	await notifyChatRoomMessage(topicId, teamId, chatMessageRow.id)

	// team member chat mentions and the replied-to author become rows that the chat mention badges read
	await saveChatMentions(chatRoom.teamId, userId, chatMessageRow.id, content, replyToChatMessageId ?? null)

	// report the post: which kind of room, whether carl was asked, and whether a file came with it
	trackChatRoomMessage({
		userId,
		topicId,
		teamId,
		isModelChatTurn,
		hasAttachment: attachments.length > 0,
		analyticsProperties,
	})

	// carl's turn runs after the post returns, its chat messages read serialized by the chat room lock
	if (isModelChatTurn) {
		const promptChatMessageId = chatMessageRow.id
		runModelChatRoomTurn(userId, chatRoom.topic, teamId, promptChatMessageId).catch(async (error) => {
			console.error("carl chat room turn failed", error)
			if (!isBudgetRejection(error)) {
				reportError(error, "chat", { teamId })
			}

			// every failure posts a rejection as carl's own chat message
			const rejection = isBudgetRejection(error) ? SPENT_BUDGET_REJECTION : MODEL_CHAT_TURN_FAILED_REJECTION
			await postModelRejection(chatRoom.topic?.id ?? null, teamId, promptChatMessageId, rejection).catch(
				(rejectionError) => console.error("carl rejection post failed", rejectionError),
			)
		})
	}
	return { chatMessageId: chatMessageRow.id, rejectionReason: null }
}

// a posted chat message's event: the room it went to, whether carl was asked, and whether a file came with it
type TrackChatRoomMessageOptions = {
	userId: string
	topicId: string | null
	teamId: string
	isModelChatTurn: boolean
	hasAttachment: boolean
	analyticsProperties: AnalyticsProperties | undefined
}

// report a posted chat message. a topic's room names the topic, and a team's own room names the team alone
function trackChatRoomMessage({
	userId,
	topicId,
	teamId,
	isModelChatTurn,
	hasAttachment,
	analyticsProperties,
}: TrackChatRoomMessageOptions): void {
	trackEvent("room_message_sent", userId, {
		...analyticsProperties,
		teamId,
		...(topicId ? { topicId } : {}),
		roomKind: topicId ? "topic" : "team",
		mentionsCarl: isModelChatTurn,
		hasAttachment,
	})
}

// whether the replied-to chat message is carl's, which continues his exchange without a fresh chat mention
async function isReplyToModel(replyToChatMessageId: number | null): Promise<boolean> {
	if (!replyToChatMessageId) {
		return false
	}

	// carl's rows have his name and no account reference. the id alone resolves the chat message
	const [repliedTo] = await db
		.select({ authorUserId: chatRoomMessages.authorUserId, authorUsername: chatRoomMessages.authorUsername })
		.from(chatRoomMessages)
		.where(eq(chatRoomMessages.id, replyToChatMessageId))
	return repliedTo ? isModelChatMessage(repliedTo) : false
}

/**
 * Returns the SSE stream of one chat room, which catches up from the cursor and then sends each new message.
 */
export function streamChatRoomEvents(context: Context, topicId: string | null, teamId: string): Response {
	return streamSSE(context, async (stream) => {
		// the heartbeat keeps the stream detectably alive. a dead socket behind a proxy stays silent
		const heartbeat = setInterval(() => void stream.writeSSE({ event: "ping", data: "" }), 25_000)
		// catch up from the cursor first, so a reconnect misses nothing and replays nothing
		let cursor = Number(context.req.query("after") ?? 0)
		for (const chatMessage of await loadChatRoomMessages(topicId, teamId, cursor)) {
			await stream.writeSSE({ id: String(chatMessage.id), event: "message", data: JSON.stringify(chatMessage) })
			cursor = chatMessage.id
		}

		// each notification's delivery chains onto the last, so a burst never reads the cursor before the prior delta advanced it
		await new Promise<void>((resolve) => {
			let notificationDeliveryChain = Promise.resolve()
			const stopListening = onChatRoomMessage(topicId, teamId, (chatMessageId, roomToolCalls) => {
				// each notification delivers everything past the cursor, and the api client dedupes replays by id
				notificationDeliveryChain = notificationDeliveryChain
					.then(async () => {
						// write each new chat message and advance the cursor past it
						for (const chatMessage of await loadChatRoomDeltas(topicId, teamId, cursor, chatMessageId)) {
							await stream.writeSSE({ id: String(chatMessage.id), event: "message", data: JSON.stringify(chatMessage) })
							cursor = Math.max(cursor, chatMessage.id)
						}
						// send the toast lines and any proposed topic edit carl's topic tools left
						if (
							roomToolCalls.topicSaves.length > 0 ||
							roomToolCalls.topicSaveRejections.length > 0 ||
							roomToolCalls.proposedToUserId !== undefined
						) {
							await stream.writeSSE({ event: "topicToolCalls", data: JSON.stringify(roomToolCalls) })
						}
					})
					// log a failed delivery and keep the chain running
					.catch((error) => console.error("chat room delta delivery failed", error))
			})

			// one teardown for both endings
			const endStream = (): void => {
				clearInterval(heartbeat)
				clearTimeout(maxAge)
				stopListening()
				resolve()
			}

			// the age limit closes the socket, and the api client's cursor resume reconnects for free
			const maxAge = setTimeout(() => {
				endStream()
				void stream.close()
			}, CHAT_ROOM_STREAM_MAX_AGE_MS)
			stream.onAbort(endStream)
		})
	})
}
