// the api client for a team topic's chat room and a team's own chat room: the chat messages, the post, and the stream url
import {
	CHAT_ROOM_ATTACHMENT_ERRORS,
	type ChatRoom,
	type ChatRoomAttachmentRejection,
	type ChatRoomMessageLinkPreviewsResponse,
	type ChatRoomMessagePage,
	type ChatRoomMessagePostResponse,
	chatMentionCountResponse,
	chatRoomMessageLinkPreviewsResponse,
	chatRoomMessagePage,
	chatRoomMessagePostResponse,
	chatRoomsResponse,
} from "@carlnotes/contracts/chat"
import type { ChatAttachment } from "@carlnotes/contracts/payloads"
import { ApiResponseError, apiClient, fetchApi, readApiErrorMessage, readApiResponse } from "./apiClient"

/**
 * Loads the chat room's latest chat messages. Null means this user has no chat room here, "failed" means a server or
 * network error the caller should retry, and "unreadable" means a page that did not match its contract, which a
 * retry reads the same way.
 */
export async function fetchChatRoomMessages(
	topicId: string | null,
	teamId: string,
	beforeChatMessageId?: number,
): Promise<ChatRoomMessagePage | null | "failed" | "unreadable"> {
	// a rejection status is a result, a page that did not parse is unreadable, and any other error is a failure to retry
	try {
		const chatRoomPath = toChatRoomPath(topicId, teamId)
		const response = await fetchApi(
			beforeChatMessageId === undefined ? chatRoomPath : `${chatRoomPath}?before=${beforeChatMessageId}`,
		)
		if (response.status === 401 || response.status === 403 || response.status === 404) {
			return null
		}
		if (!response.ok) {
			return "failed"
		}

		// the payload is the decrypted chat messages in id order, with whether a page sits above them and whether
		// voice is on
		return await readApiResponse(chatRoomMessagePage, response)
	} catch (error) {
		return error instanceof ApiResponseError ? "unreadable" : "failed"
	}
}

/**
 * Load only the link preview cards for a few loading chat messages by id.
 * Returns an empty map on any error, which the caller reads as no cards yet.
 */
export async function fetchChatRoomMessageLinkPreviews(
	topicId: string | null,
	teamId: string,
	chatMessageIds: number[],
): Promise<ChatRoomMessageLinkPreviewsResponse["linkPreviews"]> {
	// a network error, a rejected status, and a body that is not json each read as no cards yet
	try {
		const response = await fetchApi(`${toChatRoomPath(topicId, teamId)}/link-previews?ids=${chatMessageIds.join(",")}`)
		if (!response.ok) {
			return {}
		}

		// the payload is a card list per chat message id
		const { linkPreviews } = await readApiResponse(chatRoomMessageLinkPreviewsResponse, response)
		return linkPreviews
	} catch {
		return {}
	}
}

/**
 * The stream url that the chat room's EventSource connects to, resuming past the cursor after a chat message id.
 */
export function toChatRoomEventsUrl(topicId: string | null, teamId: string, afterChatMessageId: number): string {
	return `${toChatRoomPath(topicId, teamId)}/events?after=${afterChatMessageId}`
}

// the chat room's base path: a topic's or team's room api
function toChatRoomPath(topicId: string | null, teamId: string): string {
	return topicId === null ? `/api/teams/${teamId}/room` : `/api/topics/${topicId}/rooms/${teamId}`
}

// a chat room post: the room, the chat message, what it replies to, its files, and whether it was spoken
export type SendChatRoomMessageOptions = {
	topicId: string | null
	teamId: string
	content: string
	replyToChatMessageId: number | null
	attachments: ChatAttachment[]
	isSpoken?: boolean
}

// the attachment rejection that each 400 error a chat room post names means
const ATTACHMENT_REJECTION_BY_ERROR = new Map(
	Object.entries(CHAT_ROOM_ATTACHMENT_ERRORS).map(([rejection, error]) => [
		error,
		rejection as ChatRoomAttachmentRejection,
	]),
)

/**
 * Post a chat message. The chat message itself arrives back through the stream, under the id the post returns.
 * The response includes the budget rejection when there is one.
 */
