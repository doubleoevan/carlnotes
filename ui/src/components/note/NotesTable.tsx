// the notes table: sortable name, visibility, and updated columns, one row per visible note
import type { Note } from "@shared/contracts"
import { CountPill } from "@/components/common/CountPill"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { SortableHeader } from "@/components/table/SortableHeader"
import { TableCard } from "@/components/table/TableCard"
import { SMALLEST_PAGE_SIZE, TablePagination, usePaginatedRowSort } from "@/components/table/TablePagination"
import { toAgeLabel } from "@/lib/labels"
import { TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { useNoteBadge } from "@/stores/noteBadgeStore"
import { NoteVisibilityIcon } from "./NoteVisibilitySelect"

// the sort accessors for the note columns
const noteSortValues = {
	name: (note: Note) => note.name,
	visibility: (note: Note) => note.visibility,
	updated: (note: Note) => note.updatedAt,
}

/**
 * The per-visibility counts the footer shows, in visibility order, skipping empty visibilities.
 */
export function toVisibilityCountsLabel(notes: Pick<Note, "visibility">[]): string {
	// count each visibility, then name only the ones present
	const visibilityCounts = { private: 0, team: 0, public: 0 }
	for (const note of notes) {
		visibilityCounts[note.visibility] += 1
	}
	return (Object.keys(visibilityCounts) as (keyof typeof visibilityCounts)[])
		.filter((visibility) => visibilityCounts[visibility] > 0)
		.map((visibility) => `${visibilityCounts[visibility]} ${visibility}`)
		.join(" · ")
}

/**
 * The notes on a page. Clicking a row opens the note's dialog.
 */
export function NotesTable({ notes, onOpenNote }: { notes: Note[]; onOpenNote: (note: Note) => void }) {
	// the sorted column applies across all the table's pages
	const { pageRows, sort, pagination } = usePaginatedRowSort(notes, noteSortValues)

	// the freshest change time, shown in the footer
	const latestUpdatedAt = notes.reduce<string | null>(
		(latest, note) => (latest === null || note.updatedAt > latest ? note.updatedAt : latest),
		null,
	)
	return (
		<TableCard className="mb-2">
			<div className={TABLE_SCROLL_CLASS}>
				<table className={TABLE_CLASS}>
					<thead className={TABLE_HEAD_CLASS}>
						<tr>
							<SortableHeader sort={sort} sortKey="name" label="Note" className="py-2 pr-4" />
							<SortableHeader
								sort={sort}
								sortKey="visibility"
								label="Visibility"
								tooltip="Who may see this note"
								className="py-2 pr-4"
							/>
							<SortableHeader sort={sort} sortKey="updated" label="Updated" className="py-2 pr-4" />
						</tr>
					</thead>
					<tbody>
						{pageRows.map((note) => (
							<tr key={note.id} className="border-b">
								<td className="py-2 pr-4">
									<span className="flex items-center gap-1.5">
										<button
											type="button"
											onClick={() => onOpenNote(note)}
											className="text-link text-left hover:underline"
										>
											{note.name}
										</button>
										<NoteRowBadges noteId={note.id} />
									</span>
								</td>
								<td className="py-2 pr-4">
									<NoteVisibilityIcon visibility={note.visibility} />
								</td>
								<td className="text-muted-foreground py-2 pr-4">{toAgeLabel(note.updatedAt)}</td>
							</tr>
						))}
					</tbody>
					{/* the totals row */}
					<tfoot>
						<tr className="text-muted-foreground">
							<td className="py-2 pr-4">{`${notes.length} note${notes.length === 1 ? "" : "s"}`}</td>
							<td className="py-2 pr-4">{toVisibilityCountsLabel(notes)}</td>
							<td className="py-2 pr-4">{latestUpdatedAt ? `latest ${toAgeLabel(latestUpdatedAt)}` : ""}</td>
						</tr>
					</tfoot>
				</table>
			</div>
			{notes.length > SMALLEST_PAGE_SIZE && <TablePagination {...pagination} />}
		</TableCard>
	)
}

// the unread edit and comment badges on one note row
function NoteRowBadges({ noteId }: { noteId: string }) {
	const { unreadEdits, unreadComments } = useNoteBadge(noteId)
	return (
		<>
			{unreadEdits > 0 && <UnreadBadge count={unreadEdits} label={toNoteEditsLabel(unreadEdits)} />}
			{unreadComments > 0 && <UnreadBadge count={unreadComments} label={toNoteCommentsLabel(unreadComments)} />}
		</>
	)
}

// one outline pill with the tooltip naming what it counts
function UnreadBadge({ count, label }: { count: number; label: string }) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<span role="img" aria-label={label}>
					<CountPill count={count} variant="outline" />
				</span>
			</TooltipTrigger>
			<TooltipContent>{label}</TooltipContent>
		</Tooltip>
	)
}

// what a note's unread edits badge says
function toNoteEditsLabel(unreadEdits: number): string {
	return unreadEdits === 1 ? "1 unread edit" : `${unreadEdits} unread edits`
}

// what a note's unread comments badge says
function toNoteCommentsLabel(unreadComments: number): string {
	return unreadComments === 1 ? "1 unread comment" : `${unreadComments} unread comments`
}
