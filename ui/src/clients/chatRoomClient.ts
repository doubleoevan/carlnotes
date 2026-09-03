// the api client for a team topic's chat room and a team's own chat room: the chat messages, the post, and the stream url
import type { ChatAttachment, ChatLinkPreview, ChatRoom, ChatRoomMessage } from "@shared/contracts"
import { hc } from "hono/client"
import type { AppType } from "../../../api"

// same-origin api client on a relative base url
const apiClient = hc<AppType>("")

/**
 * Loads the chat room's newest chat messages. Null means this user has no chat room here,
 * and "failed" means a server or network error the caller should retry.
 */
export async function fetchChatRoomMessages(
	topicId: string | null,
	teamId: string,
): Promise<ChatRoomMessage[] | null | "failed"> {
	// a rejection status is an answer, and any other error is a failure to retry
	try {
		const response = await fetch(toChatRoomPath(topicId, teamId))
		if (response.status === 401 || response.status === 403 || response.status === 404) {
			return null
		}
		if (!response.ok) {
			return "failed"
		}

		// the payload is the decrypted chat messages in id order
		const { chatMessages } = (await response.json()) as { chatMessages: ChatRoomMessage[] }
		return chatMessages
	} catch {
		return "failed"
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
): Promise<Record<number, ChatLinkPreview[]>> {
	const response = await fetch(`${toChatRoomPath(topicId, teamId)}/link-previews?ids=${chatMessageIds.join(",")}`)
	if (!response.ok) {
		return {}
	}

	// the payload is a card list per chat message id
	const { linkPreviews } = (await response.json()) as { linkPreviews: Record<number, ChatLinkPreview[]> }
	return linkPreviews
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

/**
 * Post a chat message. The chat message itself arrives back through the stream.
 * The response includes the budget rejection when there is one.
 */
export async function sendChatRoomMessage(
	topicId: string | null,
	teamId: string,
	chatMessage: string,
	replyToChatMessageId: number | null,
	attachments: ChatAttachment[],
): Promise<{ rejectionReason: string | null } | "attachmentRejected" | "attachmentLimitReached" | null> {
	const response =
		topicId === null
			? await apiClient.api.teams[":id"].room.$post({
					param: { id: teamId },
					json: { content: chatMessage, replyToChatMessageId, attachments },
				})
			: await apiClient.api.topics[":id"].rooms[":teamId"].$post({
					param: { id: topicId, teamId },
					json: { content: chatMessage, replyToChatMessageId, attachments },
				})
	// only the two the route names are attachment problems. anything else the validator rejected is a plain failure
	if (response.status === 400) {
		const body = (await response.json().catch(() => null)) as { error?: string } | null
		if (body?.error === "attachment limit reached") {
			return "attachmentLimitReached"
		}
		return body?.error === "attachment rejected" ? "attachmentRejected" : null
	}

	// every other rejected status reports the same way, since none of them names a reason to show
	if (!response.ok) {
		return null
	}

	// a rejection reason is private to the chat poster, not a chat room message post
	const postedBody = (await response.json()) as { rejectionReason: string | null }
	return { rejectionReason: postedBody.rejectionReason }
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
 * Remove one of the sender's own chat messages, which takes its shared files with it. Returns false if the api rejected it.
 */
export async function sendDeleteChatRoomMessage(
	topicId: string | null,
	teamId: string,
	chatMessageId: number,
): Promise<boolean> {
	const response =
		topicId === null
			? await apiClient.api.teams[":id"].room.messages[":messageId"].$delete({
					param: { id: teamId, messageId: String(chatMessageId) },
				})
			: await apiClient.api.topics[":id"].room.messages[":messageId"].$delete({
					param: { id: topicId, messageId: String(chatMessageId) },
				})
	return response.ok
}

/**
 * Every chat room the signed-in user may open, newest first. A rejected fetch returns an empty list,
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
 * The total unviewed chat mentions that the user has summed over every chat room.
 * The panel polls this for its badge display.
 */
export async function fetchChatMentionCount(): Promise<number> {
	const response = await apiClient.api.rooms["mention-count"].$get()
	if (!response.ok) {
		return 0
	}
	return (await response.json()).count
}
