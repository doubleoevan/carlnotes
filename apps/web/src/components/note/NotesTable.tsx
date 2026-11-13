// the notes table: the standard sorted table of a page's notes, one row per visible note

import type { Note } from "@carlnotes/contracts/notes"
import { type NotesTableElements, NotesTable as SharedNotesTable } from "@carlnotes/core/components/NotesTable"

export { toVisibilityCountsLabel } from "@carlnotes/core/components/NotesTable"

import { useNoteBadge } from "@carlnotes/core/stores/noteBadgeStore"
import { cn } from "@carlnotes/nightshift/classNames"
import { DataTable } from "@/components/table/DataTable"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { NoteUnreadBadge } from "./NoteUnreadBadge"
import { NoteVisibilityIcon } from "./NoteVisibilitySelect"

export { toUnreadLabels } from "@carlnotes/core/lib/noteBadges"

/**
 * The notes on a page. A note's name calls onOpenNote.
 */
export function NotesTable({ notes, onOpenNote }: { notes: Note[]; onOpenNote: (note: Note) => void }) {
	return (
		<SharedNotesTable
			notes={notes}
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
	)
}

// the web's standard table in its card, with the visibility's icon beside its name
const NOTES_TABLE_ELEMENTS: NotesTableElements = {
	Table: (props) => <DataTable {...props} className="mb-2" />,
	Text: ({ children }) => <span>{children}</span>,
	Visibility: NoteVisibilityIcon,
}

// read the row's live counts into the shared badge composition
function NoteRowBadge({ noteId }: { noteId: string }) {
	return <NoteUnreadBadge {...useNoteBadge(noteId)} />
}
