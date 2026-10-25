// the unread note badge rules: what counts as an edit, and the badge a note with an edit and comments by others gets
import { afterEach, expect, test } from "bun:test"
import {
	FREE_USER_ACCESS_ROW,
	restoreConnectionPool,
	type SentQuery,
	stubConnectionPool,
} from "@carlnotes/db/connectionPoolStub"
import { loadNoteBadges, toUnreadEdits } from "./noteBadges"

// the times the rules are compared against
const EARLIER = new Date("2026-08-30T10:00:00Z")
const LATER = new Date("2026-08-30T11:00:00Z")

// put the connection pool back after each test
afterEach(() => {
	restoreConnectionPool()
})

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

// the rows the badge read gets back for one team note, edited by a teammate after the user's read, with two of their
// comments since then
function toBadgeQueryRows(sentQuery: SentQuery): unknown[] {
	// one team membership, and no topics owned by or shared with the team
	const { text } = sentQuery
	if (text.includes('from "team_members"')) {
		return [["team-1"]]
	}
	if (text.includes('from "topics"') || text.includes('from "team_topics"')) {
		return []
	}

	// two unread comments on the one note, which a teammate edited after the user's read
	if (text.includes('from "note_comments"')) {
		return [["n1", 2]]
	}
	if (text.includes('from "notes"')) {
		return [["n1", "Beans", null, "team-1", null, "Reading Club", LATER.toISOString(), "u2", EARLIER.toISOString()]]
	}

	// the user's access row
	if (text.includes('from "users"')) {
		return [FREE_USER_ACCESS_ROW]
	}
	return []
}

// a teammate's edit after the read is one unread edit, and their comments since the read count one by one
test("a note edited and commented on by a teammate badges both counts", async () => {
	const sentQueries = stubConnectionPool(toBadgeQueryRows)
	expect(await loadNoteBadges("u1")).toEqual([
		{
			noteId: "n1",
			topicId: null,
			teamId: "team-1",
			teamIds: ["team-1"],
			noteName: "Beans",
			pageName: "Reading Club",
			unreadEdits: 1,
			unreadComments: 2,
		},
	])

	// the comment count reads the comments by note, leaving out the user's own and the ones before the read
	const commentCountQuery = sentQueries.find((sentQuery) => sentQuery.text.includes('from "note_comments"'))
	expect(commentCountQuery?.text).toContain('"note_comments"."note_id"')
	expect(commentCountQuery?.text).toContain('"note_comments"."author_user_id"')
	expect(commentCountQuery?.text).toContain('"note_reads"."read_at"')
})
