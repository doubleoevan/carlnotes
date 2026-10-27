// the note body save schedule: what merges, what skips, what waits, and what a failure or a conflict does
import { expect, jest, test } from "bun:test"
import type { NoteBodySaveResult } from "@carlnotes/contracts/notes"
import { type NoteBodySave, type NoteSaveErrorReason, toNoteBodySave } from "./useNoteBodySave"

// a short debounce for the tests, and a wait that outlasts it
const DEBOUNCE_MS = 10
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

// the production interval stays one second regardless of the test suite's shorter transport scenarios
test("the production clock debounces for 1000ms and repeated lifecycle flushes never duplicate a save", async () => {
	jest.useFakeTimers()
	try {
		const sent: string[] = []
		const controller = toNoteBodySave({
			noteId: "clock",
			html: "saved",
			version: 1,
			onSaveError: () => {},
			saveBody: async (_id, body) => {
				sent.push(body.html)
				return { status: "failed" }
			},
		})
		controller.scheduleSave("first")
		jest.advanceTimersByTime(700)
		controller.scheduleSave("latest")
		jest.advanceTimersByTime(999)
		expect(sent).toEqual([])
		jest.advanceTimersByTime(1)
		expect(sent).toEqual(["latest"])
		await Promise.resolve()
		await Promise.resolve()
		jest.advanceTimersByTime(10_000)
		expect(sent).toHaveLength(1)
		controller.retrySave()
		controller.flushSave()
		controller.flushSave()
		expect(sent).toHaveLength(2)
		controller.retire()
	} finally {
		jest.useRealTimers()
	}
})

// whether the fake save holds its request open until the test releases it
let isHeld = false

// a fake save that records every body sent and returns the given results in order, saved at the next version by default
function toFakeSave(saveResults: NoteBodySaveResult[] = []): {
	sentBodies: { html: string; version: number }[]
	saveBody: (noteId: string, bodySave: { html: string; version: number }) => Promise<NoteBodySaveResult>
	release: () => void
} {
	// the bodies sent, and the release of a held request
	const sentBodies: { html: string; version: number }[] = []
	let releaseSave: (() => void) | null = null
	return {
		sentBodies,
		saveBody: async (_noteId, bodySave) => {
			sentBodies.push(bodySave)

			// hold the request open while the test asks for it
			await new Promise<void>((resolve) => {
				releaseSave = resolve
				if (!isHeld) {
					resolve()
				}
			})
			return saveResults.shift() ?? { status: "saved", version: bodySave.version + 1 }
		},
		release: () => releaseSave?.(),
	}
}

// the schedule opened on a saved note, with the error reasons it reports collected
function openNote(
	saveBody: ReturnType<typeof toFakeSave>["saveBody"],
	saveErrorReasons: NoteSaveErrorReason[] = [],
): NoteBodySave {
	return toNoteBodySave({
		noteId: "n1",
		html: "<p>one</p>",
		version: 3,
		onSaveError: (reason) => saveErrorReasons.push(reason),
		saveBody,
		debounceMs: DEBOUNCE_MS,
	})
}

// keystrokes within the debounce merge into one save of the latest body, at the version the note opened at
test("keystrokes merge into one save", async () => {
	isHeld = false
	const fakeSave = toFakeSave()
	const noteBodySave = openNote(fakeSave.saveBody)

	// three keystrokes inside one debounce
	noteBodySave.scheduleSave("<p>on</p>")
	noteBodySave.scheduleSave("<p>one </p>")
	noteBodySave.scheduleSave("<p>one two</p>")
	expect(noteBodySave.getState().status).toBe("saving")

	// one save of the last body, a debounce after the last keystroke
	await sleep(DEBOUNCE_MS * 3)
	expect(fakeSave.sentBodies).toEqual([{ html: "<p>one two</p>", version: 3 }])
	expect(noteBodySave.getState().status).toBe("saved")
})

// a body equal to the server's sends nothing and cancels a waiting save
test("a body equal to the saved one skips the save", async () => {
	isHeld = false
	const fakeSave = toFakeSave()
	const noteBodySave = openNote(fakeSave.saveBody)

	// typing and then undoing it back to the saved body
	noteBodySave.scheduleSave("<p>one two</p>")
	noteBodySave.scheduleSave("<p>one</p>")
	expect(noteBodySave.getState().status).toBe("saved")
	await sleep(DEBOUNCE_MS * 3)
	expect(fakeSave.sentBodies).toEqual([])
})

// an image never reaches the api
test("an image tag is stripped from the saved body", async () => {
	isHeld = false
	const fakeSave = toFakeSave()
	const noteBodySave = openNote(fakeSave.saveBody)
	noteBodySave.scheduleSave('<p>a <img src="https://x.test/a.png" width="1" height="1"/> b</p>')
	await sleep(DEBOUNCE_MS * 3)
	expect(fakeSave.sentBodies.map((sentBody) => sentBody.html)).toEqual(["<p>a  b</p>"])
})

