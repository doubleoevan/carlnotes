// render tests for the note table and the visibility tooltips, and the reader's one way of rendering a body
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { NotesTable, toVisibilityCountsLabel } from "./NotesTable"
import { VISIBILITY_TOOLTIPS } from "./NoteVisibilitySelect"

// one note as the table lists it
function note(visibility: "private" | "team" | "public", name = "Ideas") {
	return {
		id: `n-${visibility}-${name}`,
		name,
		visibility,
		createdAt: "2026-08-01T00:00:00.000Z",
		updatedAt: "2026-08-20T00:00:00.000Z",
		canEdit: true,
		isNoteOwner: true,
		canDelete: true,
	}
}

// the visibility tooltips use the exact specified copy
test("visibility tooltips use the exact copy", () => {
	expect(VISIBILITY_TOOLTIPS.private).toBe("Only you can see this note.")
	expect(VISIBILITY_TOOLTIPS.team).toBe("Only your team can see this note.")
	expect(VISIBILITY_TOOLTIPS.public).toBe("Everyone can see this note.")
})

// the table lists every note with its name, its visibility icon, and its date columns
test("the table renders name, visibility, and updated columns", () => {
	const html = renderToStaticMarkup(
		<NotesTable
			notes={[note("private", "Mine"), note("team", "Ours"), note("public", "Everyone's")]}
			onOpenNote={() => {}}
		/>,
	)
	// the sortable headers
	expect(html).toContain("Note")
	expect(html).toContain("Visibility")
	expect(html).toContain("Updated")
	// each row's name and visibility icon label
	expect(html).toContain("Mine")
	expect(html).toContain("Ours")
	expect(html).toContain("lucide-lock")
	expect(html).toContain("lucide-users")
	expect(html).toContain("lucide-globe")
})

// the reader renders the stored body through the editor package's display component, which needs a browser, and
// never injects it as raw html
test("the read-only body renders through the viewer component", async () => {
	const viewerSource = await Bun.file(new URL("./NoteViewer.tsx", import.meta.url)).text()
	expect(viewerSource).toContain("<EnrichedText ")
	expect(viewerSource).toContain("<SharedNoteViewer")
	expect(viewerSource).toContain("{html}")
	expect(viewerSource).not.toContain("dangerouslySetInnerHTML")
})

// the footer counts the notes and splits them by visibility, skipping empty visibilities
test("the footer counts notes by visibility", () => {
	const html = renderToStaticMarkup(
		<NotesTable
			notes={[note("private", "Mine"), note("private", "Also mine"), note("public", "Ours")]}
			onOpenNote={() => {}}
		/>,
	)
	expect(html).toContain("3 notes")
	expect(html).toContain("2 private · 1 public")
	expect(html).toContain("latest")
	// the label itself skips empty visibilities and keeps visibility order
	expect(toVisibilityCountsLabel([{ visibility: "team" }, { visibility: "team" }])).toBe("2 team")
})
