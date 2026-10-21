// the combined unread badge's tooltip lines: one per kind, only for kinds with anything unread
import { expect, test } from "bun:test"
import { toUnreadLabels } from "./NotesTable"

// both kinds unread lists both, singular and plural each reading naturally
test("toUnreadLabels lists edits and comments apart", () => {
	expect(toUnreadLabels(1, 3)).toEqual(["1 unread edit", "3 unread comments"])
	expect(toUnreadLabels(2, 1)).toEqual(["2 unread edits", "1 unread comment"])
})

// a kind with nothing unread stays out of the tooltip instead of reading as a zero line
test("toUnreadLabels leaves out an empty kind", () => {
	expect(toUnreadLabels(4, 0)).toEqual(["4 unread edits"])
	expect(toUnreadLabels(0, 2)).toEqual(["2 unread comments"])
	expect(toUnreadLabels(0, 0)).toEqual([])
})
