// render tests for the note table, the static body, and the visibility tooltips
import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { NoteStatic } from "./NoteStatic"
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
		isTopicOwner: true,
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

// stored HTML renders as-is
test("the static body renders the server html", () => {
	const html = renderToStaticMarkup(<NoteStatic html="<p>keep the beans</p>" />)
	expect(html).toContain("keep the beans")
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
