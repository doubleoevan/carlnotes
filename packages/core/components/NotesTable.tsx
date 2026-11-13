import type { Note } from "@carlnotes/contracts/notes"
import { toDotSeparatedText } from "@carlnotes/contracts/text"
import type { ComponentType, ReactNode } from "react"
import { toMonthYearLabel } from "../lib/labels"
import type { SortedTableElement } from "../lib/tableElements"
import type { TableColumn } from "./DataTable"

// the same note columns, ordering, visibility names, and totals on both platforms
const noteSortValues = {
	name: (note: Note) => note.name,
	visibility: (note: Note) => note.visibility,
	updated: (note: Note) => note.updatedAt,
}
export const NOTE_VISIBILITY_LABELS = { private: "Private", team: "Team", public: "Public" }
export type NotesTableElements = {
	Table: SortedTableElement
	Text: ComponentType<{ children: ReactNode }>
	Visibility: ComponentType<{ visibility: Note["visibility"]; label: string }>
}

/**
 * Renders the notes as a standard sorted table, newest update first, with the totals under it.
 */
export function NotesTable({
	notes,
	renderNoteName,
	elements: { Table, Text, Visibility },
}: {
	notes: Note[]
	renderNoteName: (note: Note) => ReactNode
	elements: NotesTableElements
}) {
	const columns: TableColumn<Note>[] = [
		{ key: "name", label: "Note", width: 192, render: renderNoteName, footer: <Text>Total</Text> },
		{
			key: "visibility",
			label: "Visibility",
			width: 112,
			tooltip: "Who may see this note",
			render: (note) => <Visibility visibility={note.visibility} label={NOTE_VISIBILITY_LABELS[note.visibility]} />,
			footer: <Text>{toVisibilityCountsLabel(notes)}</Text>,
		},
		{ key: "updated", label: "Updated", width: 112, render: (note) => <Text>{toMonthYearLabel(note.updatedAt)}</Text> },
	]
	return (
		<Table
			rows={notes}
			columns={columns}
			valueByKey={noteSortValues}
			initialSort={{ key: "updated", isDescending: true }}
			getRowId={(note) => note.id}
		/>
	)
}

/**
 * Returns the footer counts in visibility order, skipping empty visibilities.
 */
export function toVisibilityCountsLabel(notes: Pick<Note, "visibility">[]): string {
	// count each visibility, then name only the ones present
	const visibilityCounts = { private: 0, team: 0, public: 0 }
	for (const note of notes) {
		visibilityCounts[note.visibility] += 1
	}
	return toDotSeparatedText(
		(Object.keys(visibilityCounts) as (keyof typeof visibilityCounts)[])
			.filter((visibility) => visibilityCounts[visibility] > 0)
			.map((visibility) => `${visibilityCounts[visibility]} ${visibility}`),
	)
}
