// the note dialog's contract with the bundle: the default table render requests nothing and loads no editor code, the
// editor package reaches the dialog only through its lazy imports, and the save status sits behind the edit right
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { NotesTable } from "./NotesTable"

// the default render of the note table fetches nothing
test("the table render opens no request", () => {
	// count every request the render would send
	let requestCount = 0
	const fetchBefore = globalThis.fetch
	globalThis.fetch = (async () => {
		requestCount += 1
		return new Response("{}")
	}) as unknown as typeof fetch

	// the table renders its rows alone, no note bodies
	try {
		const html = renderToStaticMarkup(
			<NotesTable
				notes={[
					{
						id: "n1",
						name: "Beans",
						visibility: "team",
						createdAt: "2026-08-01T00:00:00.000Z",
						updatedAt: "2026-08-20T00:00:00.000Z",
						canEdit: true,
						isNoteOwner: false,
						canDelete: false,
					},
				]}
				onOpenNote={() => {}}
			/>,
		)
		expect(html).toContain("Beans")
	} finally {
		globalThis.fetch = fetchBefore
	}
	expect(requestCount).toBe(0)
})

// the editor chunk stays out of the default path: the dialog reaches the editor package only through dynamic imports,
// for the editor and for the reader alike
test("the dialog module never imports the editor package statically", async () => {
	const dialogSource = await Bun.file(new URL("./NoteDialog.tsx", import.meta.url)).text()
	expect(dialogSource).toContain('import("./NoteEditor")')
	expect(dialogSource).toContain('import("./NoteViewer")')
	expect(dialogSource).toContain("lazy(loadNoteEditor)")
	expect(dialogSource).toContain("lazy(loadNoteViewer)")
	expect(dialogSource).not.toMatch(/^import .*react-native-enriched-html/m)
})

// the save status belongs to a note that can change, so it sits behind the edit right. a reader without it has no
// save and nothing that could be saving, and the whole row goes when they hold neither right
test("the save status renders only for an editor", async () => {
	const dialogSource = await Bun.file(new URL("./NoteDialog.tsx", import.meta.url)).text()
	const noteFooter = dialogSource.slice(
		dialogSource.indexOf("function NoteFooter"),
		dialogSource.indexOf("function OpenNote"),
	)
	expect(noteFooter.slice(0, noteFooter.indexOf("SAVE_STATUS_LABELS"))).toContain("canEdit && (")
	expect(noteFooter).toContain("if (!canEdit && !canDelete) {")
})
