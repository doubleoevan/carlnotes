// the chat room's fan-out across instances
import { EventEmitter } from "node:events"
import { Client } from "@neondatabase/serverless"
import { sql } from "drizzle-orm"
import { db } from "../../db"
import { toDirectConnectionString } from "../note/noteStream"

// the one channel every instance listens on. the payload names the topic, the team, and the chat message id
export const CHAT_ROOM_CHANNEL = "room_messages"

// this instance's subscribers, keyed by topic and team id through the emitter's event names
const chatRoomEvents = new EventEmitter()
chatRoomEvents.setMaxListeners(0)

// the dedicated connection, held once per process
let listener: Client | null = null

// the reconnect delay doubles on repeated failures and resets once a listen succeeds
const LISTEN_RETRY_MIN_MS = 1000
const LISTEN_RETRY_MAX_MS = 30_000
let listenRetryMs = LISTEN_RETRY_MIN_MS

/**
 * Subscribe this instance to a chat room's new-chat message ids. Returns the unsubscribe.
 */
export function onChatRoomMessage(
	topicId: string | null,
	teamId: string,
	handler: (chatMessageId: number) => void,
): () => void {
	startChatRoomListener()
	// the team's own chat room keys on the literal "team" where a topic id would sit
	chatRoomEvents.on(`${topicId ?? "team"}:${teamId}`, handler)
	return () => chatRoomEvents.off(`${topicId ?? "team"}:${teamId}`, handler)
}

/**
 * Tell every instance a chat message was stored. Called after the insert commits.
 */
export async function notifyChatRoomMessage(
	topicId: string | null,
	teamId: string,
	chatMessageId: number,
): Promise<void> {
	// the notify goes through the pooled db. pg_notify works through the pooler, and only LISTEN needs the direct connection
	const payload = `${topicId ?? "team"}:${teamId}:${chatMessageId}`
	// best-effort delivery: a failed notify is logged, and the cursor catch-up covers the gap
	try {
		await db.execute(sql`select pg_notify(${CHAT_ROOM_CHANNEL}, ${payload})`)
	} catch (error) {
		console.error("room notify failed", error)
	}
}

// start the chat room listener once. a dropped connection schedules its own reconnect
function startChatRoomListener(): void {
	if (listener) {
		return
	}

	// the api client takes the slot before connecting, so overlapping starts cannot open two
	const client = new Client({ connectionString: toDirectConnectionString() })
	listener = client

	// each notification re-emits to this instance's subscribers for that topic
	client.on("notification", (notification) => {
		// the payload is topicId:teamId:messageId
		const [topicId, teamId, chatMessageId] = (notification.payload ?? "").split(":")
		if (topicId && teamId && chatMessageId) {
			chatRoomEvents.emit(`${topicId}:${teamId}`, Number(chatMessageId))
		}
	})

	// neon closes an idle connection with a clean "end", which stalls the stream exactly like an error
	client.on("error", (error) => {
		console.error("room listener error", error)
		scheduleChatRoomRelisten(client)
	})
	client.on("end", () => scheduleChatRoomRelisten(client))

	// connect and listen. a failure schedules the next attempt
	client
		.connect()
		.then(() => client.query(`LISTEN ${CHAT_ROOM_CHANNEL}`))
		// a successful listen resets the retry delay
		.then(() => {
			listenRetryMs = LISTEN_RETRY_MIN_MS
		})
		.catch((error) => {
			console.error("room listener connect failed", error)
			scheduleChatRoomRelisten(client)
		})
}

// drop a dead client and reconnect after the backoff
function scheduleChatRoomRelisten(client: Client): void {
	if (listener !== client) {
		return
	}

	// the slot clears now, and the timer stays unreferenced, so an idle process can still exit
	listener = null
	setTimeout(startChatRoomListener, listenRetryMs).unref()
	listenRetryMs = Math.min(listenRetryMs * 2, LISTEN_RETRY_MAX_MS)
}
