// the notes table: sortable name, visibility, and updated columns, one row per visible note

import type { Note } from "@carlnotes/contracts/notes"
import {
	type NotesTableElements,
	noteSortValues,
	NotesTable as SharedNotesTable,
} from "@carlnotes/core/components/NotesTable"

export { toVisibilityCountsLabel } from "@carlnotes/core/components/NotesTable"

import { useNoteBadge } from "@carlnotes/core/stores/noteBadgeStore"
import { cn } from "@carlnotes/nightshift/classNames"
import { SortableHeader } from "@/components/table/SortableHeader"
import { TableCard } from "@/components/table/TableCard"
import { SMALLEST_PAGE_SIZE, TablePagination, usePaginatedRowSort } from "@/components/table/TablePagination"
import { STANDALONE_LINK_CLASS, TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { NoteUnreadBadge } from "./NoteUnreadBadge"
import { NoteVisibilityIcon } from "./NoteVisibilitySelect"

export { toUnreadLabels } from "@carlnotes/core/lib/noteBadges"

/**
 * The notes on a page. Clicking a row opens the note's dialog.
 */
export function NotesTable({ notes, onOpenNote }: { notes: Note[]; onOpenNote: (note: Note) => void }) {
	const { renderedRows, sort, pagination } = usePaginatedRowSort({ rows: notes, valueByKey: noteSortValues })
	return (
		<TableCard className="mb-2">
			<div className={TABLE_SCROLL_CLASS}>
				<SharedNotesTable
					notes={notes}
					renderedRows={renderedRows}
					sort={sort}
					elements={NOTES_TABLE_ELEMENTS}
					renderNoteName={(note) => (
						<span className="flex items-center gap-1.5">
							<button type="button" onClick={() => onOpenNote(note)} className={cn(STANDALONE_LINK_CLASS, "text-left")}>
								{note.name}
							</button>
							<NoteRowBadge noteId={note.id} />
						</span>
					)}
				/>
			</div>
			{notes.length > SMALLEST_PAGE_SIZE && <TablePagination {...pagination} />}
		</TableCard>
	)
}

// keep semantic table elements, tooltips, and server-rendered row visibility on the web
const NOTES_TABLE_ELEMENTS: NotesTableElements = {
	Table: ({ children }) => <table className={TABLE_CLASS}>{children}</table>,
	Head: ({ children }) => <thead className={TABLE_HEAD_CLASS}>{children}</thead>,
	Body: ({ children }) => <tbody className="[&>tr]:border-b">{children}</tbody>,
	Foot: ({ children }) => <tfoot>{children}</tfoot>,
	Row: ({ children, className }) => <tr className={className}>{children}</tr>,
	Cell: ({ children }) => <td className="py-2 pr-4">{children}</td>,
	Header: (props) => (
		<SortableHeader
			{...props}
			tooltip={props.sortKey === "visibility" ? "Who may see this note" : undefined}
			className="py-2 pr-4"
		/>
	),
	Text: ({ children }) => <span className="text-muted-foreground">{children}</span>,
	Visibility: NoteVisibilityIcon,
}

// read the row's live counts into the shared badge composition
function NoteRowBadge({ noteId }: { noteId: string }) {
	return <NoteUnreadBadge {...useNoteBadge(noteId)} />
}