// a change during a save waits for it, then goes out at the version the save returned
test("a change during a save queues one more at the new version", async () => {
	isHeld = true
	const fakeSave = toFakeSave()
	const noteBodySave = openNote(fakeSave.saveBody)
	noteBodySave.scheduleSave("<p>first</p>")
	await sleep(DEBOUNCE_MS * 3)
	expect(fakeSave.sentBodies).toHaveLength(1)

	// the second change arrives while the first save is held open
	noteBodySave.scheduleSave("<p>second</p>")
	await sleep(DEBOUNCE_MS * 3)
	expect(fakeSave.sentBodies).toHaveLength(1)
	expect(noteBodySave.getState().status).toBe("saving")

	// releasing the first save sends the second at version 4, and the note is saved only once that returns
	isHeld = false
	fakeSave.release()
	await sleep(DEBOUNCE_MS)
	expect(fakeSave.sentBodies).toEqual([
		{ html: "<p>first</p>", version: 3 },
		{ html: "<p>second</p>", version: 4 },
	])
	expect(noteBodySave.getState().status).toBe("saved")
})

// undoing back to the saved body while a newer one is on its way still sends the undo, or the server keeps the typing
test("a revert during a save sends the saved body again after it", async () => {
	isHeld = true
	const fakeSave = toFakeSave()
	const noteBodySave = openNote(fakeSave.saveBody)
	noteBodySave.scheduleSave("<p>one two</p>")
	await sleep(DEBOUNCE_MS * 3)
	expect(fakeSave.sentBodies).toHaveLength(1)

	// the undo lands while the first save is held open, so it waits instead of being skipped
	noteBodySave.scheduleSave("<p>one</p>")
	expect(noteBodySave.getState().status).toBe("saving")
	isHeld = false
	fakeSave.release()
	await sleep(DEBOUNCE_MS)
	expect(fakeSave.sentBodies).toEqual([
		{ html: "<p>one two</p>", version: 3 },
		{ html: "<p>one</p>", version: 4 },
	])
	expect(noteBodySave.getState().status).toBe("saved")
})

// typing back to the body already on its way needs no second save
test("a body equal to the one on its way skips the save", async () => {
	isHeld = true
	const fakeSave = toFakeSave()
	const noteBodySave = openNote(fakeSave.saveBody)
	noteBodySave.scheduleSave("<p>one two</p>")
	await sleep(DEBOUNCE_MS * 3)

	// a change and a change back while the save is held open
	noteBodySave.scheduleSave("<p>one two three</p>")
	noteBodySave.scheduleSave("<p>one two</p>")
	isHeld = false
	fakeSave.release()
	await sleep(DEBOUNCE_MS)
	expect(fakeSave.sentBodies).toEqual([{ html: "<p>one two</p>", version: 3 }])
	expect(noteBodySave.getState().status).toBe("saved")
})

// a failed save reports once, reads as unsaved, and the next change sends the body again
test("a failed save retries on the next change", async () => {
	isHeld = false
	const saveErrorReasons: NoteSaveErrorReason[] = []
	const fakeSave = toFakeSave([{ status: "failed" }])
	const noteBodySave = openNote(fakeSave.saveBody, saveErrorReasons)

	// the first save fails
	noteBodySave.scheduleSave("<p>two</p>")
	await sleep(DEBOUNCE_MS * 3)
	expect(noteBodySave.getState().status).toBe("unsaved")
	expect(saveErrorReasons).toEqual(["failed"])

	// the next change retries at the version the note still holds
	noteBodySave.scheduleSave("<p>two three</p>")
	await sleep(DEBOUNCE_MS * 3)
	expect(fakeSave.sentBodies.map((sentBody) => sentBody.version)).toEqual([3, 3])
	expect(noteBodySave.getState().status).toBe("saved")
})

// a conflict keeps the words, names who saved last, and stops saving until the reload
test("a conflict stops saving until the reload", async () => {
	isHeld = false
	const fakeSave = toFakeSave([{ status: "conflict", version: 5, lastEditorUsername: "vienna" }])
	const noteBodySave = openNote(fakeSave.saveBody)

	// the save loses to version 5
	noteBodySave.scheduleSave("<p>mine</p>")
	await sleep(DEBOUNCE_MS * 3)
	expect(noteBodySave.getState()).toEqual({
		status: "unsaved",
		conflict: { version: 5, lastEditorUsername: "vienna" },
	})

	// nothing else goes out, a flush included
	noteBodySave.scheduleSave("<p>mine still</p>")
	noteBodySave.flushSave()
	await sleep(DEBOUNCE_MS * 3)
	expect(fakeSave.sentBodies).toHaveLength(1)

	// the reload gives the schedule the server's body and version, and saving resumes from there
	noteBodySave.resolveConflict("<p>theirs</p>", 5)
	expect(noteBodySave.getState()).toEqual({ status: "saved", conflict: null })
	noteBodySave.scheduleSave("<p>theirs and mine</p>")
	await sleep(DEBOUNCE_MS * 3)
	expect(fakeSave.sentBodies[1]).toEqual({ html: "<p>theirs and mine</p>", version: 5 })
})