export async function sendChatRoomMessage({
	topicId,
	teamId,
	content,
	replyToChatMessageId,
	attachments,
	isSpoken = false,
}: SendChatRoomMessageOptions): Promise<ChatRoomMessagePostResponse | ChatRoomAttachmentRejection | null> {
	const response =
		topicId === null
			? await apiClient().api.teams[":id"].room.$post({
					param: { id: teamId },
					json: { content, replyToChatMessageId, attachments, isSpoken },
				})
			: await apiClient().api.topics[":id"].rooms[":teamId"].$post({
					param: { id: topicId, teamId },
					json: { content, replyToChatMessageId, attachments, isSpoken },
				})
	// only the errors the route names are attachment problems. anything else the validator rejected is a plain failure
	if (response.status === 400) {
		return ATTACHMENT_REJECTION_BY_ERROR.get((await readApiErrorMessage(response)) ?? "") ?? null
	}

	// every other rejected status reports the same way, since none of them names a reason to show
	if (!response.ok) {
		return null
	}

	// a rejection reason is private to the chat poster, not a chat room message post
	return readApiResponse(chatRoomMessagePostResponse, response)
}

/**
 * The url a shared attachment file downloads from, gated to chat room members by the api.
 */
export function toChatRoomAttachmentUrl(topicId: string | null, teamId: string, attachmentId: string): string {
	return topicId === null
		? `/api/teams/${teamId}/room/attachments/${attachmentId}/download`
		: `/api/topics/${topicId}/room/attachments/${attachmentId}/download`
}

// tell the api that the user opened the chat room, which clears their chat mentions badge count for it
export async function sendChatMentionsViewed(topicId: string | null, teamId: string): Promise<void> {
	if (topicId === null) {
		await apiClient().api.teams[":id"].room["mentions-seen"].$post({ param: { id: teamId } })
		return
	}
	await apiClient().api.topics[":id"].rooms[":teamId"]["mentions-seen"].$post({ param: { id: topicId, teamId } })
}

/**
 * Clear the chat room for every member, which only a team leader may do. returns False if the api rejected it.
 */
export async function sendClearChatRoom(topicId: string | null, teamId: string): Promise<boolean> {
	const response =
		topicId === null
			? await apiClient().api.teams[":id"].room.messages.$delete({ param: { id: teamId } })
			: await apiClient().api.topics[":id"].rooms[":teamId"].messages.$delete({ param: { id: topicId, teamId } })
	return response.ok
}

/**
 * Remove a shared attachment file, which its uploader or a team leader may do. returns False if the api rejected it.
 */
export async function sendDeleteChatRoomAttachment(
	topicId: string | null,
	teamId: string,
	attachmentId: string,
): Promise<boolean> {
	const response =
		topicId === null
			? await apiClient().api.teams[":id"].room.attachments[":attachmentId"].$delete({
					param: { id: teamId, attachmentId },
				})
			: await apiClient().api.topics[":id"].room.attachments[":attachmentId"].$delete({
					param: { id: topicId, attachmentId },
				})
	return response.ok
}

/**
 * Remove one of the sender's own chat messages, which takes its shared files with it. Returns false if the api rejected it.
 */
export async function sendDeleteChatRoomMessage(
	topicId: string | null,
	teamId: string,
	chatMessageId: number,
): Promise<boolean> {
	const response =
		topicId === null
			? await apiClient().api.teams[":id"].room.messages[":messageId"].$delete({
					param: { id: teamId, messageId: String(chatMessageId) },
				})
			: await apiClient().api.topics[":id"].room.messages[":messageId"].$delete({
					param: { id: topicId, messageId: String(chatMessageId) },
				})
	return response.ok
}

/**
 * Every chat room the signed-in user may open, latest first. A rejected read throws, so the chat panel shows its
 * error state instead of an empty menu.
 */
export async function fetchChatRooms(): Promise<ChatRoom[]> {
	const response = await apiClient().api.rooms.$get()
	if (!response.ok) {
		throw new Error(`chat rooms load failed: ${response.status}`)
	}
	const { rooms } = await readApiResponse(chatRoomsResponse, response)
	return rooms
}

/**
 * The total unviewed chat mentions that the user has summed over every chat room.
 * The panel polls this for its badge display.
 */
export async function fetchChatMentionCount(): Promise<number> {
	const response = await apiClient().api.rooms["mention-count"].$get()
	if (!response.ok) {
		return 0
	}
	const { count } = await readApiResponse(chatMentionCountResponse, response)
	return count
}
