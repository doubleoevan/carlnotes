// the tasting note tools: a visitor reads a public topic's public notes alone, a member opens a team note with its html
// and version, a long note is cut at a whole block with no version, and save_note and delete_note reject a stale
// version, a visibility the page does not allow, an objectionable name, an account behind on the Terms, and a
// teammate's note
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { MCP_VIEW_META_KEY, type McpViewData } from "@carlnotes/contracts/mcpViews"
import { toModerationRejectionMessage } from "@carlnotes/contracts/moderation"
import { restoreConnectionPool, type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as moderation from "../moderation"
import {
	TEST_NOTE_HTML,
	TEST_NOTE_ID,
	TEST_NOTE_VERSION,
	TEST_PUBLIC_TEAM_ROW,
	toNoteQueryRows,
} from "../note/noteTestFixtures"
import * as notePermissions from "../note/permissions"
import * as rateLimit from "../rateLimit"
import * as termsAcceptance from "../termsAcceptance"
import * as mcpViewData from "./mcpViewData"
import { toHtmlBlocks, toMcpOpenedNote } from "./noteResults"
import { TERMS_REJECTION_TEXT } from "./results"
import { toResultText, toToolHandler, VISITOR } from "./toolTestFixtures"

// an account that accepted the Terms and has body saves left
beforeEach(() => {
	spyOn(termsAcceptance, "hasAcceptedCurrentTerms").mockResolvedValue(true)
	spyOn(rateLimit, "countNoteBodySaveRateLimitHit").mockResolvedValue(true)
})

// the signed-in member's identity, as the MCP view shows it
const MEMBER_SESSION = { userId: "user-1", username: "carl", avatarSource: "generated" as const, avatarVersion: null }

// put the spies and the connection pool back after each test
afterEach(() => {
	mock.restore()
	restoreConnectionPool()
})

// the queries that write, after the reads
function toWriteQueries(sentQueries: SentQuery[]): SentQuery[] {
	return sentQueries.filter((sentQuery) => !sentQuery.text.startsWith("select"))
}

// the MCP view data a tool result includes
function toResultMcpViewData(toolResult: { _meta?: Record<string, unknown> }): McpViewData | undefined {
	return toolResult._meta?.[MCP_VIEW_META_KEY] as McpViewData | undefined
}

// a note list row as the list query reads it: id, page, name, visibility, owner, times, and the owner's username
function toNoteListRow(id: string, visibility: string): unknown[] {
	const updatedAt = "2026-11-01T00:00:00.000Z"
	return [id, "topic-1", null, `${id} name`, visibility, "user-2", updatedAt, updatedAt, "vienna"]
}

test("a visitor reads a public topic's public notes alone", async () => {
	// a public topic page the visitor may see, holding a public note and its owner's private one
	spyOn(notePermissions, "loadTopicPage").mockResolvedValue({
		kind: "topic",
		topic: { id: "topic-1", name: "Pour over", ownerId: "user-2", visibility: "public", teamId: null },
	} as never)
	spyOn(notePermissions, "loadPageAccess").mockResolvedValue({
		canSeePage: true,
		isHoldingTeamMember: false,
		isPageOwner: false,
		isAdmin: false,
	})
	stubConnectionPool(() => [toNoteListRow("note-public", "public"), toNoteListRow("note-private", "private")])

	// only the public note is listed
	const toolResult = await toToolHandler("read_notes", VISITOR)({ topic_id: "topic-1" })
	const notesPage = toolResult.structuredContent as { items: { id: string }[] }
	expect(notesPage.items.map((note) => note.id)).toEqual(["note-public"])

	// the MCP view lists the same notes in the site's shape, for a visitor, with no note open
	const resultMcpViewData = toResultMcpViewData(toolResult)
	expect(resultMcpViewData?.session).toBeNull()
	expect(resultMcpViewData?.notes?.pageType).toBe("topic")
	expect(resultMcpViewData?.notes?.pageId).toBe("topic-1")
	expect(resultMcpViewData?.notes?.notesResponse.notes.map((note) => note.id)).toEqual(["note-public"])
	expect(resultMcpViewData?.notes?.openedNote).toBeNull()
})

test("a team member opens a team note with its html and version", async () => {
	stubConnectionPool((sentQuery) => toNoteQueryRows(sentQuery))
	spyOn(mcpViewData, "loadMcpViewSession").mockResolvedValue(MEMBER_SESSION)
	const toolResult = await toToolHandler("read_notes")({ note_id: TEST_NOTE_ID })
	const openedNote = toolResult.structuredContent as { html: string; version: number; isHtmlCut: boolean }
	expect(openedNote.html).toContain(TEST_NOTE_HTML)
	expect(openedNote.version).toBe(TEST_NOTE_VERSION)
	expect(openedNote.isHtmlCut).toBe(false)

	// the MCP view opens the same note on its team page, with its html unfenced
	const resultMcpViewData = toResultMcpViewData(toolResult)
	expect(resultMcpViewData?.session).toEqual(MEMBER_SESSION)
	expect(resultMcpViewData?.notes?.pageType).toBe("team")
	expect(resultMcpViewData?.notes?.pageId).toBe("team-1")
	expect(resultMcpViewData?.notes?.openedNote?.html).toBe(TEST_NOTE_HTML)
})

test("a list stays one block when the html is split", () => {
	const html = "<p>one</p><ul><li>two</li><li>three</li></ul><br />"
	expect(toHtmlBlocks(html)).toEqual(["<p>one</p>", "<ul><li>two</li><li>three</li></ul>", "<br />"])
})

test("a long note is cut at a whole block and has no version", () => {
	// a paragraph, then a list that does not fit the budget
	const noteResponse = {
		id: "n1",
		name: "Beans",
		visibility: "team" as const,
		createdAt: "2026-11-01T00:00:00.000Z",
		updatedAt: "2026-11-01T00:00:00.000Z",
		canEdit: true,
		isNoteOwner: true,
		canDelete: true,
		owner: null,
		html: "<p>first</p><ul><li>second</li><li>third</li></ul>",
		version: 4,
	}
	const openedNote = toMcpOpenedNote(noteResponse, "https://carlnotes.com/teams/team-1", 20)

	// the paragraph stays whole, the list is left out, and a save cannot write the cut copy
	expect(openedNote.html).toContain("<p>first</p>")
	expect(openedNote.html).not.toContain("<li>")
	expect(openedNote.isHtmlCut).toBe(true)
	expect(openedNote.version).toBeNull()
})

test("a note whose one block is over the budget is cut inside it and has no version", () => {
	// one list longer than the budget
	const noteResponse = {
		id: "n1",
		name: "Beans",
		visibility: "team" as const,
		createdAt: "2026-11-01T00:00:00.000Z",
		updatedAt: "2026-11-01T00:00:00.000Z",
		canEdit: true,
		isNoteOwner: true,
		canDelete: true,
		owner: null,
		html: `<ul>${"<li>bean</li>".repeat(20)}</ul>`,
		version: 4,
	}
	const openedNote = toMcpOpenedNote(noteResponse, "https://carlnotes.com/teams/team-1", 40)

	// the fenced html holds no more than the budget, and a save cannot write the cut copy
	expect(openedNote.html.length).toBeLessThan(noteResponse.html.length)
	expect(openedNote.isHtmlCut).toBe(true)
	expect(openedNote.version).toBeNull()
})

test("a body save at a stale version saves nothing and names the current version", async () => {
	// the version write returns no row, and the read after it names the stored version and its editor
	stubConnectionPool((sentQuery) =>
		toNoteQueryRows(sentQuery, (otherQuery) => (otherQuery.text.includes('left join "users"') ? [[5, "vienna"]] : [])),
	)
	const toolResult = await toToolHandler("save_note")({
		note_id: TEST_NOTE_ID,
		html: "<p>mine</p>",
		version: TEST_NOTE_VERSION - 1,
	})
	expect(toolResult.isError).toBe(true)
	expect(toResultText(toolResult)).toContain("is at version 5 now")
	expect(toResultText(toolResult)).toContain("vienna")
	expect(toolResult._meta).toBeUndefined()
})

test("a non-member's team note on a public team is rejected with the visibilities they may choose", async () => {
	const sentQueries = stubConnectionPool((sentQuery) =>
		toNoteQueryRows(sentQuery, () => [], { teams: [TEST_PUBLIC_TEAM_ROW], team_members: [] }),
	)
	const toolResult = await toToolHandler("save_note")({ team_id: "team-1", name: "Beans", visibility: "team" })
	expect(toResultText(toolResult)).toBe("On this page you may create a note as private. Nothing was created.")
	expect(toWriteQueries(sentQueries)).toHaveLength(0)
})

test("an objectionable name saves nothing", async () => {
	const sentQueries = stubConnectionPool((sentQuery) => toNoteQueryRows(sentQuery))
	spyOn(moderation, "toObjectionableCategory").mockResolvedValue("harassment")
	const toolResult = await toToolHandler("save_note")({ note_id: TEST_NOTE_ID, name: "a rude name" })
	expect(toResultText(toolResult)).toBe(toModerationRejectionMessage("harassment"))
	expect(toWriteQueries(sentQueries)).toHaveLength(0)
})

test("an account behind on the Terms saves nothing", async () => {
	spyOn(termsAcceptance, "hasAcceptedCurrentTerms").mockResolvedValue(false)
	const sentQueries = stubConnectionPool()
	const toolResult = await toToolHandler("save_note")({ note_id: TEST_NOTE_ID, html: "<p>x</p>", version: 3 })
	expect(toResultText(toolResult)).toBe(TERMS_REJECTION_TEXT)
	expect(sentQueries).toHaveLength(0)
})

test("a teammate's note is not deleted", async () => {
	// the note belongs to user-2, and user-1 is on its team
	const sentQueries = stubConnectionPool((sentQuery) => toNoteQueryRows(sentQuery))
	const toolResult = await toToolHandler("delete_note")({ note_id: TEST_NOTE_ID })
	expect(toResultText(toolResult)).toBe("Only a note's author or an admin deletes it. The note is unchanged.")
	expect(toWriteQueries(sentQueries)).toHaveLength(0)
})
