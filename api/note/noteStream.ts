// the note update fan-out across instances over Redis pub/sub.
// this instance's subscribers get the update bytes directly, and every other instance gets a poke to resync
import { EventEmitter } from "node:events"
import { publishToChannel, subscribeToChannel } from "../../db/redis"

// the one channel that every instance subscribes to. the payload names the sending instance and the note
const NOTE_CHANNEL = "note_updates"

// this instance's id in a payload, so this instance can skip the echo of its own poke
const instanceId = crypto.randomUUID()

// this instance's subscribers, keyed by note id through the emitter's event names
const noteEvents = new EventEmitter()
noteEvents.setMaxListeners(0)

/**
 * Subscribe this instance to a note's changes. The handler gets the base64 update when it was
 * merged on this instance, and null as a poke to resync when it happened on another one.
 */
export function onNoteUpdate(noteId: string, handler: (update: string | null) => void): () => void {
	// subscribe this instance to the channel, then register the handler under the note's id
	subscribeToChannel(NOTE_CHANNEL, deliverNotePoke)
	noteEvents.on(noteId, handler)
	return () => noteEvents.off(noteId, handler)
}

/**
 * Tells every instance that a note changed.
 * This instance's subscribers get the update bytes directly, and the other instances get a poke to resync.
 */
export async function notifyNoteUpdate(noteId: string, update: string): Promise<void> {
	// deliver the bytes to this instance's subscribers, then poke every other instance
	noteEvents.emit(noteId, update)
	await publishToChannel({ channel: NOTE_CHANNEL, channelMessage: `${instanceId}:${noteId}` })
}

// poke this instance's subscribers to resync a note that another instance changed
function deliverNotePoke(notePayload: string): void {
	// split the senderInstanceId:noteId payload and skip the echo of this instance's own poke
	const [senderInstanceId, noteId] = notePayload.split(":")
	if (noteId && senderInstanceId !== instanceId) {
		noteEvents.emit(noteId, null)
	}
}
