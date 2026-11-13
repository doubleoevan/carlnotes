import type { McpViewNotes } from "@carlnotes/contracts/mcpViews"
import type { Note, NoteResponse } from "@carlnotes/contracts/notes"
import { toNotePagePath } from "@carlnotes/contracts/seo"
import { type NoteDetailsElements, NoteDetails as SharedNoteDetails } from "@carlnotes/core/components/NoteDetails"
import type { NoteCommentThread } from "@carlnotes/core/hooks/useNoteComments"
import { cn } from "@carlnotes/nightshift/classNames"
import { AnchorLink } from "@/components/common/AnchorLink"
import { NOTE_DETAILS_ELEMENTS } from "@/components/note/NoteDetails"
import { NotesList } from "@/components/note/NotesList"
import { AddNoteLink, NotesSectionItem } from "@/components/note/NotesSectionItem"
import { NoteViewer } from "@/components/note/NoteViewer"
import { NoteVisibilityIcon } from "@/components/note/NoteVisibilitySelect"
import { Accordion } from "@/components/primitives/accordion"
import { toSignupHref } from "@/components/session/signupPrompts"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { moveMcpViewOneHop } from "./mcpViewHop"
import { openMcpViewLink, toMcpViewSiteUrl, useMcpViewData } from "./mcpViewHost"

// the tool that opens one note, which a row's press calls, and the route its result shows on
const READ_NOTES_TOOL = "read_notes"
const NOTES_ROUTE_PATH = "/notes"

// the label of the link that opens the note's page on the site, where it is edited
const EDIT_ON_SITE_LABEL = "Edit on CarlNotes"

/**
 * The note MCP view: a page's Tasting Notes section as the site shows it, or one opened note as its dialog reads it.
 * A row's press opens the note through the host. The MCP view writes nothing: Add Note and Edit on CarlNotes open the
 * page on the site, and the opened note shows no comment thread.
 */
export function NoteMcpView({ mcpViewNotes }: { mcpViewNotes: McpViewNotes }) {
	// the note's page on the site, which every write opens
	const { pageType, pageId, notesResponse, openedNote } = mcpViewNotes
	const pageHref = toNotePagePath({ kind: pageType, id: pageId, name: notesResponse.pageName })
	return openedNote ? (
		<McpViewOpenedNote note={openedNote} pageHref={pageHref} />
	) : (
		<McpViewNotesSection mcpViewNotes={mcpViewNotes} pageHref={pageHref} />
	)
}

// the page's Tasting Notes section, open, with Add Note opening the page or sign-up on the site
function McpViewNotesSection({ mcpViewNotes, pageHref }: { mcpViewNotes: McpViewNotes; pageHref: string }) {
	// a visitor's invitation and Add Note open sign-up, and a creator's open the page
	const { pageType, notesResponse } = mcpViewNotes
	const isSignedOut = useMcpViewData().session === null
	const canCreate = notesResponse.creatableVisibilities.length > 0
	const signUpHref = toSignupHref("note", pageHref)

	// a row's press takes the one hop to its note
	const handleOpenNote = (note: Note): void =>
		void moveMcpViewOneHop({
			toolName: READ_NOTES_TOOL,
			toolArguments: { note_id: note.id },
			path: NOTES_ROUTE_PATH,
			href: pageHref,
		})
	return (
		<Accordion type="multiple" defaultValue={["notes"]}>
			<NotesSectionItem
				pageType={pageType}
				noteCount={notesResponse.notes.length}
				titleClassName="font-display text-xl"
				hasCompactHeader
				actions={(canCreate || isSignedOut) && <AddNoteLink href={canCreate ? pageHref : signUpHref} />}
			>
				{/* the note table, or the invitation or the muted line of an empty section */}
				<NotesList
					notesResponse={notesResponse}
					pageType={pageType}
					signUpHref={isSignedOut ? signUpHref : null}
					onOpenNote={handleOpenNote}
					onCreate={() => void openMcpViewLink(toMcpViewSiteUrl(pageHref))}
				/>
			</NotesSectionItem>
		</Accordion>
	)
}

// one note as its dialog reads it: the owner's visibility, the name and byline, Edit on CarlNotes where the dialog's
// controls sit, and the body on its page card
function McpViewOpenedNote({ note, pageHref }: { note: NoteResponse; pageHref: string }) {
	return (
		<div className="flex flex-col gap-4">
			<SharedNoteDetails
				note={note}
				visibility={note.isNoteOwner && <NoteVisibilityIcon visibility={note.visibility} />}
				controls={
					<AnchorLink href={pageHref} className={cn(STANDALONE_LINK_CLASS, "text-sm")}>
						{EDIT_ON_SITE_LABEL}
					</AnchorLink>
				}
				isCommentsOpen={false}
				onToggleComments={ignoreCommentThreadAction}
				elements={MCP_VIEW_NOTE_DETAILS_ELEMENTS}
			/>
			<NoteViewer note={note} noteCommentThread={NO_NOTE_COMMENT_THREAD} isCommentsOpen={false} />
		</div>
	)
}

// the dialog's elements of the note's frame, with no comments toggle
const MCP_VIEW_NOTE_DETAILS_ELEMENTS: NoteDetailsElements = { ...NOTE_DETAILS_ELEMENTS, CommentsToggle: () => null }

// the empty thread the layout takes
const NO_NOTE_COMMENT_THREAD: NoteCommentThread = {
	comments: [],
	isLoading: false,
	hasError: false,
	retry: ignoreCommentThreadAction,
	postNoteComment: async () => false,
	deleteNoteComment: async () => false,
}

// do nothing on a comments toggle or a retry
function ignoreCommentThreadAction(): void {}
