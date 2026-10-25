// the rows the stubbed connection pool returns in the note route tests: one team note the signed-in user may edit, its
// team, the user's membership, and their access row, each replaceable per test. only tests import it
import { FREE_USER_ACCESS_ROW, type SentQuery, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { notes } from "@carlnotes/db/schema/notes"

// the note every route test opens: a team note at version 3 with a saved body
export const TEST_NOTE_ID = "n1"
export const TEST_NOTE_HTML = "<p>one</p>"
export const TEST_NOTE_VERSION = 3

// the note's columns as the notes table stores them
const TEST_NOTE_COLUMNS = {
	id: TEST_NOTE_ID,
	teamId: "team-1",
	name: "Beans",
	visibility: "team" as const,
	ownerUserId: "user-2",
	html: TEST_NOTE_HTML,
	version: TEST_NOTE_VERSION,
	lastEditorUserId: "user-2",
	bodyEditedAt: "2026-08-30T10:00:00.000Z",
	createdAt: "2026-08-01T00:00:00.000Z",
	updatedAt: "2026-08-30T10:00:00.000Z",
}

// the note row as the notes table stores it, and the same note with public visibility
export const TEST_NOTE_ROW = toTableRow(notes, TEST_NOTE_COLUMNS)
export const TEST_PUBLIC_NOTE_ROW = toTableRow(notes, { ...TEST_NOTE_COLUMNS, visibility: "public" })

// the note's team page, private by default, and its public twin
export const TEST_TEAM_ROW = ["team-1", false, "Reading Club"]
export const TEST_PUBLIC_TEAM_ROW = ["team-1", true, "Reading Club"]

// the rows a test replaces: the note, its team, the user's membership on it, and the user's access row
export type NoteTableRows = Partial<Record<"notes" | "teams" | "team_members" | "users", unknown[][]>>

/**
 * Returns the rows that open a note for the signed-in user: the note, its team page, the membership, and the access
 * row, each one the caller's own row if given. Any other query gets the rows the caller gives for it, or none.
 */
export function toNoteQueryRows(
	sentQuery: SentQuery,
	otherRows: (sentQuery: SentQuery) => unknown[] = () => [],
	tableRows: NoteTableRows = {},
): unknown[] {
	// the note row itself, read without a join
	const { text } = sentQuery
	if (text.startsWith("select") && text.includes('from "notes"') && !text.includes("join")) {
		return tableRows.notes ?? [TEST_NOTE_ROW]
	}

	// the team page, and the user's active membership on it
	if (text.includes('from "teams"')) {
		return tableRows.teams ?? [TEST_TEAM_ROW]
	}
	if (text.includes('from "team_members"')) {
		return tableRows.team_members ?? [["member"]]
	}

	// the user's access row, a plain free user
	if (text.includes('from "users"') && !text.includes("join")) {
		return tableRows.users ?? [FREE_USER_ACCESS_ROW]
	}
	return otherRows(sentQuery)
}
