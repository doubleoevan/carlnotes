// the messages, stream, and post route for a team's chat room. a null topic is the team's own chat room
import { zValidator } from "@hono/zod-validator"
import { hasAllMention, hasCarlMention, isCarlMessage } from "@shared/chatMentions"
import type { ChatRoomMessage } from "@shared/contracts"
import { type ChatAttachment, chatRoomMessagePayload } from "@shared/contracts"
import { and, asc, desc, eq, gt, inArray } from "drizzle-orm"
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
import { attachmentStream, deleteAttachment } from "../../worker"
import { isLeaderRole, isMonthlySpendExhausted } from "../authorization"
import { type AppEnv, currentUser } from "../currentUser"
import { toTeamRole } from "../team/members"
import { toDownloadHeaders } from "../topic/attachments"
import { decryptChatText, encryptChatText } from "./encryption"
import { saveChatMentions, saveSeenChatMentions } from "./mentions"
import { prepareChatRoomAttachments, storeChatRoomAttachment } from "./roomAttachments"
import { notifyChatRoomMessage, onChatRoomMessage } from "./roomStream"
import { runCarlChatRoomTurn, toTopicFilter } from "./roomTurns"

// how many messages one load returns
const CHAT_ROOM_LOAD_LIMIT = 500

// how long one SSE stream may stay open. the api client's cursor resume makes the reconnect free
const CHAT_ROOM_STREAM_MAX_AGE_MS = 15 * 60 * 1000

// the chat room a user may use, or null when it must answer like a missing one
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
		// a topic room resolves its topic first
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
 * The room's messages after a cursor, decrypted, oldest first.
 */
export async function loadChatRoomMessages(
	topicId: string | null,
	teamId: string,
	afterId: number,
): Promise<ChatRoomMessage[]> {
	// the newest messages under a limit, reversed back into id order. the author avatar is null for carl or a closed account
	const newestMessageRows = await db
		.select({ message: chatRoomMessages, authorAvatarSource: users.avatarSource })
		.from(chatRoomMessages)
		.leftJoin(users, eq(users.id, chatRoomMessages.authorUserId))
		.where(
			and(
				toTopicFilter(chatRoomMessages.topicId, topicId),
				eq(chatRoomMessages.teamId, teamId),
				gt(chatRoomMessages.id, afterId),
			),
		)
		.orderBy(desc(chatRoomMessages.id))
		.limit(CHAT_ROOM_LOAD_LIMIT)
	const messageRows = newestMessageRows
		.reverse()
		.map(({ message, authorAvatarSource }) => ({ ...message, authorAvatarSource }))

	// each message's shared files, fetched once for only the loaded messages
	const attachmentRows =
		messageRows.length === 0
			? []
			: await db
					.select({
						id: chatRoomAttachments.id,
						messageId: chatRoomAttachments.messageId,
						kind: chatRoomAttachments.kind,
						name: chatRoomAttachments.name,
					})
					.from(chatRoomAttachments)
					.where(
						and(
							toTopicFilter(chatRoomAttachments.topicId, topicId),
							inArray(
								chatRoomAttachments.messageId,
								messageRows.map((messageRow) => messageRow.id),
							),
						),
					)
					.orderBy(asc(chatRoomAttachments.createdAt))

	// a message may share several attachments, so each one's files map to its id in the order they were stored
	const attachmentsByMessageId = new Map<number, typeof attachmentRows>()
	for (const attachmentRow of attachmentRows) {
		attachmentsByMessageId.set(attachmentRow.messageId, [
			...(attachmentsByMessageId.get(attachmentRow.messageId) ?? []),
			attachmentRow,
		])
	}

	// decrypted messages for the team member reading them
	return messageRows.map((messageRow) => {
		const messageAttachments = attachmentsByMessageId.get(messageRow.id) ?? []
		return {
			id: messageRow.id,
			authorUserId: messageRow.authorUserId,
			authorUsername: messageRow.authorUsername,
			authorAvatarSource: messageRow.authorAvatarSource,
			replyToMessageId: messageRow.replyToMessageId,
			content: decryptChatText(messageRow.content) ?? "",
			createdAt: messageRow.createdAt.toISOString(),
			attachments: messageAttachments.map((attachmentRow) => ({
				id: attachmentRow.id,
				kind: attachmentRow.kind,
				name: attachmentRow.name,
			})),
		}
	})
}

// the delta fetches in flight, keyed by topic, team, cursor, and the notified message id
const chatRoomDeltasByKey = new Map<string, Promise<ChatRoomMessage[]>>()

