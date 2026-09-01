// the chat messages, stream, and post route for a team's chat room. a null topic is the team's own chat room
import { zValidator } from "@hono/zod-validator"
import { hasAllMention, hasModelMention, isModelChatMessage } from "@shared/chatMentions"
import { type ChatAttachment, chatRoomMessagePayload } from "@shared/contracts"
import { reportError } from "@shared/monitoring"
import { and, eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { streamSSE } from "hono/streaming"
import { db } from "../../db"
import {
	chatRoomAttachments,
	chatRoomMessages,
	chatRoomSummaries,
	teamMembers,
	teams,
	teamTopics,
	topics,
	users,
} from "../../db/schema"
import { attachmentStream, deleteAttachment, isBudgetRejection, SPENT_BUDGET_REFUSAL } from "../../worker"
import { isLeaderRole, isMonthlySpendExhausted, loadUserAccess } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"
import { toTeamRole } from "../team/members"
import { toStoredFileHeaders } from "../topic/attachments"
import { streamVideoAttachment } from "./attachments"
import { decryptChatText, encryptChatText } from "./encryption"
import { loadLinkPreviewImage, saveLinkPreviews } from "./linkPreviews"
import { saveChatMentions, saveSeenChatMentions } from "./mentions"
import { prepareChatRoomAttachments, storeChatRoomAttachment } from "./roomAttachments"
import {
	loadChatRoomDeltas,
	loadChatRoomMessageLinkPreviews,
	loadChatRoomMessages,
	toChatMessageIds,
} from "./roomMessages"
import { notifyChatRoomMessage, onChatRoomMessage } from "./roomStream"
import { postModelRefusal, runModelChatRoomTurn, toTopicFilter } from "./roomTurns"
import { chatBodyLimit } from "./turns"

// how long one SSE stream may stay open. the api client's cursor resume makes the reconnect free
const CHAT_ROOM_STREAM_MAX_AGE_MS = 15 * 60 * 1000

// the chat room a user may use, or null if it must answer like a missing one
async function loadChatRoom(
	userId: string | null,
	topicId: string | null,
	teamId: string,
): Promise<{ topic: typeof topics.$inferSelect | null; teamId: string } | null> {
	if (!userId) {
		return null
	}

	// the team's own chat room needs only the team to exist
	let topic: typeof topics.$inferSelect | null = null
	if (topicId === null) {
		const [team] = await db.select({ id: teams.id }).from(teams).where(eq(teams.id, teamId))
		if (!team) {
			return null
		}
	} else {
		// a topic chat room resolves its topic first
		const [topicRow] = await db.select().from(topics).where(eq(topics.id, topicId))
		if (!topicRow) {
			return null
		}
		topic = topicRow
		// the team must have the topic, as its owning team or as one it was shared into
		if (topicRow.teamId !== teamId) {
			const [teamRow] = await db
				.select({ teamId: teamTopics.teamId })
				.from(teamTopics)
				.where(and(eq(teamTopics.topicId, topicId), eq(teamTopics.teamId, teamId)))
				.limit(1)

			// no share row means this team has no chat room here
			if (!teamRow) {
				return null
			}
		}
	}

	// team membership alone opens the chat room. ownership without membership does not
	const [membershipRow] = await db
		.select({ userId: teamMembers.userId })
		.from(teamMembers)
		.where(and(eq(teamMembers.teamId, teamId), eq(teamMembers.userId, userId), eq(teamMembers.isActive, true)))
		.limit(1)
	return membershipRow ? { topic, teamId } : null
}

/**
 * Post a chat message into the chatRoom. Member chat mentions become notification rows, and a chat message that addresses Carl
 * starts his chat turn, unless the poster's budget is spent, in which case the refusal comes back privately in this
 * response and nothing posts to the chat room.
 */
export async function postChatRoomMessage(
	userId: string,
	topicId: string | null,
	teamId: string,
	content: string,
	replyToChatMessageId: number | null,
	attachments: ChatAttachment[],
): Promise<{ chatMessageId: number; refusalReason: string | null } | "attachmentRefused" | null> {
	const chatRoom = await loadChatRoom(userId, topicId, teamId)
	if (!chatRoom) {
		return null
	}

	// whether this chat message gives carl the chat turn. his chat mention, the room-wide @all, or a reply to his chat message
	const isModelChatTurn =
		hasModelMention(content) || hasAllMention(content) || (await isReplyToModel(replyToChatMessageId))

	// the budget gate runs before anything posts, so a spent budget is reported privately and spends nothing
	if (isModelChatTurn && (await isMonthlySpendExhausted(userId))) {
		return { chatMessageId: 0, refusalReason: SPENT_BUDGET_REFUSAL }
	}

	// every shared file is screened and read before the chat message is stored, so one rejected file posts nothing at all
	const preparedAttachments = await prepareChatRoomAttachments(userId, topicId, teamId, attachments)
	if (preparedAttachments === null) {
		return "attachmentRefused"
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

	// the link preview cards fetch in the background, so the chat message lands for everyone without waiting on its links
	void saveLinkPreviews(content, chatRoom.teamId).catch((error) =>
		console.error("chat room link preview failed", error),
	)
	await notifyChatRoomMessage(topicId, teamId, chatMessageRow.id)

	// team member chat mentions and the replied-to author become rows that the chat mention badges read
	await saveChatMentions(chatRoom.teamId, userId, chatMessageRow.id, content, replyToChatMessageId ?? null)

	// carl's turn runs after the post returns, its chat messages read serialized by the chat room lock
	if (isModelChatTurn) {
		const promptChatMessageId = chatMessageRow.id
		runModelChatRoomTurn(userId, chatRoom.topic, teamId, promptChatMessageId).catch(async (error) => {
			console.error("carl chat room turn failed", error)
			// the app's ledger and the key's own limit can disagree. the proxy settles whether the budget is spent
			if (!isBudgetRejection(error)) {
				reportError(error, "chat", { teamId })
				return
			}
			// the refusal posts as carl's own chat message
			await postModelRefusal(chatRoom.topic?.id ?? null, teamId, promptChatMessageId, SPENT_BUDGET_REFUSAL).catch(
				(refusalError) => console.error("carl refusal post failed", refusalError),
			)
		})
	}
	return { chatMessageId: chatMessageRow.id, refusalReason: null }
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

// the SSE stream one chat room route hands its connection to: catch up from the cursor
function streamChatRoomEvents(context: Context, topicId: string | null, teamId: string): Response {
	return streamSSE(context, async (stream) => {
		// the heartbeat keeps the stream detectably alive. a dead socket behind a proxy stays silent
		const heartbeat = setInterval(() => void stream.writeSSE({ event: "ping", data: "" }), 25_000)
		// catch up from the cursor first, so a reconnect misses nothing and replays nothing
		let cursor = Number(context.req.query("after") ?? 0)
		for (const chatMessage of await loadChatRoomMessages(topicId, teamId, cursor)) {
			await stream.writeSSE({ id: String(chatMessage.id), event: "message", data: JSON.stringify(chatMessage) })
			cursor = chatMessage.id
		}

		// notifications chain one after another, so a burst never reads the cursor before the prior delta advanced it
		await new Promise<void>((resolve) => {
			let deliveryChain = Promise.resolve()
			const stopListening = onChatRoomMessage(topicId, teamId, (chatMessageId) => {
				// each notification delivers everything past the cursor, and the api client dedupes replays by id
				deliveryChain = deliveryChain
					.then(async () => {
						// write each new chat message and advance the cursor past it
						for (const chatMessage of await loadChatRoomDeltas(topicId, teamId, cursor, chatMessageId)) {
							await stream.writeSSE({ id: String(chatMessage.id), event: "message", data: JSON.stringify(chatMessage) })
							cursor = Math.max(cursor, chatMessage.id)
						}
					})
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

// a team leader or an admin clears the chat room for the whole team
async function clearChatRoom(context: Context, topicId: string | null, teamId: string): Promise<Response> {
	const userId = currentUser(context)
	const chatRoom = await loadChatRoom(userId, topicId, teamId)
	if (!userId || !chatRoom) {
		return context.json({ error: "not found" }, 404)
	}

	// clearing belongs to a leader of the team, and to an admin moderating it
	const role = await toTeamRole(userId, chatRoom.teamId)
	const isLeader = role !== null && isLeaderRole(role)
	if (!isLeader && !(await loadUserAccess(userId)).isAdmin) {
		return context.json({ error: "not found" }, 404)
	}

	// the shared attachment files' rows go first, then their stored objects, best-effort
	const chatRoomAttachmentRows = await db
		.delete(chatRoomAttachments)
		.where(and(toTopicFilter(chatRoomAttachments.topicId, topicId), eq(chatRoomAttachments.teamId, chatRoom.teamId)))
		.returning({ objectKey: chatRoomAttachments.objectKey })
	// shared text has no stored object. only the attachment file rows reach storage
	for (const chatRoomAttachment of chatRoomAttachmentRows) {
		if (chatRoomAttachment.objectKey) {
			await deleteAttachment(chatRoomAttachment.objectKey).catch(() => {})
		}
	}

	// the chat messages take their chat mention rows with them, and the summary goes, so a fresh chat room starts empty
	await db
		.delete(chatRoomMessages)
		.where(and(toTopicFilter(chatRoomMessages.topicId, topicId), eq(chatRoomMessages.teamId, chatRoom.teamId)))
	await db
		.delete(chatRoomSummaries)
		.where(and(toTopicFilter(chatRoomSummaries.topicId, topicId), eq(chatRoomSummaries.teamId, chatRoom.teamId)))
	return context.json({ ok: true })
}

// a shared file streams back to any member, under the same gate the chat room itself uses
async function downloadChatRoomAttachment(
	context: Context,
	chatRoomAttachment: typeof chatRoomAttachments.$inferSelect,
): Promise<Response> {
	// shared text has no stored object, so its text comes back as a plain text file
	if (!chatRoomAttachment.objectKey) {
		const text = decryptChatText(chatRoomAttachment.context) ?? ""
		return context.body(text, 200, toStoredFileHeaders(`${chatRoomAttachment.name}.txt`, "text/plain; charset=utf-8"))
	}

	// a video shows inline so the bubble's player can stream it. everything else stays a download
	if (chatRoomAttachment.kind === "video") {
		return streamVideoAttachment(context, {
			name: chatRoomAttachment.name,
			objectKey: chatRoomAttachment.objectKey,
			contentType: chatRoomAttachment.contentType ?? "application/octet-stream",
			byteSize: chatRoomAttachment.byteSize,
		})
	}
	return context.body(
		attachmentStream(chatRoomAttachment.objectKey),
		200,
		toStoredFileHeaders(chatRoomAttachment.name, chatRoomAttachment.contentType ?? "application/octet-stream"),
	)
}

// the uploader or a team leader removes a shared file, which drops it from carl's future chat turns
async function deleteChatRoomAttachment(
	context: Context,
	userId: string,
	chatRoomAttachment: typeof chatRoomAttachments.$inferSelect,
): Promise<Response> {
	// the uploader removes their own file, and a leader removes anyone's
	if (
		chatRoomAttachment.uploaderUserId !== userId &&
		(await toTeamRole(userId, chatRoomAttachment.teamId)) !== "leader"
	) {
		return context.json({ error: "not found" }, 404)
	}

	// the row goes first, then the object, best-effort, the same order topic attachments delete in
	await db.delete(chatRoomAttachments).where(eq(chatRoomAttachments.id, chatRoomAttachment.id))
	if (chatRoomAttachment.objectKey) {
		await deleteAttachment(chatRoomAttachment.objectKey).catch(() => {})
	}
	return context.json({ ok: true })
}

/**
 * Whether the user may delete one chat room message: its author, a leader of its team, or an admin.
 */
export function canDeleteChatRoomMessage(
	userId: string,
	authorUserId: string | null,
	teamRole: "leader" | "member" | null,
	isAdmin: boolean,
): boolean {
	return authorUserId === userId || teamRole === "leader" || isAdmin
}

/**
 * Delete a chat room message, taking its shared files with it. Its author, a leader of its team, or an admin.
 */
async function deleteChatRoomMessage(
	context: Context,
	userId: string,
	chatRoomMessage: typeof chatRoomMessages.$inferSelect,
): Promise<Response> {
	// the team role and the admin flag are only read when the user is not the chat message's own author
	const isAuthor = chatRoomMessage.authorUserId === userId
	const teamRole = isAuthor ? null : await toTeamRole(userId, chatRoomMessage.teamId)
	const isAdmin = isAuthor || teamRole === "leader" ? false : (await loadUserAccess(userId)).isAdmin
	if (!canDeleteChatRoomMessage(userId, chatRoomMessage.authorUserId, teamRole, isAdmin)) {
		return context.json({ error: "not found" }, 404)
	}

	// the shared file rows get deleted first. no foreign key takes them along
	const chatRoomAttachmentRows = await db
		.delete(chatRoomAttachments)
		.where(eq(chatRoomAttachments.messageId, chatRoomMessage.id))
		.returning({ objectKey: chatRoomAttachments.objectKey })
	// each deleted row's stored object gets deleted too, best effort
	for (const chatRoomAttachment of chatRoomAttachmentRows) {
		if (chatRoomAttachment.objectKey) {
			await deleteAttachment(chatRoomAttachment.objectKey).catch(() => {})
		}
	}

	// the chat message takes its chat mention rows with it
	await db.delete(chatRoomMessages).where(eq(chatRoomMessages.id, chatRoomMessage.id))
	return context.json({ ok: true })
}

// one chat message by id, gated by its own chat room's membership rule
async function loadChatRoomMessage(
	context: Context,
	topicId: string | null,
	chatMessageId: string,
): Promise<typeof chatRoomMessages.$inferSelect | null> {
	// a non-numeric id never matches a row, and the column is a bigint
	const numericMessageId = Number(chatMessageId)
	if (!Number.isSafeInteger(numericMessageId)) {
		return null
	}

	const [chatRoomMessage] = await db
		.select()
		.from(chatRoomMessages)
		.where(and(eq(chatRoomMessages.id, numericMessageId), toTopicFilter(chatRoomMessages.topicId, topicId)))

	// the membership gate decides for the row's own chat room
	const userId = currentUser(context)
	if (!chatRoomMessage || !userId || !(await loadChatRoom(userId, topicId, chatRoomMessage.teamId))) {
		return null
	}
	return chatRoomMessage
}

// one shared-file row by id under its chat room's own gate, or null if either rejects the user
async function loadChatRoomAttachment(
	context: Context,
	topicId: string | null,
	attachmentId: string,
): Promise<typeof chatRoomAttachments.$inferSelect | null> {
	// the row names its chat room, and the chat room's own gate decides the access
	const [chatRoomAttachment] = await db
		.select()
		.from(chatRoomAttachments)
		.where(and(eq(chatRoomAttachments.id, attachmentId), toTopicFilter(chatRoomAttachments.topicId, topicId)))
	// the membership gate decides for the row's own chat room
	const userId = currentUser(context)
	if (!chatRoomAttachment || !userId || !(await loadChatRoom(userId, topicId, chatRoomAttachment.teamId))) {
		return null
	}
	return chatRoomAttachment
}

// how long a browser may keep a link preview image. the bytes under one link preview id never change
const PREVIEW_IMAGE_CACHE_CONTROL = "private, max-age=86400"

// the chat room routes. every access rejection is a 404, so a chat room's existence follows the team's
export const chatRoomRoute = new Hono<AppEnv>()
	// a link preview's image, served from this origin so no user's browser reaches the page's own host
	.get("/link-previews/:linkPreviewId/image", async (context) => {
		// signed-in users only, which keeps the previewed urls from being probed by a stranger
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "not found" }, 404)
		}

		// a link preview with no stored image has nothing to serve
		const linkPreviewImage = await loadLinkPreviewImage(context.req.param("linkPreviewId"))
		if (!linkPreviewImage) {
			return context.json({ error: "not found" }, 404)
		}

		// the stored-file headers show a safe image type in place and refuse to serve anything else inline
		return context.body(attachmentStream(linkPreviewImage.objectKey), 200, {
			...toStoredFileHeaders("link-preview", linkPreviewImage.contentType),
			"Cache-Control": PREVIEW_IMAGE_CACHE_CONTROL,
		})
	})
	.get("/topics/:id/rooms/:teamId", async (context) => {
		// the chat room's newest chat messages, members only
		const userId = currentUser(context)
		const chatRoom = await loadChatRoom(userId, context.req.param("id"), context.req.param("teamId"))
		if (!userId || !chatRoom) {
			return context.json({ error: "not found" }, 404)
		}

		// no cursor, so the load limit returns the newest chat messages
		return context.json({ chatMessages: await loadChatRoomMessages(context.req.param("id"), chatRoom.teamId, 0) })
	})
	.get("/teams/:id/room", async (context) => {
		// the team's own chat room's newest chat messages, members only
		const userId = currentUser(context)
		const chatRoom = await loadChatRoom(userId, null, context.req.param("id"))
		if (!userId || !chatRoom) {
			return context.json({ error: "not found" }, 404)
		}

		// no cursor, so the load limit returns the newest chat messages
		return context.json({ chatMessages: await loadChatRoomMessages(null, chatRoom.teamId, 0) })
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
		const posted = await postChatRoomMessage(
			userId,
			context.req.param("id"),
			context.req.param("teamId"),
			content,
			replyToChatMessageId ?? null,
			attachments,
		)
		if (posted === "attachmentRefused") {
			return context.json({ error: "attachment refused" }, 400)
		}
		return posted ? context.json(posted) : context.json({ error: "not found" }, 404)
	})
	.post("/teams/:id/room", chatBodyLimit, zValidator("json", chatRoomMessagePayload), async (context) => {
		// reject a signed-out visitor like a missing chat room. the payload schema already limits the length
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "not found" }, 404)
		}
		const { content, replyToChatMessageId, attachments } = context.req.valid("json")
		// one rejected file returns a 400 for the whole chat message, while a missing chat room returns a 404
		const posted = await postChatRoomMessage(
			userId,
			null,
			context.req.param("id"),
			content,
			replyToChatMessageId ?? null,
			attachments,
		)
		if (posted === "attachmentRefused") {
			return context.json({ error: "attachment refused" }, 400)
		}
		return posted ? context.json(posted) : context.json({ error: "not found" }, 404)
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
