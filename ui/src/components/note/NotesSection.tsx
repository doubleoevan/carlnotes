// the Tasting Notes section: the header row with its Add note call to action, the note table,
// the empty state, and the dialog notes open in. the default render is the table alone
import type { Note, NotesResponse } from "@shared/contracts"
import { Plus } from "lucide-react"
import { useCallback, useEffect, useRef, useState } from "react"
import { authClient } from "@/clients/authClient"
import { fetchNotes, type NotePageRef } from "@/clients/noteClient"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { Button, buttonVariants } from "@/components/primitives/button"
import { CARD_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { NoteDialog } from "./NoteDialog"
import { NotesTable } from "./NotesTable"

/**
 * The Tasting Notes section for a topic page or a team page. The Add note button shares the header row.
 */
export function NotesSection({
	pageType,
	pageId,
	titleClassName,
	isInsideAccordion = false,
}: NotePageRef & {
	// the header text style the mounting page uses for its sibling sections
	titleClassName?: string
	// true when a parent accordion already wraps this. then this renders a bare accordion item
	isInsideAccordion?: boolean
}) {
	// the page's notes payload, null before it loads or when the page is not visible
	const [notes, setNotes] = useState<NotesResponse | null>(null)

	// a visitor is sent to the sign-up page instead of the create modal
	const { data: session } = authClient.useSession()
	const isSignedOut = !session

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

	// nothing renders without a visible page
	if (!notes) {
		return null
	}
	// a team's notes are its own, a topic's are Carl's tasting notes
	const sectionTitle = pageType === "team" ? "Team notes" : "Tasting Notes"

	// a visitor gets the same invitation a member does. cta names the link for analytics
	const signUpHref = "/signup?cta=note"

	// the invitation an empty section shows, worded the same for the creator's card and the visitor's link
	const inviteCardClass = cn(CARD_CLASS, "mb-2 block w-full text-left text-sm")
	const invitation = (
		<>
			<span className="text-muted-foreground">Write a note on </span>
			<span className="text-link">{notes.pageName}</span>
			<span className="text-muted-foreground">.</span>
		</>
	)
	// the notes as one accordion item
	const notesSection = (
		<AccordionItem value="notes">
			{/* the Add Note button sits beside the trigger. clicks on it never toggle the section */}
			<div className="flex items-center gap-2 [&>:first-child]:flex-1">
				<AccordionTrigger>
					<span className={titleClassName}>{sectionTitle}</span>
				</AccordionTrigger>
				{notes.creatableVisibilities.length > 0 ? (
					<Button className="shrink-0" onClick={() => setOpenDialog("create")}>
						<Plus className="size-4" />
						Add Note
					</Button>
				) : (
					isSignedOut && (
						<AnchorLink href={signUpHref} className={cn(buttonVariants(), "shrink-0")}>
							<Plus className="size-4" />
							Add Note
						</AnchorLink>
					)
				)}
			</div>
			<AccordionContent>
				{/* an empty section a creator can fill, the card opening the create dialog */}
				{notes.notes.length === 0 && notes.creatableVisibilities.length > 0 && (
					<button type="button" onClick={() => setOpenDialog("create")} className={inviteCardClass}>
						{invitation}
					</button>
				)}

				{/* the same invitation for a visitor, who signs up to take it */}
				{notes.notes.length === 0 && notes.creatableVisibilities.length === 0 && isSignedOut && (
					<AnchorLink href={signUpHref} className={inviteCardClass}>
						{invitation}
					</AnchorLink>
				)}

				{/* signed in with nothing to read and nothing to write */}
				{notes.notes.length === 0 && notes.creatableVisibilities.length === 0 && !isSignedOut && (
					<div className={cn(CARD_CLASS, "mb-2")}>
						<p className="text-muted-foreground py-2 text-sm">
							{pageType === "team" ? "No notes on this team yet." : "No notes on this topic yet."}
						</p>
					</div>
				)}

				{/* the note table */}
				{notes.notes.length > 0 && <NotesTable notes={notes.notes} onOpenNote={setOpenDialog} />}
			</AccordionContent>
		</AccordionItem>
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

			{/* the dialog, which owns any live connection while it is open */}
			{openDialog !== null && (
				<NoteDialog
					page={{ pageType, pageId }}
					pageName={notes.pageName}
					creatableVisibilities={notes.creatableVisibilities}
					mentionableUsernames={notes.mentionableUsernames}
					note={openDialog === "create" ? null : openDialog}
					onClose={() => setOpenDialog(null)}
					onChanged={reloadNotes}
				/>
			)}
		</>
	)
}
