import { hasAllMention, hasModelMention, isModelChatMessage } from "@carlnotes/contracts/chatMentions"
import type { ChatAttachment } from "@carlnotes/contracts/payloads"
import { db } from "@carlnotes/db"
import { chatRoomMessages } from "@carlnotes/db/schema/chat"
import { isBudgetRejection, MODEL_CHAT_TURN_FAILED_REJECTION, SPENT_BUDGET_REJECTION } from "@carlnotes/models/models"
import { trackEvent } from "@carlnotes/server/analytics"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq } from "drizzle-orm"
import type { Context } from "hono"
import { streamSSE } from "hono/streaming"
import { isMonthlySpendExhausted } from "../authorization"
import type { AnalyticsProperties } from "../currentUser"
import { loadUsername } from "../usernames"
import { encryptChatText } from "./encryption"
import { saveLinkPreviews } from "./linkPreviews"
import { saveChatMentions } from "./mentions"
import { loadChatRoom, toTopicFilter } from "./roomAccess"
import { prepareChatRoomAttachments, storeChatRoomAttachment } from "./roomAttachments"
import { loadChatRoomDeltas, loadChatRoomMessages } from "./roomMessages"
import { notifyChatRoomMessage, onChatRoomMessage } from "./roomStream"
import { postModelRejection, runModelChatRoomTurn } from "./roomTurns"

// how long one SSE stream may stay open. the api client's cursor resume makes the reconnect free
const CHAT_ROOM_STREAM_MAX_AGE_MS = 15 * 60 * 1000

// what a post reports with, and whether the chat message was spoken, which marks it and carl's reply
export type PostChatRoomMessageOptions = { analyticsProperties?: AnalyticsProperties; isSpoken?: boolean }

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
	{ analyticsProperties, isSpoken = false }: PostChatRoomMessageOptions = {},
): Promise<
	{ chatMessageId: number; rejectionReason: string | null } | "attachmentRejected" | "attachmentLimitReached" | null
