// the chat routes the app reaches: the private chat and the chat rooms

import { z } from "zod"
import type { ApiRouteContract } from "./apiRouteContracts"
import {
	chatMentionCountResponse,
	chatRoomMessageLinkPreviewsResponse,
	chatRoomMessagePage,
	chatRoomMessagePostResponse,
	chatRoomsResponse,
} from "./chat"
import { chatRoomMessagePayload, chatTurnPayload, topicChatTurnPayload } from "./payloads"
import {
	chatConversationResponse,
	chatReplyLine,
	chatRoomEvent,
	chatRoomEventsQuery,
	chatRoomLinkPreviewsQuery,
	chatRoomMessagesQuery,
	idAndAttachmentParam,
	idAndTeamParam,
	idParam,
	okResponse,
} from "./routeShapes"

// the entries, in client module order
export const chatRouteContracts: Record<string, ApiRouteContract> = {
	// private chat, on a topic, a team, and the new-topic chat
	"chatClient.fetchChatConversation": {
		method: "GET",
		path: "/api/topics/:id/chat",
		params: idParam,
		response: chatConversationResponse,
	},
	"chatClient.fetchChatConversation#team": {
		method: "GET",
		path: "/api/teams/:id/chat",
		params: idParam,
		response: chatConversationResponse,
	},
	"chatClient.fetchChatConversation#new-topic": {
		method: "GET",
		path: "/api/chat/new-topic",
		response: chatConversationResponse,
	},
	"chatClient.sendChatTurn": {
		method: "POST",
		path: "/api/topics/:id/chat",
		params: idParam,
		body: { json: topicChatTurnPayload },
		response: chatReplyLine,
		stream: "ndjson",
	},
	"chatClient.sendChatTurn#team": {
		method: "POST",
		path: "/api/teams/:id/chat",
		params: idParam,
		body: { json: chatTurnPayload },
		response: chatReplyLine,
		stream: "ndjson",
	},
	"chatClient.sendChatTurn#new-topic": {
		method: "POST",
		path: "/api/chat/new-topic",
		body: { json: chatTurnPayload },
		response: chatReplyLine,
		stream: "ndjson",
	},
	"chatClient.sendClearChat": { method: "DELETE", path: "/api/topics/:id/chat", params: idParam, response: okResponse },
	"chatClient.sendClearChat#team": {
		method: "DELETE",
		path: "/api/teams/:id/chat",
		params: idParam,
		response: okResponse,
	},
	"chatClient.sendClearChat#new-topic": { method: "DELETE", path: "/api/chat/new-topic", response: okResponse },
	"chatClient.sendDeleteKeptAttachment": {
		method: "DELETE",
		path: "/api/chat-attachments/:id",
		params: idParam,
		response: okResponse,
	},
	"chatClient.toChatAttachmentUrl": { method: "GET", path: "/api/chat-attachments/:id/download", params: idParam },

	// chat rooms, on a topic and on a team
	"chatRoomClient.fetchChatMentionCount": {
		method: "GET",
		path: "/api/rooms/mention-count",
		response: chatMentionCountResponse,
	},
	"chatRoomClient.fetchChatRoomMessageLinkPreviews": {
		method: "GET",
		path: "/api/topics/:id/rooms/:teamId/link-previews",
		params: idAndTeamParam,
		query: chatRoomLinkPreviewsQuery,
		response: chatRoomMessageLinkPreviewsResponse,
	},
	"chatRoomClient.fetchChatRoomMessageLinkPreviews#team": {
		method: "GET",
		path: "/api/teams/:id/room/link-previews",
		params: idParam,
		query: chatRoomLinkPreviewsQuery,
		response: chatRoomMessageLinkPreviewsResponse,
	},
	"chatRoomClient.fetchChatRoomMessages": {
		method: "GET",
		path: "/api/topics/:id/rooms/:teamId",
		params: idAndTeamParam,
		query: chatRoomMessagesQuery,
		response: chatRoomMessagePage,
	},
	"chatRoomClient.fetchChatRoomMessages#team": {
		method: "GET",
		path: "/api/teams/:id/room",
		params: idParam,
		query: chatRoomMessagesQuery,
		response: chatRoomMessagePage,
	},
	"chatRoomClient.fetchChatRooms": { method: "GET", path: "/api/rooms", response: chatRoomsResponse },
	"chatRoomClient.sendDeleteChatRoomAttachment": {
		method: "DELETE",
		path: "/api/topics/:id/room/attachments/:attachmentId",
		params: idAndAttachmentParam,
		response: okResponse,
	},
	"chatRoomClient.sendDeleteChatRoomAttachment#team": {
		method: "DELETE",
		path: "/api/teams/:id/room/attachments/:attachmentId",
		params: idAndAttachmentParam,
		response: okResponse,
	},
	"chatRoomClient.toChatRoomAttachmentUrl": {
		method: "GET",
		path: "/api/topics/:id/room/attachments/:attachmentId/download",
		params: idAndAttachmentParam,
	},
	"chatRoomClient.toChatRoomAttachmentUrl#team": {
		method: "GET",
		path: "/api/teams/:id/room/attachments/:attachmentId/download",
		params: idAndAttachmentParam,
	},
	"chatRoomClient.sendChatMentionsViewed": {
		method: "POST",
		path: "/api/topics/:id/rooms/:teamId/mentions-seen",
		params: idAndTeamParam,
		response: okResponse,
	},
	"chatRoomClient.sendChatMentionsViewed#team": {
		method: "POST",
		path: "/api/teams/:id/room/mentions-seen",
		params: idParam,
		response: okResponse,
	},
	"chatRoomClient.sendChatRoomMessage": {
		method: "POST",
		path: "/api/topics/:id/rooms/:teamId",
		params: idAndTeamParam,
		body: { json: chatRoomMessagePayload },
		response: chatRoomMessagePostResponse,
	},
	"chatRoomClient.sendChatRoomMessage#team": {
		method: "POST",
		path: "/api/teams/:id/room",
		params: idParam,
		body: { json: chatRoomMessagePayload },
		response: chatRoomMessagePostResponse,
	},
	"chatRoomClient.sendClearChatRoom": {
		method: "DELETE",
		path: "/api/topics/:id/rooms/:teamId/messages",
		params: idAndTeamParam,
		response: okResponse,
	},
	"chatRoomClient.sendClearChatRoom#team": {
		method: "DELETE",
		path: "/api/teams/:id/room/messages",
		params: idParam,
		response: okResponse,
	},
	"chatRoomClient.sendDeleteChatRoomMessage": {
		method: "DELETE",
		path: "/api/topics/:id/room/messages/:messageId",
		params: z.object({ id: z.string(), messageId: z.string() }),
		response: okResponse,
	},
	"chatRoomClient.sendDeleteChatRoomMessage#team": {
		method: "DELETE",
		path: "/api/teams/:id/room/messages/:messageId",
		params: z.object({ id: z.string(), messageId: z.string() }),
		response: okResponse,
	},
	"chatRoomClient.toChatRoomEventsUrl": {
		method: "GET",
		path: "/api/topics/:id/rooms/:teamId/events",
		params: idAndTeamParam,
		query: chatRoomEventsQuery,
		response: chatRoomEvent,
		stream: "sse",
	},
	"chatRoomClient.toChatRoomEventsUrl#team": {
		method: "GET",
		path: "/api/teams/:id/room/events",
		params: idParam,
		query: chatRoomEventsQuery,
		response: chatRoomEvent,
		stream: "sse",
	},
}
