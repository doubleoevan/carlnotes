import type { ChatRoomAttachmentRejection } from "@carlnotes/contracts/chat"
import { hasAllMention, hasModelMention, isModelChatMessage } from "@carlnotes/contracts/chatMentions"
import type { ChatAttachment } from "@carlnotes/contracts/payloads"
import { db } from "@carlnotes/db"
import { chatRoomMessages } from "@carlnotes/db/schema/chat"
import { isBudgetRejection, MODEL_CHAT_TURN_FAILED_REJECTION, SPENT_BUDGET_REJECTION } from "@carlnotes/models/models"
import { reserveUserSpend, type SpendReservation, toReleaseOnFailure } from "@carlnotes/models/spendReservations"
import { maxChatTurnDollars, toAttachmentChars } from "@carlnotes/pipeline/chat/chatTurnCost"
import { startChatMentionPushWorkflow } from "@carlnotes/pipeline/temporalClient"
import { trackEvent } from "@carlnotes/server/analytics"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq } from "drizzle-orm"
import type { AnalyticsProperties } from "../currentUser"
import { loadUsername } from "../usernames"
import { encryptChatText } from "./encryption"
import { saveLinkPreviews } from "./linkPreviews"
import { saveChatMentions } from "./mentions"
import { loadChatRoom, toTopicFilter } from "./roomAccess"
import { prepareChatRoomAttachments, storeChatRoomAttachment } from "./roomAttachments"
import { loadModelRoomQuestionChars } from "./roomQuestion"
import { notifyChatRoomMessage } from "./roomStream"
import { postModelRejection, runModelChatRoomTurn } from "./roomTurns"

// what a post reports with, and whether the chat message was spoken, which marks it and carl's reply
export type PostChatRoomMessageOptions = { analyticsProperties?: AnalyticsProperties; isSpoken?: boolean }

/**
 * Post a chat message into the chatRoom. Member chat mentions become notification rows, and a chat message that addresses Carl
 * starts his chat turn, unless the poster's spend and open reservations have already reached the budget, in which case
 * the rejection comes back privately in this response and nothing posts to the chat room.
 */
export async function postChatRoomMessage(
	userId: string,
	topicId: string | null,
	teamId: string,
	content: string,
	replyToChatMessageId: number | null,
	attachments: ChatAttachment[],
	{ analyticsProperties, isSpoken = false }: PostChatRoomMessageOptions = {},
): Promise<{ chatMessageId: number; rejectionReason: string | null } | ChatRoomAttachmentRejection | null> {
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

	// the budget gate reserves carl's chat turn's largest cost before anything posts, so a budget that the spend and
	// open reservations have reached is reported privately and spends nothing
	const reservation = isModelChatTurn
		? await reserveModelChatRoomTurn({ userId, topicId, teamId, content, attachments })
		: null
	if (reservation === "rejected") {
		return { chatMessageId: 0, rejectionReason: SPENT_BUDGET_REJECTION }
	}

	// store the chat message, and release the reservation if carl's chat turn never starts
	const chatMessageId = await storeChatRoomMessage({
		userId,
		topicId,
		teamId,
		content,
		replyToChatMessageId,
		attachments,
		chatRoomTeamId: chatRoom.teamId,
		isModelChatTurn,
		isSpoken,
		analyticsProperties,
	}).catch(toReleaseOnFailure(reservation))
	if (typeof chatMessageId !== "number") {
		await reservation?.release()
		return chatMessageId
	}

	// carl's chat turn runs after the post returns, its chat messages read serialized by the chat room lock.
	// its reservation is released once the turn has saved its spend row or failed
	if (reservation) {
		runModelChatRoomTurn(userId, chatRoom.topic, teamId, chatMessageId)
			.catch(async (error) => {
				console.error("carl chat room turn failed", error)
				if (!isBudgetRejection(error)) {
					reportError(error, "chat", { teamId })
				}

				// every failure posts a rejection as carl's own chat message
				const rejection = isBudgetRejection(error) ? SPENT_BUDGET_REJECTION : MODEL_CHAT_TURN_FAILED_REJECTION
				await postModelRejection(chatRoom.topic?.id ?? null, teamId, chatMessageId, rejection).catch((rejectionError) =>
					console.error("carl rejection post failed", rejectionError),
				)
			})
			.finally(() => reservation.release())
	}
	return { chatMessageId, rejectionReason: null }
}

// the poster, the chat room, and the chat message that carl's chat turn would answer
type ReserveModelChatRoomTurnOptions = {
	userId: string
	topicId: string | null
	teamId: string
	content: string
	attachments: ChatAttachment[]
}

// reserve the largest cost of carl's chat turn on a chat message about to post: the chat room's question as stored
// now, with the chat message and its attachments added
async function reserveModelChatRoomTurn({
	userId,
	topicId,
	teamId,
	content,
	attachments,
}: ReserveModelChatRoomTurnOptions): Promise<SpendReservation | "rejected"> {
	const storedQuestionChars = await loadModelRoomQuestionChars(topicId, teamId)
	const messageChars = storedQuestionChars + content.length + toAttachmentChars(attachments)
	return reserveUserSpend({ userId, kind: "chatTurn", maxDollars: maxChatTurnDollars({ messageChars }) })
}

// one chat message to store: who posted it in which chat room, what it says and answers, its attachments, and what its
// event reports
type StoreChatRoomMessageOptions = {
	userId: string
	topicId: string | null
	teamId: string
	content: string
	replyToChatMessageId: number | null
	attachments: ChatAttachment[]
	// the team the chat room belongs to, which the link previews and the chat mentions name
	chatRoomTeamId: string
	isModelChatTurn: boolean
	isSpoken: boolean
	analyticsProperties: AnalyticsProperties | undefined
}

// store a chat message with its attachments, fan it out, save its chat mentions, and report it. returns the chat
// message's id, why its attachments did not post, or null if the row was not stored
async function storeChatRoomMessage({
	userId,
	topicId,
	teamId,
	content,
	replyToChatMessageId,
	attachments,
	chatRoomTeamId,
	isModelChatTurn,
	isSpoken,
	analyticsProperties,
}: StoreChatRoomMessageOptions): Promise<number | ChatRoomAttachmentRejection | null> {
	// every shared file is screened and read before the chat message is stored, so one rejected file posts nothing at all
	const preparedAttachments = await prepareChatRoomAttachments(userId, topicId, teamId, attachments)
	if (preparedAttachments === null) {
		return "attachmentRejected"
	}
	if (typeof preparedAttachments === "string") {
		return preparedAttachments
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
	void saveLinkPreviews(content, chatRoomTeamId).catch((error) => console.error("chat room link preview failed", error))
	await notifyChatRoomMessage(topicId, teamId, chatMessageRow.id)

	// team member chat mentions and the replied-to author become rows that the chat mention badges read
	const mentionedUserCount = await saveChatMentions(
		chatRoomTeamId,
		userId,
		chatMessageRow.id,
		content,
		replyToChatMessageId ?? null,
	)

	// start the chat mention push in the background if the message mentioned anyone
	if (mentionedUserCount > 0) {
		void startChatMentionPushWorkflow(chatMessageRow.id).catch((error) =>
			reportError(error, "push", { chatMessageId: String(chatMessageRow.id) }),
		)
	}

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
	return chatMessageRow.id
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
