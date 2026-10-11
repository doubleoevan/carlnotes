// the chat room routes: the page, the stream, posting, the shared files, and the deletes
import { zValidator } from "@hono/zod-validator"
import type { ChatRoomMessagePage } from "@shared/contracts"
import { chatRoomMessagePayload } from "@shared/payloads"
import { Hono } from "hono"
import { attachmentStream } from "../../worker"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { toStoredFileHeaders } from "../topic/attachments"
import { loadLinkPreviewImage } from "./linkPreviews"
import { saveSeenChatMentions } from "./mentions"
import { chatBodyLimit } from "./privateChat"
import { postChatRoomMessage, streamChatRoomEvents } from "./room"
import { loadChatRoom } from "./roomAccess"
import {
	clearChatRoom,
	deleteChatRoomAttachment,
	deleteChatRoomMessage,
	downloadChatRoomAttachment,
	loadChatRoomAttachment,
	loadChatRoomMessage,
} from "./roomDeletes"
import {
	CHAT_ROOM_LOAD_LIMIT,
	loadChatRoomMessageLinkPreviews,
	loadChatRoomMessages,
	toChatMessageIds,
} from "./roomMessages"

// how long a cache may keep a link preview image. the bytes for one link preview id never change,
// and one stored image is the same for everyone who loads it
const PREVIEW_IMAGE_CACHE_CONTROL = "public, max-age=86400"

/** The chat message id a backward page starts reading below, or undefined for the latest page. */
export function toBeforeChatMessageId(beforeParam: string | undefined): number | undefined {
	const beforeChatMessageId = Number(beforeParam)
	return beforeParam && Number.isSafeInteger(beforeChatMessageId) && beforeChatMessageId > 0
		? beforeChatMessageId
		: undefined
}

/** One page of chat messages, saying whether another sits above it so the list knows when to stop. */
export function toChatMessagePage(chatMessages: ChatRoomMessagePage["chatMessages"]): ChatRoomMessagePage {
	return { chatMessages, hasEarlierChatMessages: chatMessages.length === CHAT_ROOM_LOAD_LIMIT }
}

