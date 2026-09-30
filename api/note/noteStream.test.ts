// note broker tests: the local update bytes, the poke to the other instances, and the skipped echo
import { afterAll, expect, mock, spyOn, test } from "bun:test"
import * as redis from "../../db/redis"
import { notifyNoteUpdate, onNoteUpdate } from "./noteStream"

// the payloads that this instance published, and the channel handler that the broker subscribed with
const publishedNotePayloads: string[] = []
let deliverNotePoke: (notePayload: string) => void = () => {}
spyOn(redis, "publishToChannel").mockImplementation(async ({ channelMessage }: redis.PublishToChannelOptions) => {
	publishedNotePayloads.push(channelMessage)
	return true
})

// keep the channel handler that the broker subscribes with, so a test can deliver another instance's poke
spyOn(redis, "subscribeToChannel").mockImplementation(
	(_channel: string, onChannelMessage: (channelMessage: string) => void) => {
		deliverNotePoke = onChannelMessage
	},
)

// put the spied Redis functions back after the last test
afterAll(() => {
	mock.restore()
})

// a local notify delivers the update bytes straight to this instance's subscribers and pokes the other instances
test("a subscriber receives a locally merged update, and the poke to the other instances names this instance", async () => {
	// collect what the subscriber sees
	const receivedNoteUpdates: (string | null)[] = []
	const stopListening = onNoteUpdate("n1", (update) => receivedNoteUpdates.push(update))

	// the local emit delivers the update bytes, and the published poke names this instance and the note
	await notifyNoteUpdate("n1", "dXBkYXRl")
	expect(receivedNoteUpdates).toEqual(["dXBkYXRl"])
	expect(publishedNotePayloads.at(-1)).toMatch(/^[0-9a-f-]{36}:n1$/)
	stopListening()
})

// unsubscribing stops delivery, and other notes never leak in
test("unsubscribe stops delivery and keys stay per note", async () => {
	// two subscribers on two notes
	const receivedA: (string | null)[] = []
	const receivedB: (string | null)[] = []
	const stopA = onNoteUpdate("na", (update) => receivedA.push(update))
	const stopB = onNoteUpdate("nb", (update) => receivedB.push(update))

	// only the matching key delivers
	await notifyNoteUpdate("na", "one")
	expect(receivedA).toEqual(["one"])
	expect(receivedB).toEqual([])

	// after unsubscribing, nothing more arrives
	stopA()
	await notifyNoteUpdate("na", "two")
	expect(receivedA).toEqual(["one"])
	stopB()
})

// the echo of this instance's own poke is skipped, and another instance's poke asks for a resync
test("the sender's own poke is skipped and another instance's poke asks for a resync", async () => {
	// one subscriber, one local update
	const receivedNoteUpdates: (string | null)[] = []
	const stopListening = onNoteUpdate("n2", (update) => receivedNoteUpdates.push(update))
	await notifyNoteUpdate("n2", "bytes")

	// this instance's own poke changes nothing, and another instance's poke delivers a null
	deliverNotePoke(publishedNotePayloads.at(-1) as string)
	expect(receivedNoteUpdates).toEqual(["bytes"])
	deliverNotePoke("other-instance:n2")
	expect(receivedNoteUpdates).toEqual(["bytes", null])
	stopListening()
})
