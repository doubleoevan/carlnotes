// the minimal yjs provider for a note: SSE receive, batched POST send, state-vector resync, stubbed awareness.
// the editor's collaboration option only needs the awareness object to exist
import { Awareness } from "y-protocols/awareness"
import * as Y from "yjs"
import { fetchNoteYdoc, fromBase64, sendNoteUpdate, toNoteEventsUrl } from "@/clients/noteClient"

// how long local edits pool before one merged update posts
const SEND_DEBOUNCE_MS = 400

// a silent stream is declared dead after this long. the server pings every 25 seconds
const STALE_STREAM_MS = 60_000

// the reconnect backoff bounds
const RECONNECT_MIN_MS = 1000
const RECONNECT_MAX_MS = 30_000

// the network calls the provider makes, taken as one object so a test can pass fakes
export type NoteTransport = {
	openStream: (noteId: string, handlers: NoteStreamHandlers) => () => void
	fetchDiff: (noteId: string, stateVector: Uint8Array) => Promise<Uint8Array | null>
	sendUpdate: (noteId: string, update: Uint8Array) => Promise<boolean>
}

// what the stream delivers back to the provider
export type NoteStreamHandlers = {
	onUpdate: (update: Uint8Array) => void
	onResync: () => void
	onDown: () => void
	onAlive: () => void
}

/**
 * The reconnect delay for the nth straight failure: exponential with jitter, up to a limit.
 */
export function toReconnectDelayMs(failedAttempts: number, random: () => number = Math.random): number {
	const backoffMs = Math.min(RECONNECT_MIN_MS * 2 ** failedAttempts, RECONNECT_MAX_MS)
	return Math.round(backoffMs * (0.5 + random() / 2))
}

/**
 * The note's sync provider. Connect opens the stream and resyncs, edits batch into merged posts,
 * and a poke or reconnect converges through a state-vector diff.
 */
export class NoteProvider {
	// the collaboration option reads this. it never broadcasts
	readonly awareness: Awareness

	// local edits pooled since the last post
	private pendingUpdates: Uint8Array[] = []
	private sendTimer: ReturnType<typeof setTimeout> | null = null

	// the open stream's closer, null while disconnected
	private closeStream: (() => void) | null = null

	// one diff fetch at a time. a poke during the fetch queues exactly one more
	private isResyncing = false
	private hasQueuedResync = false

	// reconnect state
	private failedAttempts = 0
	private reconnectTimer: ReturnType<typeof setTimeout> | null = null
	private staleTimer: ReturnType<typeof setInterval> | null = null
	private lastEventAt = 0

	constructor(
		private readonly noteId: string,
		readonly ydoc: Y.Doc,
		private readonly onSaveError: () => void,
		private readonly transport: NoteTransport = browserNoteTransport,
	) {
		this.awareness = new Awareness(ydoc)
		ydoc.on("update", this.handleLocalUpdate)
	}

	/**
	 * Open the stream and converge on the server's document.
	 */
	connect(): void {
		if (this.closeStream) {
			return
		}

		// the stream first, then the diff. nothing lands between the snapshot and the subscription
		this.lastEventAt = Date.now()
		this.closeStream = this.transport.openStream(this.noteId, {
			onUpdate: (update) => Y.applyUpdate(this.ydoc, update, this),
			onResync: () => void this.resync(),
			onDown: () => this.scheduleReconnect(),
			onAlive: () => {
				this.lastEventAt = Date.now()
				this.failedAttempts = 0
			},
		})
		void this.resync()

		// a stream that stops delivering pings gets torn down and reopened
		this.staleTimer = setInterval(() => {
			if (Date.now() - this.lastEventAt > STALE_STREAM_MS) {
				this.scheduleReconnect()
			}
		}, STALE_STREAM_MS / 2)
		this.staleTimer.unref?.()
	}

