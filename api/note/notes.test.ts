// sync tests for the pure yjs pieces: merging concurrent updates and diffing snapshots by state vector
import { expect, test } from "bun:test"
import * as Y from "yjs"
import { emptyNoteYdoc, mergeNoteYdoc, toNoteHtml, toNoteSnapshot } from "./notes"

// one client's update against a emptyYdoc document
function updateFrom(emptyYdoc: Uint8Array, edit: (document: Y.Doc) => void): Uint8Array {
	const document = new Y.Doc()
	Y.applyUpdate(document, emptyYdoc)
	// the state vector before the edit bounds the update to just the edit
	const beforeEdit = Y.encodeStateVector(document)
	edit(document)
	return Y.encodeStateAsUpdate(document, beforeEdit)
}

// the text a stored note ydoc holds, read back through a fresh doc
function storedText(ydoc: Uint8Array): string {
	const document = new Y.Doc()
	Y.applyUpdate(document, ydoc)
	return document.getText("t").toString()
}

// two writers edit the same emptyYdoc at once, and the merged blob keeps both edits
test("concurrent updates both survive the merge", () => {
	const emptyYdoc = emptyNoteYdoc()
	const updateA = updateFrom(emptyYdoc, (document) => document.getText("t").insert(0, "alpha "))
	const updateB = updateFrom(emptyYdoc, (document) => document.getText("t").insert(0, "beta "))

	// merge in either order, both edits are in the result
	const mergedDoc = mergeNoteYdoc(mergeNoteYdoc(emptyYdoc, updateA), updateB)
	expect(storedText(mergedDoc)).toContain("alpha")
	expect(storedText(mergedDoc)).toContain("beta")
})

// a client that already holds the emptyYdoc gets only what it is missing
test("a snapshot against a state vector returns only the diff", () => {
	const emptyYdoc = emptyNoteYdoc()
	const editedYdoc = mergeNoteYdoc(
		emptyYdoc,
		updateFrom(emptyYdoc, (document) => document.getText("t").insert(0, "hello")),
	)

	// the diff against the edited state includes nothing new
	const editedStateVector = Y.encodeStateVectorFromUpdate(editedYdoc)
	const emptyDiff = toNoteSnapshot(editedYdoc, editedStateVector)
	expect(emptyDiff.length).toBeLessThan(editedYdoc.length)

	// a client on the empty emptyYdoc still converges from the diff alone
	const baseStateVector = Y.encodeStateVectorFromUpdate(emptyYdoc)
	const catchUpSnapshot = toNoteSnapshot(editedYdoc, baseStateVector)
	expect(storedText(mergeNoteYdoc(emptyYdoc, catchUpSnapshot))).toBe("hello")
})

// no state vector means the full document
test("a snapshot without a state vector is the full document", () => {
	const emptyYdoc = emptyNoteYdoc()
	const editedYdoc = mergeNoteYdoc(
		emptyYdoc,
		updateFrom(emptyYdoc, (document) => document.getText("t").insert(0, "hello")),
	)
	expect(storedText(toNoteSnapshot(editedYdoc, null))).toBe("hello")
})

// a brand-new note decodes as an empty document
test("the empty note ydoc decodes clean", () => {
	expect(storedText(emptyNoteYdoc())).toBe("")
})

// the stored HTML renders blocks without the editor, checklist state included
test("a checklist round-trips into the stored html", async () => {
	// a checked checklist item written the way the editor stores one
	const { ServerBlockNoteEditor } = await import("@blocknote/server-util")
	const serverEditor = ServerBlockNoteEditor.create()
	const document = serverEditor.blocksToYDoc(
		[{ type: "checkListItem", props: { checked: true }, content: "ship notes" }],
		"prosemirror",
	)

	// the HTML includes the item text and its checked state
	const html = await toNoteHtml(Y.encodeStateAsUpdate(document))
	expect(html).toContain("ship notes")
	expect(html).toContain("checked")
}, 30_000)
