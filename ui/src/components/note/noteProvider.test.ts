// provider tests: edit batching into one merged post, resync coalescing, failure requeue, and the backoff bounds
import { expect, test } from "bun:test"
import * as Y from "yjs"
import type { NoteSaveStatus, NoteStreamHandlers, NoteTransport } from "./noteProvider"
import { NoteProvider } from "./noteProvider"

// a transport whose calls the test can watch and resolve
function fakeTransport(overrides: Partial<NoteTransport> = {}): NoteTransport & {
	sentUpdates: Uint8Array[]
	diffCalls: number
} {
	// the recorded calls beside the default no-op behaviors
	const transport = {
		sentUpdates: [] as Uint8Array[],
		diffCalls: 0,
		openStream: (_noteId: string, _handlers: NoteStreamHandlers) => () => {},
		fetchDiff: async () => {
			transport.diffCalls += 1
			return null
		},
		sendUpdate: async (_noteId: string, update: Uint8Array) => {
			transport.sentUpdates.push(update)
			return true
		},
		...overrides,
	}
	return transport
}

// a burst of keystrokes pools into one merged post that includes every edit
test("local edits batch into one merged update", async () => {
	const transport = fakeTransport()
	const ydoc = new Y.Doc()
	const provider = new NoteProvider("n1", ydoc, () => {}, transport)

	// two quick edits inside the debounce window
	ydoc.getText("t").insert(0, "hot ")
	ydoc.getText("t").insert(0, "drip ")
	await new Promise((resolve) => setTimeout(resolve, 600))

	// one post went out
	expect(transport.sentUpdates.length).toBe(1)

	// applying it elsewhere reproduces both edits
	const replica = new Y.Doc()
	const sentUpdate = transport.sentUpdates[0]
	if (sentUpdate) {
		Y.applyUpdate(replica, sentUpdate)
	}
	expect(replica.getText("t").toString()).toBe("drip hot ")
	provider.destroy()
})

// pokes that land during a diff fetch collapse to one queued follow-up
test("resync coalesces concurrent pokes", async () => {
	// a diff fetch the test holds open
	let releaseDiff = (): void => {}
	const transport = fakeTransport({
		fetchDiff: async () => {
			transport.diffCalls += 1
			await new Promise<void>((resolve) => {
				releaseDiff = resolve
			})
			return null
		},
	})
	const ydoc = new Y.Doc()
	const provider = new NoteProvider("n1", ydoc, () => {}, transport)

	// three pokes while the first fetch is in flight
	const firstResync = provider.resync()
	void provider.resync()
	void provider.resync()
	expect(transport.diffCalls).toBe(1)

	// releasing the fetch runs exactly one queued follow-up
	releaseDiff()
	await new Promise((resolve) => setTimeout(resolve, 10))
	expect(transport.diffCalls).toBe(2)

	// releasing the follow-up settles the whole chain
	releaseDiff()
	await firstResync
	provider.destroy()
})

// a failed post keeps the words pooled and tells the card once
test("a failed post requeues the update and surfaces the save error", async () => {
	// the first send fails, the second succeeds
	let sendCount = 0
	let saveErrors = 0
	const transport = fakeTransport({
		sendUpdate: async (_noteId: string, update: Uint8Array) => {
			sendCount += 1
			transport.sentUpdates.push(update)
			return sendCount > 1
		},
	})
	const ydoc = new Y.Doc()
	const noteProvider = new NoteProvider("n1", ydoc, () => saveErrors++, transport)

	// the edit posts, fails, and stays pooled
	ydoc.getText("t").insert(0, "hold this")
	await new Promise((resolve) => setTimeout(resolve, 600))
	expect(saveErrors).toBe(1)

	// the next edit's flush includes the held words too
	ydoc.getText("t").insert(0, "and ")
	await new Promise((resolve) => setTimeout(resolve, 600))

	// the successful posts alone rebuild the whole text
	const replica = new Y.Doc()
	for (const update of transport.sentUpdates.slice(1)) {
		Y.applyUpdate(replica, update)
	}
	expect(replica.getText("t").toString()).toBe("and hold this")
	noteProvider.destroy()
})

// the dialog says where the note stands, so the provider has to say it: on its way, landed, or never posted
test("the note provider reports each save status it moves through", async () => {
	const ydoc = new Y.Doc()
	const saveStatuses: NoteSaveStatus[] = []
	let isSendAccepted: boolean | "rejected" = true
	const transport: NoteTransport = {
		openStream: () => () => {},
		fetchDiff: async () => null,
		sendUpdate: async () => isSendAccepted,
	}
	const provider = new NoteProvider(
		"n1",
		ydoc,
		() => {},
		transport,
		(status) => saveStatuses.push(status),
	)

	// an edit pools and reports it is on its way, then reports it landed once the post returns
	ydoc.getText("body").insert(0, "hello")
	expect(saveStatuses).toEqual(["saving"])
	await new Promise((resolve) => setTimeout(resolve, 600))
	expect(saveStatuses).toEqual(["saving", "saved"])

	// a post that fails leaves the edits pooled and says the note is not saved
	isSendAccepted = false
	ydoc.getText("body").insert(0, " again")
	await new Promise((resolve) => setTimeout(resolve, 600))
	expect(saveStatuses.at(-1)).toBe("unsaved")
	provider.destroy()
})

// an edit made while a post is out schedules its own post, so two can be in flight. the first to return must not
// call the note saved while the second is still going
test("a post still in flight keeps the note from reading as saved", async () => {
	const ydoc = new Y.Doc()
	const saveStatuses: NoteSaveStatus[] = []
	const sendResolvers: ((isSent: boolean) => void)[] = []
	const transport: NoteTransport = {
		openStream: () => () => {},
		fetchDiff: async () => null,
		sendUpdate: () => new Promise<boolean>((resolve) => sendResolvers.push(resolve)),
	}
	const provider = new NoteProvider(
		"n1",
		ydoc,
		() => {},
		transport,
		(status) => saveStatuses.push(status),
	)

	// the first edit posts and hangs, then a second edit posts while the first is still out
	ydoc.getText("body").insert(0, "one")
	await new Promise((resolve) => setTimeout(resolve, 600))
	ydoc.getText("body").insert(0, "two")
	await new Promise((resolve) => setTimeout(resolve, 600))
	expect(sendResolvers.length).toBe(2)

	// the first post lands while the second is still out, so nothing is saved yet
	sendResolvers[0]?.(true)
	await new Promise((resolve) => setTimeout(resolve, 10))
	expect(saveStatuses).not.toContain("saved")

	// the second lands and the note is saved
	sendResolvers[1]?.(true)
	await new Promise((resolve) => setTimeout(resolve, 10))
	expect(saveStatuses.at(-1)).toBe("saved")
	provider.destroy()
})
