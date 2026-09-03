// the note update fan-out across instances, the chat room broker's shape with one addition:
// the local instance delivers the update bytes directly, and other instances get a poke to resync
import { EventEmitter } from "node:events"
import { Client } from "@neondatabase/serverless"
import { sql } from "drizzle-orm"
import { db } from "../../db"

// the one channel every instance listens on. the payload names the sender instance and the note
const NOTE_CHANNEL = "note_updates"

// this process's identity in notify payloads, so it can skip the echo of its own notifications
const instanceId = crypto.randomUUID()

// this instance's subscribers, keyed by note id through the emitter's event names
const noteEvents = new EventEmitter()
noteEvents.setMaxListeners(0)

// the dedicated connection, held once per process
let listener: Client | null = null

// the reconnect delay doubles on repeated failures and resets once a listen succeeds
const LISTEN_RETRY_MIN_MS = 1000
const LISTEN_RETRY_MAX_MS = 30_000
let listenRetryMs = LISTEN_RETRY_MIN_MS

/**
 * Subscribe this instance to a note's changes. The handler gets the base64 update when it was
 * merged on this instance, and null as a poke to resync when it happened on another one.
 */
export function onNoteUpdate(noteId: string, handler: (update: string | null) => void): () => void {
	startNoteListener()
	noteEvents.on(noteId, handler)
	return () => noteEvents.off(noteId, handler)
}

/**
 * Tell every instance a note changed. This instance's subscribers get the update bytes directly.
 */
export async function notifyNoteUpdate(noteId: string, update: string): Promise<void> {
	// the local fast path delivers the bytes. an update is too big for a notify payload
	noteEvents.emit(noteId, update)

	// best-effort delivery to the other instances. a failed notify is logged
	try {
		await db.execute(sql`select pg_notify(${NOTE_CHANNEL}, ${`${instanceId}:${noteId}`})`)
	} catch (error) {
		console.error("note notify failed", error)
	}
}

/** The direct connection string notifications use. LISTEN needs it, never neon's pooler. */
export function toDirectConnectionString(): string | undefined {
	const connectionString = process.env.DATABASE_URL_DIRECT
	if (connectionString) {
		return connectionString
	}
	return process.env.DATABASE_URL?.replace("-pooler.", ".")
}

// start the note listener once. a dropped connection schedules its own reconnect
function startNoteListener(): void {
	if (listener) {
		return
	}

	// no configured database means no other instance to hear from
	const connectionString = toDirectConnectionString()
	if (!connectionString) {
		return
	}

	// the api client takes the slot before connecting, so overlapping starts cannot open two
	const client = new Client({ connectionString })
	listener = client

	// each notification pokes this instance's subscribers, minus the echo of its own notify event
	client.on("notification", (notification) => {
		// the payload is instanceId:noteId
		const [senderInstanceId, noteId] = (notification.payload ?? "").split(":")
		if (noteId && senderInstanceId !== instanceId) {
			noteEvents.emit(noteId, null)
		}
	})

	// neon closes an idle connection with a clean "end", which stalls the stream exactly like an error
	client.on("error", (error) => {
		console.error("note listener error", error)
		scheduleNoteRelisten(client)
	})
	client.on("end", () => scheduleNoteRelisten(client))

	// connect and listen. a failure schedules the next attempt, and connect can throw before a promise exists
	Promise.resolve()
		.then(() => client.connect())
		.then(() => client.query(`LISTEN ${NOTE_CHANNEL}`))
		// a successful listen resets the retry delay
		.then(() => {
			listenRetryMs = LISTEN_RETRY_MIN_MS
		})
		.catch((error) => {
			console.error("note listener connect failed", error)
			scheduleNoteRelisten(client)
		})
}

// drop a dead client and reconnect after the backoff
function scheduleNoteRelisten(client: Client): void {
	if (listener !== client) {
		return
	}

	// the slot clears now, and the timer stays unreferenced, so an idle process can still exit
	listener = null
	setTimeout(startNoteListener, listenRetryMs).unref()
	listenRetryMs = Math.min(listenRetryMs * 2, LISTEN_RETRY_MAX_MS)
}
