import type { Note, NoteResponse } from "./notes"

// notes of each visibility with a long title and enough rows to exercise pagination
export const TEST_NOTES: Note[] = Array.from({ length: 12 }, (_, index) => ({
	id: `note-${index}`,
	name: index === 0 ? "Notes on the small changes that made a much better cup" : `Tasting Note ${index + 1}`,
	visibility: (["private", "team", "public"] as const)[index % 3] ?? "private",
	createdAt: "2026-10-20T12:00:00Z",
	updatedAt: "2026-10-25T12:00:00Z",
	canEdit: index % 3 === 0,
	isNoteOwner: index % 3 === 0,
	canDelete: index % 3 === 0,
	owner: { id: index % 3 === 0 ? "user-carl" : "user-vienna", username: index % 3 === 0 ? "carl" : "vienna" },
}))

/**
 * Returns a complete editable Tasting Note for stories and request tests.
 */
export function toTestNote(overrides: Partial<NoteResponse> = {}): NoteResponse {
	return {
		id: "note-1",
		name: "Coffee notes",
		visibility: "private",
		createdAt: "2026-10-20T12:00:00Z",
		updatedAt: "2026-10-20T12:00:00Z",
		canEdit: true,
		isNoteOwner: true,
		canDelete: true,
		owner: { id: "user-carl", username: "carl" },
		html: "<p>Stored words</p>",
		version: 3,
		...overrides,
	}
}

// cover every format offered by the shared toolbar without introducing unsupported nested lists
export const NOTE_FORMATS_HTML =
	'<h1>First heading</h1><h2>Second heading</h2><h3>Third heading</h3><p><b>Bold</b> <i>italic</i> <u>underline</u> <s>strikethrough</s> <code>inline code</code></p><ul><li>First bullet</li><li>Second bullet</li></ul><ol><li>First number</li><li>Second number</li></ol><ul data-type="checkbox"><li>A checklist item</li></ul><blockquote>A quote worth keeping.</blockquote><codeblock>const coffee = true</codeblock><p><a href="https://carlnotes.com">CarlNotes</a></p>'
