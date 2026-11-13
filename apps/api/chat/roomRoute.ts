// the chat room routes: the page, the stream, posting, the shared files, and the deletes

import { chatRoomMessagePayload } from "@carlnotes/contracts/payloads"
import { attachmentStream } from "@carlnotes/db/store"
import { zValidator } from "@hono/zod-validator"
import { type Context, Hono } from "hono"
import type { z } from "zod"
import { toSignedOutRejection } from "../bodyLimit"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { toObjectionableContentResponse } from "../moderation"
import { toolCallerRateLimiter } from "../rateLimit"
import { isSessionTermsCurrent, toTermsOutdatedRejection } from "../termsAcceptance"
import { toStoredFileHeaders } from "../topic/attachments"
import { loadLinkPreviewImage } from "./linkPreviews"
import { saveSeenChatMentions } from "./mentions"
import { chatBodyLimit } from "./privateChat"
import { loadChatRoom } from "./roomAccess"
import {
	clearChatRoom,
	deleteChatRoomAttachment,
	deleteChatRoomMessage,
	downloadChatRoomAttachment,
	loadChatRoomAttachment,
	loadChatRoomMessage,
} from "./roomDeletes"
import { streamChatRoomEvents } from "./roomEvents"
import { loadChatRoomMessageLinkPreviews, toChatMessageIds } from "./roomMessages"
import { postCheckedChatRoomMessage } from "./roomPosts"
import { loadChatRoomMessagePage, toBeforeChatMessageId } from "./roomReads"

// how long a cache may keep a link preview image. the bytes for one link preview id never change,
// and one stored image is the same for everyone who loads it
const PREVIEW_IMAGE_CACHE_CONTROL = "public, max-age=86400"

// the paths of a topic's chat room for one team and of a team's own chat room, after the /api base
export const TOPIC_ROOM_PATH = "/topics/:id/rooms/:teamId"
export const TEAM_ROOM_PATH = "/teams/:id/room"

// a visitor's chat room post responds like a missing chat room, before its body is read
const chatRoomSignedOutRejection = toSignedOutRejection("not found", 404)

// the context of a chat room post, with its validated chat message
type ChatRoomPostContext = Context<AppEnv, string, { out: { json: z.infer<typeof chatRoomMessagePayload> } }>

// a chat room post from the route's validated payload, as the response the route returns
async function postChatRoomMessageRoute(
	context: ChatRoomPostContext,
	topicId: string | null,
	teamId: string,
): Promise<Response> {
	// read the signed-in user, whom chatRoomSignedOutRejection already required. the payload schema limits the length
	const userId = currentUser(context)
	if (!userId) {
		return context.json({ error: "not found" }, 404)
	}

	// the post, after the Terms, the chat room's access, and the moderation
	const { content, replyToChatMessageId, attachments, isSpoken } = context.req.valid("json")
	const postResult = await postCheckedChatRoomMessage({
		userId,
		isTermsCurrent: isSessionTermsCurrent(context),
		topicId,
		teamId,
		content,
		replyToChatMessageId: replyToChatMessageId ?? null,
		attachments,
		analyticsProperties: toAnalyticsProperties(context),
		isSpoken,
	})

	// the posted chat message, or the response for why nothing posted
	switch (postResult.status) {
		case "posted":
			return context.json({ chatMessageId: postResult.chatMessageId, rejectionReason: postResult.rejectionReason })
		case "notFound":
			return context.json({ error: "not found" }, 404)
		// the Terms and the moderation say what the poster can do, and a rejected file returns a 400 for the whole post
		case "termsOutdated":
			return toTermsOutdatedRejection(context)
		case "objectionable":
			return toObjectionableContentResponse(context, postResult.category)
		case "attachmentRejected":
			return context.json({ error: postResult.error }, 400)
	}
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
	.get(TOPIC_ROOM_PATH, async (context) => {
		// the chat room's latest chat messages, or the page above the cursor, members only
		const chatMessagePage = await loadChatRoomMessagePage({
			userId: currentUser(context),
			topicId: context.req.param("id"),
			teamId: context.req.param("teamId"),
			beforeChatMessageId: toBeforeChatMessageId(context.req.query("before")),
		})
		return chatMessagePage ? context.json(chatMessagePage) : context.json({ error: "not found" }, 404)
	})
	.get(TEAM_ROOM_PATH, async (context) => {
		// the team's own chat room's latest chat messages, or the page above the cursor, members only
		const chatMessagePage = await loadChatRoomMessagePage({
			userId: currentUser(context),
			topicId: null,
			teamId: context.req.param("id"),
			beforeChatMessageId: toBeforeChatMessageId(context.req.query("before")),
		})
		return chatMessagePage ? context.json(chatMessagePage) : context.json({ error: "not found" }, 404)
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
	// the post routes: one member's chat message in, carl's chat turn after it when addressed, each under the tool
	// callers' rate limit as a private chat post is
	.post(
		TOPIC_ROOM_PATH,
		toolCallerRateLimiter,
		chatRoomSignedOutRejection,
		chatBodyLimit,
		zValidator("json", chatRoomMessagePayload),
		(context) => postChatRoomMessageRoute(context, context.req.param("id"), context.req.param("teamId")),
	)
	.post(
		TEAM_ROOM_PATH,
		toolCallerRateLimiter,
		chatRoomSignedOutRejection,
		chatBodyLimit,
		zValidator("json", chatRoomMessagePayload),
		(context) => postChatRoomMessageRoute(context, null, context.req.param("id")),
	)
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
