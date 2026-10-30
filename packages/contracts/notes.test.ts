// tests for the note contracts: each response schema parses a realistic body, the web's strict parse rejects an
// unknown visibility, and the app's tolerant parse drops the one malformed note
import { expect, test } from "bun:test"
import {
	type NoteBadge,
	type NoteBodyConflictResponse,
	type NoteComment,
	type NotesResponse,
	note,
	noteBadgesResponse,
	noteBodyConflictResponse,
	noteBodyResponse,
	noteComment,
	noteCommentsResponse,
	noteResponse,
	notesResponse,
} from "./notes"
import { TEST_NOTES, toTestNote } from "./noteTestFixtures"
import { takeDroppedEntryCount, toTolerantResponseSchema } from "./tolerantReads"

// one comment by a signed-in author, and one badge on a topic note
const TEST_COMMENT: NoteComment = {
	id: "comment-1",
	body: "Try a coarser grind.",
	createdAt: "2026-10-21T09:00:00Z",
	author: { userId: "user-vienna", username: "vienna", avatarSource: null, avatarVersion: null },
	canDelete: false,
}
const TEST_BADGE: NoteBadge = {
	noteId: "note-1",
	topicId: "topic-1",
	teamId: null,
	teamIds: ["team-1"],
	noteName: "Coffee notes",
	pageName: "Pour over",
	unreadEdits: 1,
	unreadComments: 2,
}

// a page's notes parse with the fixture notes, and a note with a closed owner account parses too
test("the notes response and a note parse", () => {
	const body: NotesResponse = { pageName: "Pour over", creatableVisibilities: ["private", "team"], notes: TEST_NOTES }
	expect(notesResponse.parse(body)).toEqual(body)
	expect(note.parse({ ...toTestNote(), owner: null }).owner).toBeNull()
})

// an opened note parses with its body and version, and both save bodies parse
test("the opened note and the save responses parse", () => {
	const openedNote = toTestNote()
	expect(noteResponse.parse(openedNote)).toEqual(openedNote)
	expect(noteBodyResponse.parse({ version: 4 })).toEqual({ version: 4 })
	const conflict: NoteBodyConflictResponse = { error: "conflict", version: 5, lastEditorUsername: null }
	expect(noteBodyConflictResponse.parse(conflict)).toEqual(conflict)
	expect(noteBodyConflictResponse.safeParse({ error: "other", version: 5, lastEditorUsername: "carl" }).success).toBe(
		false,
	)
})

// a comment parses alone and in its thread, with or without an author
test("a comment and the comment thread parse", () => {
	expect(noteComment.parse(TEST_COMMENT)).toEqual(TEST_COMMENT)
	const thread = { comments: [TEST_COMMENT, { ...TEST_COMMENT, id: "comment-2", author: null }] }
	expect(noteCommentsResponse.parse(thread)).toEqual(thread)
})

// the badges parse, and an empty list is a valid payload
test("the badges response parses", () => {
	expect(noteBadgesResponse.parse({ badges: [TEST_BADGE] })).toEqual({ badges: [TEST_BADGE] })
	expect(noteBadgesResponse.parse({ badges: [] })).toEqual({ badges: [] })
})

// the visibility is a strict enum on both apps: the web rejects the whole response, and the tolerant form drops the
// one note and counts it
test("an unknown visibility is rejected strictly and dropped tolerantly", () => {
	const knownNote = note.parse(toTestNote())
	const unknownNote = { ...knownNote, id: "note-2", visibility: "secret" }
	const body = { pageName: "Pour over", creatableVisibilities: [], notes: [knownNote, unknownNote] }
	expect(notesResponse.safeParse(body).success).toBe(false)

	// the tolerant parse keeps the valid note alone
	takeDroppedEntryCount()
	expect(toTolerantResponseSchema(notesResponse).parse(body).notes).toEqual([knownNote])
	expect(takeDroppedEntryCount()).toBe(1)
})
