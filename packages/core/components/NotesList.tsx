import type { NotePageRef } from "@carlnotes/client/noteClient"
import type { NotesResponse } from "@carlnotes/contracts/notes"
import type { ComponentType, ReactNode } from "react"

export type NotesListElements = {
	// the one muted line of a section with no notes and no create-note card
	EmptyCard: ComponentType<{ text: string }>
	Text: ComponentType<{ children: ReactNode; className?: string }>
}

/**
 * Lists a topic's or a team's notes: the table, or for an empty section the create-note card, or a muted line
 * for a reader who may not write.
 */
export function NotesList({
	notesResponse,
	pageType,
	canCreate,
	renderTable,
	renderCreateNoteCard,
	elements: { EmptyCard, Text },
}: {
	notesResponse: NotesResponse
	pageType: NotePageRef["pageType"]
	// a user who may create a note, or a visitor who signs up to
	canCreate: boolean
	renderTable: (notes: NotesResponse["notes"]) => ReactNode
	// the card that opens the create flow or sign-up, around its words
	renderCreateNoteCard: (words: ReactNode) => ReactNode
	elements: NotesListElements
}) {
	// a section with notes is its table
	if (notesResponse.notes.length > 0) {
		return renderTable(notesResponse.notes)
	}

	// an empty section offers a writer the create-note card, and tells a reader there is nothing yet
	if (canCreate) {
		return renderCreateNoteCard(
			<>
				<Text className="text-muted-foreground">Write a note on </Text>
				<Text className="text-link">{notesResponse.pageName}</Text>
				<Text className="text-muted-foreground">.</Text>
			</>,
		)
	}
	return <EmptyCard text={`No notes on this ${pageType} yet.`} />
}
