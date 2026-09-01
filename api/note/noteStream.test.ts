// broker tests for the in-process note fan-out
import { expect, test } from "bun:test"
import { notifyNoteUpdate, onNoteUpdate } from "./noteStream"

// a local notify delivers the update bytes straight to this instance's subscribers
test("a subscriber receives a locally merged update", async () => {
	// collect what the subscriber sees
	const received: (string | null)[] = []
	const stopListening = onNoteUpdate("n1", (update) => received.push(update))

	// the local emit is synchronous even when the cross-instance notify cannot reach a database
	await notifyNoteUpdate("n1", "dXBkYXRl")
	expect(received).toEqual(["dXBkYXRl"])
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
