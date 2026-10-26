import type { Note } from "./notes"

// notes of each visibility with a long title and enough rows to exercise pagination
export const TEST_NOTES: Note[] = Array.from({ length: 12 }, (_, index) => ({
	id: `note-${index}`,
	name: index === 0 ? "Notes on the small changes that made a much better cup" : `Tasting Note ${index + 1}`,
	visibility: (["private", "team", "public"] as const)[index % 3] ?? "private",
	createdAt: "2026-10-20T12:00:00Z",
	updatedAt: "2026-10-25T12:00:00Z",
	canEdit: index % 3 === 0,
	isNoteOwner: index % 3 === 0,
	canDelete: index % 3 === 0,
}))
