// the note MCP view through the test host: a page's notes with no tool call on load, the one hop to a note through
// read_notes, back to the list, and the links that open the site for every write
import { expect, test } from "bun:test"
import type { McpViewData, McpViewNotes } from "@carlnotes/contracts/mcpViews"
import type { NoteResponse } from "@carlnotes/contracts/notes"
import { NOTE_FORMATS_HTML, TEST_NOTES, toTestNote } from "@carlnotes/contracts/noteTestFixtures"
import { toMcpViewToolResult, USER_MCP_VIEW_DATA, VISITOR_MCP_VIEW_DATA } from "./mcpViewFixtures"
import { waitForRecord, withMcpView } from "./mcpViewTestHarness"
import { type McpViewToolResult, type OpenMcpViewOptions, TEST_SITE_URL } from "./mcpViewTestHost"

// three notes on a public topic, which a user may add to
const LISTED_NOTES = TEST_NOTES.slice(0, 3)
const [FIRST_NOTE] = LISTED_NOTES

// the first note as read_notes opens it, with a line of its own and every format the reader draws
const OPENED_NOTE_LINE = "Bright and sweet at 94 degrees."
export const OPENED_NOTE = toTestNote({ ...FIRST_NOTE, html: `<p>${OPENED_NOTE_LINE}</p>${NOTE_FORMATS_HTML}` })

// the page's notes, with no note open
const NOTES: McpViewNotes = {
	pageType: "topic",
	pageId: "topic-1",
	notesResponse: { pageName: "Pour-over coffee", creatableVisibilities: ["private", "public"], notes: LISTED_NOTES },
	openedNote: null,
}

/**
 * Returns a read_notes result: the page's notes, or the note it opened, for a user unless another caller is given.
 */
export function toNotesToolResult({
	openedNote = null,
	mcpViewData = USER_MCP_VIEW_DATA,
}: {
	openedNote?: NoteResponse | null
	mcpViewData?: McpViewData
} = {}): McpViewToolResult {
	// a visitor may create no note
	const creatableVisibilities = mcpViewData.session ? NOTES.notesResponse.creatableVisibilities : []
	const notes = { ...NOTES, notesResponse: { ...NOTES.notesResponse, creatableVisibilities }, openedNote }
	return toMcpViewToolResult({ structuredContent: { items: [] }, mcpViewData: { ...mcpViewData, notes } })
}

test("the note MCP view lists the page's notes, calls no tool on load, and Add Note opens the page", async () => {
	await withMcpView({ mcpView: "note" }, async ({ frame, links, toolCalls, sendToolResult }) => {
		await sendToolResult(toNotesToolResult())
		await frame.getByRole("button", { name: FIRST_NOTE?.name }).waitFor()
		await frame.getByText("Tasting Notes").waitFor()
		expect(toolCalls).toEqual([])

		// Add Note opens the topic's page on the site, where a note is written
		await frame.getByRole("link", { name: "Add Note" }).click()
		await waitForRecord(links)
		expect(links[0]).toStartWith(`${TEST_SITE_URL}/topics/topic-1`)
	})
})

test("a visitor's Add Note opens sign-up", async () => {
	await withMcpView({ mcpView: "note" }, async ({ frame, links, sendToolResult }) => {
		await sendToolResult(toNotesToolResult({ mcpViewData: VISITOR_MCP_VIEW_DATA }))
		await frame.getByRole("link", { name: "Add Note" }).click()
		await waitForRecord(links)
		expect(links[0]).toStartWith(`${TEST_SITE_URL}/signup`)
	})
})

test("a row's press calls read_notes and shows that note, and back returns to the list with no tool call", async () => {
	const options: OpenMcpViewOptions = {
		mcpView: "note",
		respondToToolCall: () => toNotesToolResult({ openedNote: OPENED_NOTE }),
	}
	await withMcpView(options, async ({ frame, links, toolCalls, sendToolResult }) => {
		await sendToolResult(toNotesToolResult())
		await frame.getByRole("button", { name: FIRST_NOTE?.name }).click()

		// the note shows read-only, read through its tool
		await frame.getByRole("heading", { name: OPENED_NOTE.name }).waitFor()
		await frame.getByText(OPENED_NOTE_LINE).waitFor()
		expect(toolCalls).toEqual([{ name: "read_notes", arguments: { note_id: OPENED_NOTE.id } }])

		// Edit on CarlNotes opens the note's page on the site
		await frame.getByRole("link", { name: "Edit on CarlNotes" }).click()
		await waitForRecord(links)
		expect(links[0]).toStartWith(`${TEST_SITE_URL}/topics/topic-1`)

		// back shows the list it kept
		await frame.getByRole("button", { name: "Back" }).click()
		await frame.getByRole("button", { name: FIRST_NOTE?.name }).waitFor()
		expect(toolCalls).toHaveLength(1)
	})
})
