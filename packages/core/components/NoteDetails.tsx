import type { Note } from "@carlnotes/contracts/notes"
import type { ComponentType, ReactNode } from "react"

type Container = ComponentType<{ children: ReactNode }>
export type NoteDetailsElements = {
	// the top row: the visibility at the start, the controls grouped at the end
	HeaderRow: Container
	Controls: Container
	CommentsToggle: ComponentType<{ isOpen: boolean; onToggle: () => void }>
	// the note's name, centered on its own row, for a reader who may not rename it
	Title: Container
	Byline: ComponentType<{ owner: NonNullable<Note["owner"]> }>
}

/**
 * Composes an open note's frame above its body: the visibility and the controls with the comments toggle on one row,
 * then the name and the owner's byline.
 */
export function NoteDetails({
	note,
	visibility,
	title,
	controls,
	isCommentsOpen,
	isHeaderRowOnly = false,
	onToggleComments,
	elements: { HeaderRow, Controls, CommentsToggle, Title, Byline },
}: {
	note: Pick<Note, "name" | "owner">
	// the owner's visibility select, or null for a reader
	visibility: ReactNode
	// the editable name for an editor, which replaces the read-only title
	title?: ReactNode
	// the controls after the comments toggle, such as expand and close
	controls?: ReactNode
	isCommentsOpen: boolean
	// true while the body's keyboard is up on a phone, which keeps the row and hides the name and byline
	isHeaderRowOnly?: boolean
	onToggleComments: () => void
	elements: NoteDetailsElements
}) {
	return (
		<>
			<HeaderRow>
				{visibility}
				<Controls>
					<CommentsToggle isOpen={isCommentsOpen} onToggle={onToggleComments} />
					{controls}
				</Controls>
			</HeaderRow>
			{/* the name, then who wrote the note */}
			{!isHeaderRowOnly && (title ?? <Title>{note.name}</Title>)}
			{!isHeaderRowOnly && note.owner && <Byline owner={note.owner} />}
		</>
	)
}
