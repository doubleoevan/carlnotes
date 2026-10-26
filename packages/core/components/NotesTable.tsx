import type { Note } from "@carlnotes/contracts/notes"
import { toDotSeparatedText } from "@carlnotes/contracts/text"
import type { ComponentType, ReactNode } from "react"
import type { RowSort } from "../hooks/useRowSort"
import { toAgeLabel } from "../lib/labels"

// the same note columns, ordering, visibility names, and totals on both platforms
export const noteSortValues = {
	name: (note: Note) => note.name,
	visibility: (note: Note) => note.visibility,
	updated: (note: Note) => note.updatedAt,
}
export const NOTE_VISIBILITY_LABELS = { private: "Private", team: "Team", public: "Public" }
type Container = ComponentType<{ children: ReactNode }>
export type NotesTableComponents = {
	Table: Container
	Head: Container
	Body: Container
	Foot: Container
	Row: ComponentType<{ children: ReactNode; className?: string; hasSeparator?: boolean }>
	Cell: ComponentType<{ children: ReactNode; column: "name" | "visibility" | "updated" }>
	Header: ComponentType<{ sort: RowSort; sortKey: string; label: string }>
	Text: Container
	Visibility: ComponentType<{ visibility: Note["visibility"]; label: string }>
}

/**
 * Renders the note table's columns, update details, and totals through platform table elements.
 */
export function NotesTable({
	notes,
	renderedRows,
	sort,
	renderNoteName,
	components: { Table, Head, Body, Foot, Row, Cell, Header, Text, Visibility },
}: {
	notes: Note[]
	renderedRows: { row: Note; className?: string }[]
	sort: RowSort
	renderNoteName: (note: Note) => ReactNode
	components: NotesTableComponents
}) {
	const latestUpdatedAt = notes.reduce<string | null>(
		(latest, note) => (latest === null || note.updatedAt > latest ? note.updatedAt : latest),
		null,
	)
	return (
		<Table>
			{/* the same sortable columns on every platform */}
			<Head>
				<Row>
					<Header sort={sort} sortKey="name" label="Note" />
					<Header sort={sort} sortKey="visibility" label="Visibility" />
					<Header sort={sort} sortKey="updated" label="Updated" />
				</Row>
			</Head>
			<Body>
				{renderedRows.map(({ row: note, className }) => (
					<Row key={note.id} className={className} hasSeparator>
						<Cell column="name">{renderNoteName(note)}</Cell>
						<Cell column="visibility">
							<Visibility visibility={note.visibility} label={NOTE_VISIBILITY_LABELS[note.visibility]} />
						</Cell>
						<Cell column="updated">
							<Text>{toAgeLabel(note.updatedAt)}</Text>
						</Cell>
					</Row>
				))}
			</Body>
			{/* totals describe every note, including rows on other pages */}
			<Foot>
				<Row>
					<Cell column="name">
						<Text>{notes.length + (notes.length === 1 ? " note" : " notes")}</Text>
					</Cell>
					<Cell column="visibility">
						<Text>{toVisibilityCountsLabel(notes)}</Text>
					</Cell>
					<Cell column="updated">
						<Text>{latestUpdatedAt ? `latest ${toAgeLabel(latestUpdatedAt)}` : ""}</Text>
					</Cell>
				</Row>
			</Foot>
		</Table>
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
