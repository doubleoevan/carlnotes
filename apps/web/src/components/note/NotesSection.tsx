// the Tasting Notes section: the header row with its Add note call to action, the note table,
// the empty state, and the dialog notes open in. the default render is the table alone

import { authClient } from "@carlnotes/client/authClient"
import { fetchNotes, type NotePageRef } from "@carlnotes/client/noteClient"
import type { Note, NotesResponse } from "@carlnotes/contracts/notes"
import { useLocation } from "@tanstack/react-router"
import { Plus } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { Accordion } from "@/components/primitives/accordion"
import { Button } from "@/components/primitives/button"
import { toSignupHref } from "@/components/session/signupPrompts"
import { NoteDialog } from "./NoteDialog"
import { NotesList } from "./NotesList"
import { ADD_NOTE_LABEL, AddNoteLink, NotesSectionItem } from "./NotesSectionItem"
import { PageNoteBadge } from "./NoteUnreadBadge"

/**
 * The Tasting Notes section for a topic page or a team page. The Add note button shares the header row.
 */
export function NotesSection({
	pageType,
	pageId,
	titleClassName,
	hasCompactHeader = false,
	isInsideAccordion = false,
	accordionItemClassName,
	onNoteCountChange,
}: NotePageRef & {
	// the header text style the mounting page uses for its sibling sections
	titleClassName?: string
	// true on a page whose sections have a compact header. then this header matches theirs, with space under the Add note
	// button
	hasCompactHeader?: boolean
	// true when a parent accordion already wraps this. then this renders a bare accordion item
	isInsideAccordion?: boolean
	// the section's own classes, such as the divider under closed notes that sit above another section
	accordionItemClassName?: string
	// the count of the notes the section lists as it stands, for the page's details line. null until the notes load
	onNoteCountChange?: (noteCount: number | null) => void
}) {
	// the page's notes payload, null before it loads or when the page is not visible
	const [notes, setNotes] = useState<NotesResponse | null>(null)

	// a visitor is sent to the sign-up page instead of the create modal, and returns to this page once signed up
	const { data: session } = authClient().useSession()
	const isSignedOut = !session
	const pageHref = useLocation({ select: (location) => location.href })

	// the open dialog state: a note being read, the create flow, or closed
	const [openDialog, setOpenDialog] = useState<Note | "create" | null>(null)

	// one fetch per page, repeated after any note change. a slow response never overwrites a newer one
	const reloadTokenRef = useRef(0)
	const reloadNotes = useCallback(() => {
		const token = ++reloadTokenRef.current
		void fetchNotes({ pageType, pageId }).then((payload) => {
			if (token === reloadTokenRef.current) {
				setNotes(payload)
			}
		})
	}, [pageType, pageId])
	useEffect(reloadNotes, [reloadNotes])

	// report how many notes the section lists
	const noteCount = notes ? notes.notes.length : null
	useEffect(() => {
		onNoteCountChange?.(noteCount)
	}, [noteCount, onNoteCountChange])

	// nothing renders without a visible page
	if (!notes) {
		return null
	}

	// a visitor gets the same invitation a member does. cta names the link for analytics
	const signUpHref = toSignupHref("note", pageHref)

	// the notes as one accordion item
	const notesSection = (
		<NotesSectionItem
			pageType={pageType}
			noteCount={noteCount}
			titleClassName={titleClassName}
			hasCompactHeader={hasCompactHeader}
			className={accordionItemClassName}
			actions={
				<>
					<PageNoteBadge pageType={pageType} pageId={pageId} />
					{notes.creatableVisibilities.length > 0 ? (
						<Button className="shrink-0" onClick={() => setOpenDialog("create")}>
							<Plus className="size-4" />
							{ADD_NOTE_LABEL}
						</Button>
					) : (
						isSignedOut && <AddNoteLink href={signUpHref} />
					)}
				</>
			}
		>
			{/* the note table, or the invitation or the muted line of an empty section */}
			<NotesList
				notesResponse={notes}
				pageType={pageType}
				signUpHref={isSignedOut ? signUpHref : null}
				onOpenNote={setOpenDialog}
				onCreate={() => setOpenDialog("create")}
			/>
		</NotesSectionItem>
	)
	return (
		<>
			{/* a team page provides the accordion around this item, a topic page gets its own accordian */}
			{isInsideAccordion ? (
				notesSection
			) : (
				<Accordion type="multiple" defaultValue={["notes"]}>
					{notesSection}
				</Accordion>
			)}

			{/* the dialog, which owns the note's save while it is open */}
			{openDialog !== null && (
				<NoteDialog
					page={{ pageType, pageId }}
					pageName={notes.pageName}
					creatableVisibilities={notes.creatableVisibilities}
					note={openDialog === "create" ? null : openDialog}
					onClose={() => setOpenDialog(null)}
					onChanged={reloadNotes}
				/>
			)}
		</>
	)
}
