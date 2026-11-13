import type { NotePageRef } from "@carlnotes/client/noteClient"
import type { NotesResponse } from "@carlnotes/contracts/notes"
import { SITE_URL } from "@carlnotes/contracts/site"
import { type NotesListElements, NotesList as SharedNotesList } from "@carlnotes/core/components/NotesList"
import { cn } from "@carlnotes/nightshift/classNames"
import { AnchorLink } from "@/components/common/AnchorLink"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { EmptyListCard, TableCard } from "@/components/table/TableCard"
import { NotesTable } from "./NotesTable"

/**
 * Renders the web's notes list: the table, the create-note card that opens the create flow or sign-up, or a muted line for a
 * reader.
 */
export function NotesList({
	notesResponse,
	pageType,
	canCreate,
	path,
	onAdd,
}: {
	notesResponse: NotesResponse
	pageType: NotePageRef["pageType"]
	// a user who may create a note online, or a visitor whom the create-note card sends to sign-up
	canCreate: boolean
	path: string
	onAdd: () => void
}) {
	return (
		<SharedNotesList
			notesResponse={notesResponse}
			pageType={pageType}
			canCreate={canCreate}
			renderTable={(notes) => <NotesTable notes={notes} path={path} />}
			renderCreateNoteCard={(words) => (
				<TableCard className="p-4">
					<AnchorLink
						href={`${SITE_URL}${path}`}
						accessibilityLabel={`Write a note on ${notesResponse.pageName}`}
						className="min-h-6 justify-center active:opacity-75"
						hitSlop={toTouchTargetHitSlop(24)}
						onPress={(event) => {
							event.preventDefault()
							onAdd()
						}}
					>
						<Text className="text-sm">{words}</Text>
					</AnchorLink>
				</TableCard>
			)}
			elements={NOTES_LIST_ELEMENTS}
		/>
	)
}

// the native empty card and the create-note card.s inline text at the web's small size
const NOTES_LIST_ELEMENTS: NotesListElements = {
	EmptyCard: ({ text }) => <EmptyListCard text={text} />,
	Text: ({ children, className }) => <Text className={cn("text-sm", className)}>{children}</Text>,
}