// the chat room routes. every access rejection is a 404, so a chat room's existence follows the team's
export const chatRoomRoute = new Hono<AppEnv>()
	// a link preview's image, served from this origin so no user's browser reaches the page's own host.
	// the id is a random uuid, only assigned with a finding or message the user was already allowed
	.get("/link-previews/:linkPreviewId/image", async (context) => {
		// a link preview with no stored image has nothing to serve
		const linkPreviewImage = await loadLinkPreviewImage(context.req.param("linkPreviewId"))
		if (!linkPreviewImage) {
			return context.json({ error: "not found" }, 404)
		}

		// the stored-file headers show a safe image type in place and never serve anything else inline
		return context.body(attachmentStream(linkPreviewImage.objectKey), 200, {
			...toStoredFileHeaders("link-preview", linkPreviewImage.contentType),
			"Cache-Control": PREVIEW_IMAGE_CACHE_CONTROL,
		})
	})
	.get("/topics/:id/rooms/:teamId", async (context) => {
		// the chat room's latest chat messages, members only
		const userId = currentUser(context)
		const chatRoom = await loadChatRoom(userId, context.req.param("id"), context.req.param("teamId"))
		if (!userId || !chatRoom) {
			return context.json({ error: "not found" }, 404)
		}

		// no cursor returns the latest chat messages, a cursor returns the page above that chat message
		const beforeChatMessageId = toBeforeChatMessageId(context.req.query("before"))
		return context.json(
			toChatMessagePage(await loadChatRoomMessages(context.req.param("id"), chatRoom.teamId, 0, beforeChatMessageId)),
		)
	})
	.get("/teams/:id/room", async (context) => {
		// the team's own chat room's latest chat messages, members only
		const userId = currentUser(context)
		const chatRoom = await loadChatRoom(userId, null, context.req.param("id"))
		if (!userId || !chatRoom) {
			return context.json({ error: "not found" }, 404)
		}

		// no cursor returns the latest chat messages, a cursor returns the page above that chat message
		const beforeChatMessageId = toBeforeChatMessageId(context.req.query("before"))
		return context.json(toChatMessagePage(await loadChatRoomMessages(null, chatRoom.teamId, 0, beforeChatMessageId)))
	})
	.get("/topics/:id/rooms/:teamId/link-previews", async (context) => {
		// the cards for a few loading chat messages, members only, so the poll never reloads the chat room
		const userId = currentUser(context)
		const chatRoom = await loadChatRoom(userId, context.req.param("id"), context.req.param("teamId"))
		if (!userId || !chatRoom) {
			return context.json({ error: "not found" }, 404)
		}
		// the loading chat message ids the client is waiting on cards for
		const chatMessageIds = toChatMessageIds(context.req.query("ids"))
		return context.json({
			linkPreviews: await loadChatRoomMessageLinkPreviews(context.req.param("id"), chatRoom.teamId, chatMessageIds),
		})
	})
	.get("/teams/:id/room/link-previews", async (context) => {
		// the same, for the team's own chat room
		const userId = currentUser(context)
		const chatRoom = await loadChatRoom(userId, null, context.req.param("id"))
		if (!userId || !chatRoom) {
			return context.json({ error: "not found" }, 404)
		}
		// the loading chat message ids the client is waiting on cards for
		const chatMessageIds = toChatMessageIds(context.req.query("ids"))
		return context.json({ linkPreviews: await loadChatRoomMessageLinkPreviews(null, chatRoom.teamId, chatMessageIds) })
	})
	.post("/topics/:id/rooms/:teamId/mentions-seen", async (context) => {
		// opening the panel is what counts as seeing, so this clears the member's chat mention badge
		const userId = currentUser(context)
		const chatRoom = await loadChatRoom(userId, context.req.param("id"), context.req.param("teamId"))
		if (!userId || !chatRoom) {
			return context.json({ error: "not found" }, 404)
		}

		// the save itself, bounded to this chat room's chat messages
		await saveSeenChatMentions(userId, context.req.param("id"), chatRoom.teamId)
		return context.json({ ok: true })
	})
	.post("/teams/:id/room/mentions-seen", async (context) => {
		// the team chat room's own seen time, cleared the same way on its panel open
		const userId = currentUser(context)
		const chatRoom = await loadChatRoom(userId, null, context.req.param("id"))
		if (!userId || !chatRoom) {
			return context.json({ error: "not found" }, 404)
		}

		// the save itself, bounded to this chat room's chat messages
		await saveSeenChatMentions(userId, null, chatRoom.teamId)
		return context.json({ ok: true })
	})
	.get("/topics/:id/rooms/:teamId/events", async (context) => {
		// the live stream with cursor resume, members only
		const userId = currentUser(context)
		const chatRoom = await loadChatRoom(userId, context.req.param("id"), context.req.param("teamId"))
		if (!chatRoom) {
			return context.json({ error: "not found" }, 404)
		}

		// the stream owns the connection from here
		return streamChatRoomEvents(context, context.req.param("id"), chatRoom.teamId)
	})
	.get("/teams/:id/room/events", async (context) => {
		// the team chat room's live stream, members only
		const userId = currentUser(context)
		const chatRoom = await loadChatRoom(userId, null, context.req.param("id"))
		if (!chatRoom) {
			return context.json({ error: "not found" }, 404)
		}

		// the stream owns the connection from here
		return streamChatRoomEvents(context, null, chatRoom.teamId)
	})
	.delete("/topics/:id/rooms/:teamId/messages", (context) =>
		clearChatRoom(context, context.req.param("id"), context.req.param("teamId")),
	)
	.delete("/teams/:id/room/messages", (context) => clearChatRoom(context, null, context.req.param("id")))
	// the post routes: one member's chat message in, carl's chat turn after it when addressed
	.post("/topics/:id/rooms/:teamId", chatBodyLimit, zValidator("json", chatRoomMessagePayload), async (context) => {
		// reject a signed-out visitor like a missing chat room. the payload schema already limits the length
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "not found" }, 404)
		}
		const { content, replyToChatMessageId, attachments } = context.req.valid("json")
		// one rejected file returns a 400 for the whole chat message, while a missing chat room returns a 404
		const postChatMessageResult = await postChatRoomMessage(
			userId,
			context.req.param("id"),
			context.req.param("teamId"),
			content,
			replyToChatMessageId ?? null,
			attachments,
			toAnalyticsProperties(context),
		)
		if (postChatMessageResult === "attachmentLimitReached") {
			return context.json({ error: "attachment limit reached" }, 400)
		}
		if (postChatMessageResult === "attachmentRejected") {
			return context.json({ error: "attachment rejected" }, 400)
		}
		// the posted chat message, or 404 for a chat room this user may not use
		return postChatMessageResult ? context.json(postChatMessageResult) : context.json({ error: "not found" }, 404)
	})
	.post("/teams/:id/room", chatBodyLimit, zValidator("json", chatRoomMessagePayload), async (context) => {
		// reject a signed-out visitor like a missing chat room. the payload schema already limits the length
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "not found" }, 404)
		}
		const { content, replyToChatMessageId, attachments } = context.req.valid("json")
		// one rejected file returns a 400 for the whole chat message, while a missing chat room returns a 404
		const postChatMessageResult = await postChatRoomMessage(
			userId,
			null,
			context.req.param("id"),
			content,
			replyToChatMessageId ?? null,
			attachments,
			toAnalyticsProperties(context),
		)
		if (postChatMessageResult === "attachmentLimitReached") {
			return context.json({ error: "attachment limit reached" }, 400)
		}
		if (postChatMessageResult === "attachmentRejected") {
			return context.json({ error: "attachment rejected" }, 400)
		}
		// the posted chat message, or 404 for a chat room this user may not use
		return postChatMessageResult ? context.json(postChatMessageResult) : context.json({ error: "not found" }, 404)
	})
	// a shared file streams back to any member, under the same gate the chat room itself uses
	.get("/topics/:id/room/attachments/:attachmentId/download", async (context) => {
		const chatRoomAttachment = await loadChatRoomAttachment(
			context,
			context.req.param("id"),
			context.req.param("attachmentId"),
		)
		return chatRoomAttachment
			? downloadChatRoomAttachment(context, chatRoomAttachment)
			: context.json({ error: "not found" }, 404)
	})
	.get("/teams/:id/room/attachments/:attachmentId/download", async (context) => {
		// the team chat room's files live under a null topic, gated by the same membership check
		const chatRoomAttachment = await loadChatRoomAttachment(context, null, context.req.param("attachmentId"))
		return chatRoomAttachment && chatRoomAttachment.teamId === context.req.param("id")
			? downloadChatRoomAttachment(context, chatRoomAttachment)
			: context.json({ error: "not found" }, 404)
	})
	// the uploader or a team leader removes a shared file, which drops it from carl's future chat turns
	.delete("/topics/:id/room/messages/:messageId", async (context) => {
		const userId = currentUser(context)
		const chatRoomMessage = await loadChatRoomMessage(context, context.req.param("id"), context.req.param("messageId"))
		return chatRoomMessage && userId
			? deleteChatRoomMessage(context, userId, chatRoomMessage)
			: context.json({ error: "not found" }, 404)
	})
	.delete("/teams/:id/room/messages/:messageId", async (context) => {
		// the team chat room's chat messages live under a null topic, with the same author-only rule
		const userId = currentUser(context)
		const chatRoomMessage = await loadChatRoomMessage(context, null, context.req.param("messageId"))
		// the chat message must belong to this team's own chat room before its delete rules run
		return chatRoomMessage && userId && chatRoomMessage.teamId === context.req.param("id")
			? deleteChatRoomMessage(context, userId, chatRoomMessage)
			: context.json({ error: "not found" }, 404)
	})
	.delete("/topics/:id/room/attachments/:attachmentId", async (context) => {
		const userId = currentUser(context)
		const chatRoomAttachment = await loadChatRoomAttachment(
			context,
			context.req.param("id"),
			context.req.param("attachmentId"),
		)
		return chatRoomAttachment && userId
			? deleteChatRoomAttachment(context, userId, chatRoomAttachment)
			: context.json({ error: "not found" }, 404)
	})
	.delete("/teams/:id/room/attachments/:attachmentId", async (context) => {
		// the team chat room's attachment files live under a null topic, with the same uploader-or-leader rule
		const userId = currentUser(context)
		const chatRoomAttachment = await loadChatRoomAttachment(context, null, context.req.param("attachmentId"))
		return chatRoomAttachment && userId && chatRoomAttachment.teamId === context.req.param("id")
			? deleteChatRoomAttachment(context, userId, chatRoomAttachment)
			: context.json({ error: "not found" }, 404)
	})
