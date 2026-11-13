// the mcp smoke's sections for the tasting note tools: the owner creates a public note on the smoke's topic, reads and
// saves it on both routes, saves a body past one read and reads it cut within the result bounds, a visitor lists it,
// a stale version saves nothing, and the bound route deletes it

import { checkPageBounds, type SmokeClient } from "./mcpResultSmokeSections"
import { check, routePaths, topicId, withClient } from "./mcpSmokeFixtures"
import { toResultText } from "./toolTestFixtures"

// a body longer than one read: sixty paragraphs of about fifteen hundred characters
const LONG_NOTE_HTML = Array.from(
	{ length: 60 },
	(_, i) => `<p>${`Paragraph ${i} of the smoke note. `.repeat(45)}</p>`,
).join("")

// what read_notes returns for one opened note
type OpenedNote = { html: string; version: number | null; isHtmlCut: boolean }

/** Checks the owner's note writes and reads on both routes, a visitor's list, and the delete on the bound route. */
export async function checkNoteTools(accessToken: string): Promise<void> {
	const noteId = await createSmokeNote(accessToken)
	if (!noteId) {
		return
	}

	// the owner lists, opens, and saves the note on both routes
	for (const routePath of routePaths) {
		await withClient(routePath, accessToken, async (client) => {
			const listResult = await client.callTool({ name: "read_notes", arguments: { topic_id: topicId } })
			const listedIds = toListedNoteIds(listResult)
			check(`${routePath}: read_notes lists the owner's note`, Boolean(listedIds?.includes(noteId)), listedIds)
			checkPageBounds(`${routePath} read_notes list`, listResult)

			// the body saves at the version it was read at, and not again
			await checkBodySave(client, routePath, noteId)
		})
	}

	// a visitor lists the public note on the public topic
	await withClient("/mcp", undefined, async (client) => {
		const listResult = await client.callTool({ name: "read_notes", arguments: { topic_id: topicId } })
		const listedIds = toListedNoteIds(listResult)
		check("/mcp: a visitor's read_notes lists the public note", Boolean(listedIds?.includes(noteId)), listedIds)
	})

	// a body past one read is cut within the bounds, then the bound route deletes the note
	await withClient(`/mcp/t/${topicId}`, accessToken, async (client) => {
		await checkLongNote(client, noteId)
		const deleteResult = await client.callTool({ name: "delete_note", arguments: { note_id: noteId } })
		check("bound route: delete_note deletes the owner's note", toResultText(deleteResult) === "Deleted the note.")
		const readResult = await client.callTool({ name: "read_notes", arguments: { note_id: noteId } })
		check("bound route: a deleted note reads as missing", Boolean(readResult.isError), toResultText(readResult))
	})
}

// create the smoke's public note on /mcp, and return its id
async function createSmokeNote(accessToken: string): Promise<string | null> {
	let noteId: string | null = null
	await withClient("/mcp", accessToken, async (client) => {
		const createResult = await client.callTool({
			name: "save_note",
			arguments: { topic_id: topicId, name: "Smoke note", visibility: "public" },
		})
		noteId = (createResult.structuredContent as { noteId?: string } | undefined)?.noteId ?? null
		check("/mcp: save_note creates a public note", noteId !== null, toResultText(createResult))
	})
	return noteId
}

// open the note, save a body at its version, and check a save at the old version saves nothing
async function checkBodySave(client: SmokeClient, routePath: string, noteId: string): Promise<void> {
	// the note's version, and a body saved at it
	const readResult = await client.callTool({ name: "read_notes", arguments: { note_id: noteId } })
	const { version } = readResult.structuredContent as OpenedNote
	const saveResult = await client.callTool({
		name: "save_note",
		arguments: { note_id: noteId, html: `<p>Saved on ${routePath}</p>`, version },
	})
	check(`${routePath}: save_note saves the body at the read version`, !saveResult.isError, toResultText(saveResult))

	// the same version again is stale now
	const staleResult = await client.callTool({
		name: "save_note",
		arguments: { note_id: noteId, html: "<p>stale</p>", version },
	})
	check(
		`${routePath}: save_note at a stale version saves nothing`,
		Boolean(staleResult.isError) && toResultText(staleResult).includes("changed since it was read"),
		toResultText(staleResult),
	)
}

// save a body past one read, then read it cut at a whole block, with no version, inside the result bounds
async function checkLongNote(client: SmokeClient, noteId: string): Promise<void> {
	// the current version, and the long body saved at it
	const readResult = await client.callTool({ name: "read_notes", arguments: { note_id: noteId } })
	const { version } = readResult.structuredContent as OpenedNote
	await client.callTool({ name: "save_note", arguments: { note_id: noteId, html: LONG_NOTE_HTML, version } })

	// the long note reads cut and bounded
	const longResult = await client.callTool({ name: "read_notes", arguments: { note_id: noteId } })
	const longNote = longResult.structuredContent as OpenedNote
	check("bound route: a long note reads cut with no version", longNote.isHtmlCut && longNote.version === null)
	checkPageBounds("bound route read_notes long note", longResult)
}

// the ids of the notes a read_notes list returned
function toListedNoteIds(listResult: Awaited<ReturnType<SmokeClient["callTool"]>>): string[] | undefined {
	return (listResult.structuredContent as { items?: { id: string }[] }).items?.map((note) => note.id)
}