// one notification's delta, fetched once for every stream of the chat room on this instance
function loadChatRoomDelta(
	topicId: string | null,
	teamId: string,
	afterId: number,
	messageId: number,
): Promise<ChatRoomMessage[]> {
	// the notified id keys the fetch too, so a later notification never reuses a stale snapshot
	const key = `${topicId ?? "team"}:${teamId}:${afterId}:${messageId}`
	const pendingMessages = chatRoomDeltasByKey.get(key)
	if (pendingMessages) {
		return pendingMessages
	}

	// the fetch clears its slot when it settles
	const fetch = loadChatRoomMessages(topicId, teamId, afterId).finally(() => chatRoomDeltasByKey.delete(key))
	chatRoomDeltasByKey.set(key, fetch)
	return fetch
}

/**
 * Post a message into the chatRoom. Member mentions become notification rows, and a message that addresses Carl starts his turn,
 * unless the poster's budget is spent, in which case the refusal comes back privately in this response and nothing posts to the chat room.
 */
export async function postChatRoomMessage(
	userId: string,
	topicId: string | null,
	teamId: string,
	content: string,
	replyToMessageId: number | null,
	attachments: ChatAttachment[],
): Promise<{ messageId: number; refusalReason: string | null } | "attachmentRefused" | null> {
	const chatRoom = await loadChatRoom(userId, topicId, teamId)
	if (!chatRoom) {
		return null
	}

	// whether this message gives carl the turn: his mention, the room-wide @all, or a reply to his message
	const isCarlTurn = hasCarlMention(content) || hasAllMention(content) || (await isReplyToCarl(replyToMessageId))

	// the budget gate runs before anything posts, so a spent budget is reported privately and spends nothing
	if (isCarlTurn && (await isMonthlySpendExhausted(userId))) {
		return { messageId: 0, refusalReason: "Carl is staring at an empty mug. Top up to keep chatting." }
	}

	// every shared file is screened and read before the message is stored, so one rejected file posts nothing at all
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
			replyToMessageId: replyToMessageId ?? undefined,
			content: encryptChatText(content),
		})
		.returning({ id: chatRoomMessages.id })
	if (!chatMessageRow) {
		return null
	}

	// each attachment file's row is stored beside its message, so the chat messages and the stream both include it
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
	await notifyChatRoomMessage(topicId, teamId, chatMessageRow.id)

	// member mentions and the replied-to author become rows that the mention badges read
	await saveChatMentions(chatRoom.teamId, userId, chatMessageRow.id, content, replyToMessageId ?? null)

	// carl's turn runs after the post returns, its chat messages read serialized by the chat room lock
	if (isCarlTurn) {
		runCarlChatRoomTurn(userId, chatRoom.topic, teamId, chatMessageRow.id).catch((error) =>
			console.error("carl room turn failed", error),
		)
	}
	return { messageId: chatMessageRow.id, refusalReason: null }
}

// whether the replied-to message is carl's, which continues his exchange without a fresh mention
async function isReplyToCarl(replyToMessageId: number | null): Promise<boolean> {
	if (!replyToMessageId) {
		return false
	}

	// carl's rows have his name and no account reference. the id alone resolves the message
	const [repliedTo] = await db
		.select({ authorUserId: chatRoomMessages.authorUserId, authorUsername: chatRoomMessages.authorUsername })
		.from(chatRoomMessages)
		.where(eq(chatRoomMessages.id, replyToMessageId))
	return repliedTo ? isCarlMessage(repliedTo) : false
}

