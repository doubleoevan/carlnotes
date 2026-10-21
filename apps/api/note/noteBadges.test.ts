// the two rules for an unread note badge. what counts as an edit, and what a comment mark does to the HTML
import { expect, test } from "bun:test"
import { isNoteBodyChanged, toUnreadEdits } from "./noteBadges"

// the times the rules are compared against
const EARLIER = new Date("2026-08-30T10:00:00Z")
const LATER = new Date("2026-08-30T11:00:00Z")

// a note nobody has edited has nothing to view
test("a note never edited counts nothing", () => {
	expect(toUnreadEdits("u1", { bodyEditedAt: null, lastEditorUserId: null, readAt: null })).toBe(0)
	expect(toUnreadEdits("u1", { bodyEditedAt: null, lastEditorUserId: "u2", readAt: EARLIER })).toBe(0)
})

// a user is never badged for their own writing, however stale their read time is
test("the last editor is never badged for their own edit", () => {
	expect(toUnreadEdits("u1", { bodyEditedAt: LATER, lastEditorUserId: "u1", readAt: EARLIER })).toBe(0)
	expect(toUnreadEdits("u1", { bodyEditedAt: LATER, lastEditorUserId: "u1", readAt: null })).toBe(0)
})

// somebody else's edit counts once, however many edits it took
test("another user's edit counts one", () => {
	expect(toUnreadEdits("u1", { bodyEditedAt: LATER, lastEditorUserId: "u2", readAt: EARLIER })).toBe(1)
})

// seeing the note after the edit clears it
test("an edit older than the read time counts nothing", () => {
	expect(toUnreadEdits("u1", { bodyEditedAt: EARLIER, lastEditorUserId: "u2", readAt: LATER })).toBe(0)
})

// a note the user never opened is unread
test("a note never opened counts", () => {
	expect(toUnreadEdits("u1", { bodyEditedAt: EARLIER, lastEditorUserId: "u2", readAt: null })).toBe(1)
})

// a comment applies a mark to the body, which says nothing new and must not read as an edit
test("a comment mark is not a body change", () => {
	const plain = '<p class="bn-block">tasting notes</p>'
	const commented = '<p class="bn-block"><span data-bn-thread-id="t1">tasting notes</span></p>'
	expect(isNoteBodyChanged(plain, commented)).toBe(false)
})

// a second comment on the same text is still not an edit
test("changing which thread marks the text is not a body change", () => {
	const first = '<p><span data-bn-thread-id="t1">tasting notes</span></p>'
	const second = '<p><span data-bn-thread-id="t2">tasting notes</span></p>'
	expect(isNoteBodyChanged(first, second)).toBe(false)
})

// one comment mark inside another still says nothing new
test("nested comment marks are not a body change", () => {
	const plain = "<p>tasting notes</p>"
	const nested = '<p><span data-bn-thread-id="t1">tasting <span data-bn-thread-id="t2">notes</span></span></p>'
	expect(isNoteBodyChanged(plain, nested)).toBe(false)
})

// real writing is a body change, marks or no marks
test("changed words are a body change", () => {
	expect(isNoteBodyChanged("<p>tasting notes</p>", "<p>tasting notes and more</p>")).toBe(true)
	const commented = '<p><span data-bn-thread-id="t1">tasting notes</span></p>'
	const editedUnderTheMark = '<p><span data-bn-thread-id="t1">tasting notes and more</span></p>'
	expect(isNoteBodyChanged(commented, editedUnderTheMark)).toBe(true)
})