// closing the dialog sends a waiting save without the debounce
test("a flush sends the waiting save at once", async () => {
	isHeld = false
	const fakeSave = toFakeSave()
	const noteBodySave = openNote(fakeSave.saveBody)

	// the flush lands inside the debounce
	noteBodySave.scheduleSave("<p>closing</p>")
	noteBodySave.flushSave()
	await sleep(1)
	expect(fakeSave.sentBodies).toEqual([{ html: "<p>closing</p>", version: 3 }])
})

// a late conflict cannot replace newer typing, including typing after the conflict was shown
test("conflicts preserve the latest draft and original base version", async () => {
	isHeld = true
	const fakeSave = toFakeSave([{ status: "conflict", version: 8, lastEditorUsername: null }])
	const controller = openNote(fakeSave.saveBody)
	controller.scheduleSave("<p>sent</p>")
	controller.flushSave()
	controller.scheduleSave("<p>newer</p>")
	fakeSave.release()
	await sleep(1)
	expect(controller.getDraft()).toMatchObject({
		html: "<p>newer</p>",
		version: 3,
		revision: 2,
		hasPendingChanges: true,
	})

	// lifecycle retries never replace conflict text or adopt the server's version implicitly
	controller.scheduleSave("<p>newest</p>")
	controller.flushSave()
	controller.retrySave()
	await sleep(DEBOUNCE_MS * 2)
	expect(controller.getDraft()).toMatchObject({ html: "<p>newest</p>", version: 3, conflict: { version: 8 } })
	expect(fakeSave.sentBodies).toHaveLength(1)
	controller.retire()
})

// a lost acknowledgement retries with the old version and becomes an ordinary conflict
test("restored uncertain saves never silently rebase", async () => {
	isHeld = false
	const fakeSave = toFakeSave([{ status: "conflict", version: 4, lastEditorUsername: "me" }])
	const controller = toNoteBodySave({
		noteId: "n1",
		html: "server newer",
		version: 4,
		onSaveError: () => {},
		saveBody: fakeSave.saveBody,
		pendingDraft: {
			html: "my durable draft",
			version: 3,
			revision: 12,
			hasPendingChanges: true,
			conflict: null,
			errorReason: "failed",
		},
	})
	controller.setSavedHtml("normalized draft")
	controller.retrySave()
	await sleep(1)
	expect(fakeSave.sentBodies).toEqual([{ html: "my durable draft", version: 3 }])
	expect(controller.getDraft()).toMatchObject({
		revision: 12,
		version: 3,
		html: "my durable draft",
		conflict: { version: 4 },
	})
})

// retirement fences both queued requests and callbacks from an old account
test("retirement drops late acknowledgement and never dispatches pending text", async () => {
	isHeld = true
	const fakeSave = toFakeSave()
	const drafts: string[] = []
	const controller = toNoteBodySave({
		noteId: "n1",
		html: "one",
		version: 3,
		saveBody: fakeSave.saveBody,
		onSaveError: () => {},
		onDraftChange: (draft) => drafts.push(draft.html),
	})
	controller.scheduleSave("two")
	controller.flushSave()
	controller.scheduleSave("three")
	controller.retire()
	const notificationCount = drafts.length
	fakeSave.release()
	controller.flushSave()
	controller.scheduleSave("four")
	await sleep(1)
	expect(drafts).toHaveLength(notificationCount)
	expect(fakeSave.sentBodies).toEqual([{ html: "two", version: 3 }])
})

// repeated background/close events share the same in-flight request, and failures wait for an explicit retry
test("lifecycle flushes keep one request and transport errors do not loop", async () => {
	isHeld = true
	const fakeSave = toFakeSave([{ status: "failed" }])
	const controller = openNote(fakeSave.saveBody)
	controller.scheduleSave("two")
	controller.flushSave()
	controller.flushSave()
	controller.retrySave()
	expect(fakeSave.sentBodies).toHaveLength(1)
	isHeld = false
	fakeSave.release()
	await sleep(DEBOUNCE_MS * 3)
	expect(fakeSave.sentBodies).toHaveLength(1)
	expect(controller.getDraft()).toMatchObject({ html: "two", hasPendingChanges: true, errorReason: "failed" })
	controller.retrySave()
	await sleep(1)
	expect(controller.getDraft()).toMatchObject({ html: "two", hasPendingChanges: false, version: 4, errorReason: null })
})

// a rejected body stays available but lifecycle events cannot keep resubmitting it
for (const reason of ["tooLarge", "unavailable"] as const) {
	test(`${reason} preserves a draft and blocks repeated retries`, async () => {
		isHeld = false
		const fakeSave = toFakeSave([{ status: reason }])
		const controller = openNote(fakeSave.saveBody)
		controller.scheduleSave("rejected")
		controller.flushSave()
		await sleep(1)
		controller.retrySave()
		controller.scheduleSave("rejected")
		controller.flushSave()
		await sleep(DEBOUNCE_MS * 2)
		expect(fakeSave.sentBodies).toHaveLength(1)
		expect(controller.getDraft()).toMatchObject({ html: "rejected", errorReason: reason, hasPendingChanges: true })
		expect(controller.getState().status).toBe("unsaved")
		controller.retire()
	})
}
