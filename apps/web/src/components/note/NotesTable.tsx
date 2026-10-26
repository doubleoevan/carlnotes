// the notes table: sortable name, visibility, and updated columns, one row per visible note

import type { Note } from "@carlnotes/contracts/notes"
import {
	type NotesTableComponents,
	noteSortValues,
	NotesTable as SharedNotesTable,
} from "@carlnotes/core/components/NotesTable"

export { toVisibilityCountsLabel } from "@carlnotes/core/components/NotesTable"

import { useNoteBadge } from "@carlnotes/core/stores/noteBadgeStore"
import { cn } from "@carlnotes/nightshift/classNames"
import { CountBadge } from "@/components/common/CountBadge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { SortableHeader } from "@/components/table/SortableHeader"
import { TableCard } from "@/components/table/TableCard"
import { SMALLEST_PAGE_SIZE, TablePagination, usePaginatedRowSort } from "@/components/table/TablePagination"
import { STANDALONE_LINK_CLASS, TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { NoteVisibilityIcon } from "./NoteVisibilitySelect"

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
					components={NOTES_TABLE_COMPONENTS}
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
const NOTES_TABLE_COMPONENTS: NotesTableComponents = {
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

// one combined unread badge on a note row, its tooltip listing edits and comments separately
function NoteRowBadge({ noteId }: { noteId: string }) {
	// the pill holds one total, and the labels keep the split for the tooltip and screen readers
	const { unreadEdits, unreadComments } = useNoteBadge(noteId)
	const unreadTotal = unreadEdits + unreadComments
	if (unreadTotal === 0) {
		return null
	}
	const unreadLabels = toUnreadLabels(unreadEdits, unreadComments)
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span role="img" aria-label={unreadLabels.join(", ")}>
					<CountBadge count={unreadTotal} />
				</span>
			</TooltipTrigger>
			<TooltipContent>
				<ul className="list-disc pl-4">
					{unreadLabels.map((unreadLabel) => (
						<li key={unreadLabel}>{unreadLabel}</li>
					))}
				</ul>
			</TooltipContent>
		</Tooltip>
	)
}

/**
 * The per-kind tooltip lines for the combined note badge pill, only including the kinds with anything unread.
 */
export function toUnreadLabels(unreadEdits: number, unreadComments: number): string[] {
	const unreadLabels: string[] = []
	if (unreadEdits > 0) {
		unreadLabels.push(unreadEdits === 1 ? "1 unread edit" : `${unreadEdits} unread edits`)
	}
	if (unreadComments > 0) {
		unreadLabels.push(unreadComments === 1 ? "1 unread comment" : `${unreadComments} unread comments`)
	}
	return unreadLabels
}