> {
	const chatRoom = await loadChatRoom(userId, topicId, teamId)
	if (!chatRoom) {
		return null
	}

	// a reply answers a chat message in this same chat room, and one outside it reads like a missing chat room
	const repliedToChatMessage = await loadRepliedToChatMessage({ replyToChatMessageId, topicId, teamId })
	if (replyToChatMessageId !== null && !repliedToChatMessage) {
		return null
	}

	// whether this chat message gives carl the chat turn
	const isModelChatTurn = isModelAddressed(content, repliedToChatMessage)

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
	const authorUsername = (await loadUsername(userId)) ?? "someone"
	const [chatMessageRow] = await db
		.insert(chatRoomMessages)
		.values({
			topicId,
			teamId,
			authorUserId: userId,
			authorUsername,
			replyToMessageId: replyToChatMessageId ?? undefined,
			content: encryptChatText(content),
			isSpoken,
		})
		.returning({ id: chatRoomMessages.id })
	if (!chatMessageRow) {
		return null
	}

	// each attachment file's row is stored beside its chat message, so the chat messages and the stream both include it
	for (const preparedAttachment of preparedAttachments) {
		await storeChatRoomAttachment(userId, authorUsername, topicId, teamId, chatMessageRow.id, preparedAttachment)
	}

	// the link preview cards fetch in the background, so the chat message loads for everyone without waiting on its links
	void saveLinkPreviews(content, chatRoom.teamId).catch((error) =>
		console.error("chat room link preview failed", error),
	)
	await notifyChatRoomMessage(topicId, teamId, chatMessageRow.id)

	// team member chat mentions and the replied-to author become rows that the chat mention badges read
	await saveChatMentions(chatRoom.teamId, userId, chatMessageRow.id, content, replyToChatMessageId ?? null)

	// report the post: which kind of room, whether carl was asked, whether a file came with it, and whether it was spoken
	trackChatRoomMessage({
		userId,
		topicId,
		teamId,
		isModelChatTurn,
		hasAttachment: attachments.length > 0,
		isSpoken,
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

// a posted chat message's event: the room it went to, whether carl was asked, whether a file came with it,
// and whether it was spoken
type TrackChatRoomMessageOptions = {
	userId: string
	topicId: string | null
	teamId: string
	// what the chat message asked for and came with
	isModelChatTurn: boolean
	hasAttachment: boolean
	isSpoken: boolean
	analyticsProperties: AnalyticsProperties | undefined
}

// report a posted chat message. a topic's room names the topic, and a team's own room names the team alone
function trackChatRoomMessage({
	userId,
	topicId,
	teamId,
	isModelChatTurn,
	hasAttachment,
	isSpoken,
	analyticsProperties,
}: TrackChatRoomMessageOptions): void {
	trackEvent("room_message_sent", userId, {
		...analyticsProperties,
		teamId,
		...(topicId ? { topicId } : {}),
		roomKind: topicId ? "topic" : "team",
		mentionsCarl: isModelChatTurn,
		hasAttachment,
		isSpoken,
	})
}

// the author fields of a replied-to chat message, which say whether it is carl's
type RepliedToChatMessage = { authorUserId: string | null; authorUsername: string }

// whether a chat message addresses carl: his chat mention, the room-wide @all, or a reply to his chat message
function isModelAddressed(content: string, repliedToChatMessage: RepliedToChatMessage | null): boolean {
	return (
		hasModelMention(content) ||
		hasAllMention(content) ||
		(repliedToChatMessage !== null && isModelChatMessage(repliedToChatMessage))
	)
}

// the replied-to chat message id, and the chat room the reply posts into
type LoadRepliedToChatMessageOptions = { replyToChatMessageId: number | null; topicId: string | null; teamId: string }

// the replied-to chat message's author fields if it sits in this chat room, or null for no reply or one outside it
async function loadRepliedToChatMessage({
	replyToChatMessageId,
	topicId,
	teamId,
}: LoadRepliedToChatMessageOptions): Promise<RepliedToChatMessage | null> {
	if (replyToChatMessageId === null) {
		return null
	}

	// the row by id within this team's chat room for the topic, or within the team's own chat room for no topic
	const [repliedToChatMessage] = await db
		.select({ authorUserId: chatRoomMessages.authorUserId, authorUsername: chatRoomMessages.authorUsername })
		.from(chatRoomMessages)
		.where(
			and(
				eq(chatRoomMessages.id, replyToChatMessageId),
				eq(chatRoomMessages.teamId, teamId),
				toTopicFilter(chatRoomMessages.topicId, topicId),
			),
		)
	return repliedToChatMessage ?? null
}

/**
 * Returns the SSE stream of one chat room, which catches up from the cursor and then sends each new message.
 */
export function streamChatRoomEvents(context: Context, topicId: string | null, teamId: string): Response {
	return streamSSE(context, async (stream) => {
		// catch up from the cursor first, so a reconnect misses nothing and replays nothing
		let cursor = toChatMessageIdParam(context.req.query("after"))
		for (const chatMessage of await loadChatRoomMessages(topicId, teamId, cursor)) {
			await stream.writeSSE({ id: String(chatMessage.id), event: "message", data: JSON.stringify(chatMessage) })
			cursor = chatMessage.id
		}

		// the heartbeat keeps the stream detectably alive, and starts once the catch-up is done. a dead socket behind a
		// proxy stays silent
		const heartbeat = setInterval(() => void stream.writeSSE({ event: "ping", data: "" }), 25_000)

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

/**
 * Returns the chat message id a cursor param names, or zero for a param that names none.
 */
export function toChatMessageIdParam(chatMessageIdParam: string | undefined): number {
	const chatMessageId = Number(chatMessageIdParam)
	return Number.isSafeInteger(chatMessageId) && chatMessageId > 0 ? chatMessageId : 0
}
