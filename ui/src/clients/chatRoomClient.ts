// the api client for a team topic's chat room and a team's own chat room: the messages, the post, and the stream url
import type { ChatAttachment, ChatRoom, ChatRoomMessage } from "@shared/contracts"
import { hc } from "hono/client"
import type { AppType } from "../../../api"

// same-origin api client on a relative base url
const apiClient = hc<AppType>("")

/**
 * Load the chat room's newest messages, up to the server's load limit. Any error status returns null,
 * meaning there is no chat room here.
 */
export async function fetchChatRoomMessages(topicId: string | null, teamId: string): Promise<ChatRoomMessage[] | null> {
	const response = await fetch(toChatRoomPath(topicId, teamId))
	if (!response.ok) {
		return null
	}

	// the payload is the decrypted messages in id order
	const { messages } = (await response.json()) as { messages: ChatRoomMessage[] }
	return messages
}

/**
 * The stream url that the chat room's EventSource connects to, resuming past the cursor after a chat message id.
 */
export function toChatRoomEventsUrl(topicId: string | null, teamId: string, afterMessageId: number): string {
	return `${toChatRoomPath(topicId, teamId)}/events?after=${afterMessageId}`
}

// the chat room's base path: a topic's or team's room api
function toChatRoomPath(topicId: string | null, teamId: string): string {
	return topicId === null ? `/api/teams/${teamId}/room` : `/api/topics/${topicId}/rooms/${teamId}`
}

/**
 * Post a message. The message itself arrives back through the stream.
 * The response includes the budget refusal when there is one.
 */
export async function sendChatRoomMessage(
	topicId: string | null,
	teamId: string,
	message: string,
	replyToMessageId: number | null,
	attachments: ChatAttachment[],
): Promise<{ refusalReason: string | null } | "attachmentRefused" | null> {
	const response =
		topicId === null
			? await apiClient.api.teams[":id"].room.$post({
					param: { id: teamId },
					json: { content: message, replyToMessageId, attachments },
				})
			: await apiClient.api.topics[":id"].rooms[":teamId"].$post({
					param: { id: topicId, teamId },
					json: { content: message, replyToMessageId, attachments },
				})
	if (response.status === 400) {
		return "attachmentRefused"
	}
	if (!response.ok) {
		return null
	}

	// a refusal reason is private to the chat poster, not a chat room message post
	const refusedResponse = (await response.json()) as { refusalReason: string | null }
	return { refusalReason: refusedResponse.refusalReason }
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
		await apiClient.api.teams[":id"].room["mentions-seen"].$post({ param: { id: teamId } })
		return
	}
	await apiClient.api.topics[":id"].rooms[":teamId"]["mentions-seen"].$post({ param: { id: topicId, teamId } })
}

/**
 * Clear the chat room for every member, which only a team leader may do. returns False if the api rejected it.
 */
export async function sendClearChatRoom(topicId: string | null, teamId: string): Promise<boolean> {
	const response =
		topicId === null
			? await apiClient.api.teams[":id"].room.messages.$delete({ param: { id: teamId } })
			: await apiClient.api.topics[":id"].rooms[":teamId"].messages.$delete({ param: { id: topicId, teamId } })
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
			? await apiClient.api.teams[":id"].room.attachments[":attachmentId"].$delete({
					param: { id: teamId, attachmentId },
				})
			: await apiClient.api.topics[":id"].room.attachments[":attachmentId"].$delete({
					param: { id: topicId, attachmentId },
				})
	return response.ok
}

/**
 * Every room the signed-in user may open, newest first. A rejected fetch returns an empty list,
 * so the chat panel shows its call to action instead of an empty menu.
 */
export async function fetchChatRooms(): Promise<ChatRoom[]> {
	const response = await apiClient.api.rooms.$get()
	if (!response.ok) {
		return []
	}
	return (await response.json()).rooms
}

/**
 * The total unviewed chat mentions that the user has summed over every room. The panel polls this for its badge display.
 */
export async function fetchChatMentionCount(): Promise<number> {
	const response = await apiClient.api.rooms["mention-count"].$get()
	if (!response.ok) {
		return 0
	}
	return (await response.json()).count
}