	/**
	 * Close the stream and flush what is still pooled.
	 */
	disconnect(): void {
		// stop the stream
		this.closeStream?.()
		this.closeStream = null

		// stop the timers
		if (this.reconnectTimer) {
			clearTimeout(this.reconnectTimer)
			this.reconnectTimer = null
		}
		if (this.staleTimer) {
			clearInterval(this.staleTimer)
			this.staleTimer = null
		}

		// a leaving editor's last keystrokes still post
		void this.flushPendingUpdates()
	}

	/**
	 * Release the provider for good.
	 */
	destroy(): void {
		this.disconnect()
		this.ydoc.off("update", this.handleLocalUpdate)
		this.awareness.destroy()
	}

	/**
	 * Fetch and apply what the server has that this ydoc does not. Concurrent calls collapse to one in flight plus one queued.
	 */
	async resync(): Promise<void> {
		// remember a poke that lands mid-fetch instead of stacking fetches
		if (this.isResyncing) {
			this.hasQueuedResync = true
			return
		}

		// the diff against what the ydoc already holds
		this.isResyncing = true
		try {
			const diff = await this.transport.fetchDiff(this.noteId, Y.encodeStateVector(this.ydoc))
			if (diff) {
				Y.applyUpdate(this.ydoc, diff, this)
			}
		} catch (error) {
			// a failed fetch is logged. the next poke retries
			console.error("note resync failed", error)
		} finally {
			// the flag clears on failure too
			this.isResyncing = false
		}

		// run the one queued poke
		if (this.hasQueuedResync) {
			this.hasQueuedResync = false
			await this.resync()
		}
	}

	// pool a local edit and schedule the merged post. a remote apply names this provider as its origin
	private handleLocalUpdate = (update: Uint8Array, origin: unknown): void => {
		if (origin === this) {
			return
		}
		this.pendingUpdates.push(update)
		this.sendTimer ??= setTimeout(() => void this.flushPendingUpdates(), SEND_DEBOUNCE_MS)
	}

	// post everything pooled as one merged update. a failure requeues it and surfaces the save error
	private async flushPendingUpdates(): Promise<void> {
		// stop the pending timer
		if (this.sendTimer) {
			clearTimeout(this.sendTimer)
			this.sendTimer = null
		}
		if (this.pendingUpdates.length === 0) {
			return
		}

		// take the pool as one merged update
		const mergedUpdates = Y.mergeUpdates(this.pendingUpdates)
		this.pendingUpdates = []

		// a failed post keeps the edits pooled for the next flush
		const isUpdatesSent = await this.transport.sendUpdate(this.noteId, mergedUpdates).catch(() => false)
		if (!isUpdatesSent) {
			this.pendingUpdates.unshift(mergedUpdates)
			this.onSaveError()
		}
	}

	// tear the stream down and reopen after the backoff
	private scheduleReconnect(): void {
		if (!this.closeStream || this.reconnectTimer) {
			return
		}

		// close now. the resync on reconnect covers whatever the gap missed
		this.closeStream()
		this.closeStream = null
		if (this.staleTimer) {
			clearInterval(this.staleTimer)
			this.staleTimer = null
		}

		// reopen after the backoff
		this.reconnectTimer = setTimeout(() => {
			this.reconnectTimer = null
			this.connect()
		}, toReconnectDelayMs(this.failedAttempts))
		this.failedAttempts += 1
	}
}

// the real transport: an EventSource on the stream url, and the note client's fetch and post
const browserNoteTransport: NoteTransport = {
	openStream(noteId, handlers): () => void {
		// the browser's own retry is bypassed. the provider owns the backoff
		const source = new EventSource(toNoteEventsUrl(noteId))
		source.onopen = handlers.onAlive
		source.onerror = () => {
			source.close()
			handlers.onDown()
		}

		// an update event includes the bytes, a poke asks for a diff
		source.addEventListener("update", (event) => {
			handlers.onAlive()
			handlers.onUpdate(fromBase64((event as MessageEvent).data))
		})
		source.addEventListener("resync", () => {
			handlers.onAlive()
			handlers.onResync()
		})

		// pings only prove liveness
		source.addEventListener("ping", handlers.onAlive)
		return () => source.close()
	},
	fetchDiff: fetchNoteYdoc,
	sendUpdate: sendNoteUpdate,
}