// the SSE stream one chat room route hands its connection to: catch up from the cursor
function streamChatRoomEvents(context: Context, topicId: string | null, teamId: string): Response {
	return streamSSE(context, async (stream) => {
		// the heartbeat keeps the stream detectably alive. a dead socket behind a proxy stays silent
		const heartbeat = setInterval(() => void stream.writeSSE({ event: "ping", data: "" }), 25_000)
		// catch up from the cursor first, so a reconnect misses nothing and replays nothing
		let cursor = Number(context.req.query("after") ?? 0)
		for (const message of await loadChatRoomMessages(topicId, teamId, cursor)) {
			await stream.writeSSE({ id: String(message.id), event: "message", data: JSON.stringify(message) })
			cursor = message.id
		}

		// notifications chain one after another, so a burst never reads the cursor before the prior delta advanced it
		await new Promise<void>((resolve) => {
			let deliveryChain = Promise.resolve()
			const stopListening = onChatRoomMessage(topicId, teamId, (messageId) => {
				// each notification delivers everything past the cursor, and the api client dedupes replays by id
				deliveryChain = deliveryChain
					.then(async () => {
						// write each new message and advance the cursor past it
						for (const message of await loadChatRoomDelta(topicId, teamId, cursor, messageId)) {
							await stream.writeSSE({ id: String(message.id), event: "message", data: JSON.stringify(message) })
							cursor = Math.max(cursor, message.id)
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

// a team leader clears the chat room for the whole team
async function clearChatRoom(context: Context, topicId: string | null, teamId: string): Promise<Response> {
	const userId = currentUser(context)
	const chatRoom = await loadChatRoom(userId, topicId, teamId)
	if (!userId || !chatRoom) {
		return context.json({ error: "not found" }, 404)
	}
	// must be a team leader to clear the chat room
	const role = await toTeamRole(userId, chatRoom.teamId)
	if (!role || !isLeaderRole(role)) {
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

	// the messages take their mention rows with them, and the summary goes, so a fresh chat room starts empty
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
		return context.body(text, 200, toDownloadHeaders(`${chatRoomAttachment.name}.txt`, "text/plain; charset=utf-8"))
	}
	return context.body(
		attachmentStream(chatRoomAttachment.objectKey),
		200,
		toDownloadHeaders(chatRoomAttachment.name, chatRoomAttachment.contentType ?? "application/octet-stream"),
	)
}

// the uploader or a team leader removes a shared file, which drops it from carl's future turns
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

// one shared-file row by id under its chat room's own gate, or null when either refuses the user
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

// the chat room routes. every access rejection is a 404, so a chat room's existence follows the team's
export const chatRoomRoute = new Hono<AppEnv>()
	.get("/topics/:id/rooms/:teamId", async (context) => {
		// the chat room's newest messages, members only
		const userId = currentUser(context)
		const chatRoom = await loadChatRoom(userId, context.req.param("id"), context.req.param("teamId"))
		if (!userId || !chatRoom) {
			return context.json({ error: "not found" }, 404)
		}

		// no cursor, so the load limit returns the newest messages
		return context.json({ messages: await loadChatRoomMessages(context.req.param("id"), chatRoom.teamId, 0) })
	})
	.get("/teams/:id/room", async (context) => {
		// the team's own chat room's newest messages, members only
		const userId = currentUser(context)
		const chatRoom = await loadChatRoom(userId, null, context.req.param("id"))
		if (!userId || !chatRoom) {
			return context.json({ error: "not found" }, 404)
		}

		// no cursor, so the load limit returns the newest messages
		return context.json({ messages: await loadChatRoomMessages(null, chatRoom.teamId, 0) })
	})
	.post("/topics/:id/rooms/:teamId/mentions-seen", async (context) => {
		// opening the panel is what counts as seeing, so this clears the member's mention badge
		const userId = currentUser(context)
		const chatRoom = await loadChatRoom(userId, context.req.param("id"), context.req.param("teamId"))
		if (!userId || !chatRoom) {
			return context.json({ error: "not found" }, 404)
		}

		// the stamp itself, bounded to this chat room's messages
		await saveSeenChatMentions(userId, context.req.param("id"), chatRoom.teamId)
		return context.json({ ok: true })
	})
	.post("/teams/:id/room/mentions-seen", async (context) => {
		// the team room's own seen stamp, cleared the same way on its panel open
		const userId = currentUser(context)
		const chatRoom = await loadChatRoom(userId, null, context.req.param("id"))
		if (!userId || !chatRoom) {
			return context.json({ error: "not found" }, 404)
		}

		// the stamp itself, bounded to this chat room's messages
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
		// the team room's live stream, members only
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
	// the post routes: one member's message in, carl's turn after it when addressed
	.post("/topics/:id/rooms/:teamId", zValidator("json", chatRoomMessagePayload), async (context) => {
		// reject a signed-out visitor like a missing chat room. the payload schema already limits the length
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "not found" }, 404)
		}
		const { content, replyToMessageId, attachments } = context.req.valid("json")
		// one rejected file returns a 400 for the whole message, while a missing chat room returns a 404
		const posted = await postChatRoomMessage(
			userId,
			context.req.param("id"),
			context.req.param("teamId"),
			content,
			replyToMessageId ?? null,
			attachments,
		)
		if (posted === "attachmentRefused") {
			return context.json({ error: "attachment refused" }, 400)
		}
		return posted ? context.json(posted) : context.json({ error: "not found" }, 404)
	})
	.post("/teams/:id/room", zValidator("json", chatRoomMessagePayload), async (context) => {
		// reject a signed-out visitor like a missing chat room. the payload schema already limits the length
		const userId = currentUser(context)
		if (!userId) {
			return context.json({ error: "not found" }, 404)
		}
		const { content, replyToMessageId, attachments } = context.req.valid("json")
		// one rejected file returns a 400 for the whole message, while a missing chat room returns a 404
		const posted = await postChatRoomMessage(
			userId,
			null,
			context.req.param("id"),
			content,
			replyToMessageId ?? null,
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
		// the team room's files live under a null topic, gated by the same membership check
		const chatRoomAttachment = await loadChatRoomAttachment(context, null, context.req.param("attachmentId"))
		return chatRoomAttachment && chatRoomAttachment.teamId === context.req.param("id")
			? downloadChatRoomAttachment(context, chatRoomAttachment)
			: context.json({ error: "not found" }, 404)
	})
	// the uploader or a team leader removes a shared file, which drops it from carl's future turns
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
