import type { NotePageRef } from "@carlnotes/client/noteClient"
import type { Note, NotesResponse } from "@carlnotes/contracts/notes"
import { type NotesListElements, NotesList as SharedNotesList } from "@carlnotes/core/components/NotesList"
import { cn } from "@carlnotes/nightshift/classNames"
import { AnchorLink } from "@/components/common/AnchorLink"
import { EmptyListCard } from "@/components/table/TableCard"
import { CARD_CLASS } from "@/lib/styleClasses"
import { NotesTable } from "./NotesTable"

// the create-note card, which opens the create flow for a creator or the sign-up page for a visitor
const CREATE_NOTE_CARD_CLASS = cn(CARD_CLASS, "mb-2 block w-full text-left text-sm")

/**
 * The notes in a Tasting Notes section: the table, the create-note card, or a muted line for a reader.
 */
export function NotesList({
	notesResponse,
	pageType,
	signUpHref,
	onOpenNote,
	onCreate,
}: {
	notesResponse: NotesResponse
	pageType: NotePageRef["pageType"]
	// the sign-up page a visitor.s create-note card opens, or null for a signed-in user
	signUpHref: string | null
	onOpenNote: (note: Note) => void
	onCreate: () => void
}) {
	// a creator.s create-note card opens the create flow, and a visitor's opens sign-up
	const canCreate = notesResponse.creatableVisibilities.length > 0
	return (
		<SharedNotesList
			notesResponse={notesResponse}
			pageType={pageType}
			canCreate={canCreate || Boolean(signUpHref)}
			renderTable={(notes) => <NotesTable notes={notes} onOpenNote={onOpenNote} />}
			renderCreateNoteCard={(words) =>
				canCreate || !signUpHref ? (
					<button type="button" onClick={onCreate} className={CREATE_NOTE_CARD_CLASS}>
						{words}
					</button>
				) : (
					<AnchorLink href={signUpHref} className={CREATE_NOTE_CARD_CLASS}>
						{words}
					</AnchorLink>
				)
			}
			elements={NOTES_LIST_ELEMENTS}
		/>
	)
}

// the web's empty card and inline text
const NOTES_LIST_ELEMENTS: NotesListElements = {
	EmptyCard: ({ text }) => <EmptyListCard>{text}</EmptyListCard>,
	Text: ({ children, className }) => <span className={className}>{children}</span>,
}
