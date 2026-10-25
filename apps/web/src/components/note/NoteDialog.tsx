// the note dialog, which creates a note or opens one. a user who can edit gets the editor on the stored body, and a
// read-only open gets the body rendered as is, both with the comment thread beside it

import { deleteNote, fetchNote, type NotePageRef, sendNoteRead, updateNote } from "@carlnotes/client/noteClient"
import { NOTE_NAME_MAX_CHARS, type Note, type NoteResponse } from "@carlnotes/contracts/notes"
import type { NoteSaveErrorReason, NoteSaveStatus } from "@carlnotes/core/hooks/useNoteBodySave"
import { useNoteComments } from "@carlnotes/core/hooks/useNoteComments"
import { markNoteOpened } from "@carlnotes/core/stores/noteBadgeStore"
import { cn } from "@carlnotes/nightshift/classNames"
import { Maximize2, MessageSquareText, Minimize2, Pencil, X } from "lucide-react"
import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/primitives/dialog"
import { Input } from "@/components/primitives/input"
import { isWideScreen } from "@/lib/utils"
import { CreateNote } from "./CreateNote"
import { ToolbarButton } from "./NoteToolbar"
import { type NoteVisibility, NoteVisibilitySelect, VISIBILITY_TOOLTIPS } from "./NoteVisibilitySelect"

// the editor and the reader load with the editor package only when a note opens, in the browser alone. the dialog
// starts the one it will show as it mounts, while the note is still on its way
const loadNoteEditor = () =>
	import("./NoteEditor").then((noteEditorModule) => ({ default: noteEditorModule.NoteEditor }))
const loadNoteStatic = () =>
	import("./NoteStatic").then((noteStaticModule) => ({ default: noteStaticModule.NoteStatic }))
const NoteEditor = lazy(loadNoteEditor)
const NoteStatic = lazy(loadNoteStatic)

// the line shown while the note is on its way
const LOADING_LINE = <p className="text-muted-foreground py-2 text-sm">{"Unfolding the note…"}</p>

// how the dialog words each save status. the toast carries the reason, so these stay the plain fact
const SAVE_STATUS_LABELS: Record<NoteSaveStatus, string> = {
	saving: "Saving…",
	saved: "Saved",
	unsaved: "Not saved",
}

/**
 * One note's dialog, or the create flow when no note is given. Closing it sends any save still waiting.
 */
export function NoteDialog({
	page,
	pageName,
	creatableVisibilities,
	note,
	onClose,
	onChanged,
}: {
	page: NotePageRef
	// the topic or team the note belongs to, named in the empty note's placeholder
	pageName: string
	creatableVisibilities: NoteVisibility[]
	// null opens the create flow
	note: Note | null
	onClose: () => void
	onChanged: () => void
}) {
	// a created note swaps the dialog from the create flow straight into its editor
	const [createdNote, setCreatedNote] = useState<Note | null>(null)
	// an open note is a medium editor that can expand to fill the screen. a phone starts expanded
	const [isExpanded, setIsExpanded] = useState(() => !isWideScreen())
	const openNote = createdNote ?? note

	const panelRef = useRef<HTMLDivElement>(null)

	// the open note's size: medium by default, the full screen when expanded
	const openNoteClass = isExpanded
		? "flex h-[calc(100dvh-1.5rem)] max-h-none w-[calc(100vw-1.5rem)] max-w-none flex-col sm:h-[calc(100dvh-3rem)] sm:w-[calc(100vw-3rem)]"
		: "flex h-[80dvh] w-[calc(100vw-1.5rem)] max-w-3xl flex-col"
	return (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent
				ref={panelRef}
				// the create flow keeps the standard small dialog. an open note takes the editor size above.
				// the panel holds focus without being a control, so it draws no ring
				className={cn("outline-hidden", openNote && openNoteClass)}
				// an open note renders its own expand and close controls and hides the default close
				hideCloseButton={Boolean(openNote)}
				onOpenAutoFocus={(event) => {
					// focus the panel instead of the note name, which would take the caret
					event.preventDefault()
					panelRef.current?.focus()
				}}
			>
				{openNote ? (
					<OpenNote
						note={openNote}
						pageName={pageName}
						creatableVisibilities={creatableVisibilities}
						isExpanded={isExpanded}
						onToggleExpand={() => setIsExpanded((wasExpanded) => !wasExpanded)}
						onChanged={onChanged}
						onClose={onClose}
					/>
				) : (
					<CreateNote
						page={page}
						creatableVisibilities={creatableVisibilities}
						onCreated={(created) => {
							setCreatedNote(created)
							onChanged()
						}}
					/>
				)}
			</DialogContent>
		</Dialog>
	)
}

// the foot of the note dialog: where the note stands, then the delete. edit rights and delete rights are separate,
// so an editor who may not delete still sees the status, and a reader who may not edit sees none
function NoteFooter({
	canEdit,
	canDelete,
	noteSaveStatus,
	onDelete,
}: {
	canEdit: boolean
	canDelete: boolean
	noteSaveStatus: NoteSaveStatus
	onDelete: () => void
}) {
	if (!canEdit && !canDelete) {
		return null
	}
	return (
		<div className="flex items-center justify-end gap-4">
			{canEdit && (
				<p className="text-sm font-medium" aria-live="polite">
					{SAVE_STATUS_LABELS[noteSaveStatus]}
				</p>
			)}
			{canDelete && (
				<Button variant="destructive" onClick={onDelete}>
					Delete
				</Button>
			)}
		</div>
	)
}

// an open note: the header row, the body as an editor or a reader, and the footer
function OpenNote({
	note,
	pageName,
	creatableVisibilities,
	isExpanded,
	onToggleExpand,
	onChanged,
	onClose,
}: {
	note: Note
	pageName: string
	creatableVisibilities: NoteVisibility[]
	// whether the dialog fills the screen, and the toggle that sets it
	isExpanded: boolean
	onToggleExpand: () => void
	onChanged: () => void
	onClose: () => void
}) {
	// the dialog's own copy of the mutable header fields
	const [name, setName] = useState(note.name)
	// where the note stands. it opens saved, since everything already in it is on the server
	const [noteSaveStatus, setNoteSaveStatus] = useState<NoteSaveStatus>("saved")
	const [noteVisibility, setNoteVisibility] = useState<NoteVisibility>(note.visibility)
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

	// the comment thread: loaded as the note opens, a column open by default on a wide screen, a sheet a phone opens on
	// demand
	const noteCommentThread = useNoteComments(note.id)
	const [isCommentsOpen, setIsCommentsOpen] = useState(() => isWideScreen())

	// opening a note is what clears its badges. the store clears them at once, and the mark holds until the poll agrees
	useEffect(() => {
		markNoteOpened(note.id)
		void sendNoteRead(note.id)
	}, [note.id])

	// the body's chunk starts loading at once, beside the note fetch, instead of after it
	useEffect(() => {
		void (note.canEdit ? loadNoteEditor() : loadNoteStatic())
	}, [note.canEdit])

	// every open fetches the stored body and the version a save names. null until it arrives, false if it never does
	const [openedNote, setOpenedNote] = useState<NoteResponse | null | false>(null)
	useEffect(() => {
		let isCurrent = true
		void fetchNote(note.id).then((response) => {
			if (isCurrent) {
				setOpenedNote(response ?? false)
			}
		})
		return () => {
			isCurrent = false
		}
	}, [note.id])

	// a rename saves on blur
	async function handleRenameNote() {
		const trimmedName = name.trim()
		if (trimmedName.length === 0 || trimmedName === note.name) {
			setName(note.name)
			return
		}
		const isSaved = await updateNote(note.id, { name: trimmedName })
		if (!isSaved) {
			toast.error("That name didn't stick. Carl suggests trying again.")
			setName(note.name)
			return
		}
		onChanged()
	}

	// a visibility change is the owner's alone
	async function handleNoteVisibilityChange(visibility: NoteVisibility) {
		setNoteVisibility(visibility)
		const isSaved = await updateNote(note.id, { visibility: visibility })
		if (!isSaved) {
			toast.error("That visibility didn't take. Carl suggests trying again.")
			setNoteVisibility(note.visibility)
			return
		}
		onChanged()
	}

	// deleting removes the note and its comments
	async function handleDeleteNote() {
		const isNoteDeleted = await deleteNote(note.id)
		if (!isNoteDeleted) {
			toast.error("Carl couldn't toss that note. Try again in a moment.")
			return
		}
		onChanged()
		onClose()
	}

	// a save error shows as a toast. a failed save retries on the next change, a body too long to keep needs a copy
	function handleSaveNoteError(reason: NoteSaveErrorReason) {
		if (reason === "tooLarge") {
			toast.error("That note is too long to save. Copy your latest changes, then shorten it.")
			return
		}
		toast.error("That note didn't save. Carl kept your words — try again in a moment.")
	}

	return (
		<>
			{/* the owner's visibility select on the left, the expand and close controls grouped on the right */}
			<div className="flex min-h-9 items-center justify-between gap-2">
				{note.isNoteOwner ? (
					<NoteVisibilitySelect
						visibilities={creatableVisibilities}
						visibility={noteVisibility}
						onNoteVisibilityChange={handleNoteVisibilityChange}
					/>
				) : (
					<span />
				)}
				{/* the dialog's own controls, the toolbar's buttons. the comments toggle takes the pressed fill while the
					thread shows, and the expand toggle only shows on a wide screen, since a phone is always full screen */}
				<div className="flex items-center gap-0.5">
					<ToolbarButton
						label={isCommentsOpen ? "Hide comments" : "Show comments"}
						Icon={MessageSquareText}
						isPressed={isCommentsOpen}
						className="text-muted-foreground"
						onClick={() => setIsCommentsOpen((wasOpen) => !wasOpen)}
					/>
					<ToolbarButton
						label={isExpanded ? "Collapse" : "Expand"}
						Icon={isExpanded ? Minimize2 : Maximize2}
						className="text-muted-foreground hidden sm:inline-flex"
						onClick={onToggleExpand}
					/>
					<ToolbarButton label="Close" Icon={X} className="text-muted-foreground" onClick={onClose} />
				</div>
			</div>
			{/* the note name on its own centered row. the pencil shows the name is editable and hides while it is being edited */}
			{note.canEdit ? (
				<div className="group relative">
					{/* the name reads as a title at rest, with no field fill in either mode, and takes the ghost hover fill
						while hovered or being edited */}
					<Input
						value={name}
						onChange={(event) => setName(event.target.value)}
						onBlur={() => void handleRenameNote()}
						aria-label="Note name"
						maxLength={NOTE_NAME_MAX_CHARS}
						className="hover:bg-accent focus-visible:bg-accent dark:hover:bg-accent/50 dark:focus-visible:bg-accent/50 h-auto border-none px-8 text-center font-display text-2xl shadow-none focus-visible:ring-0 md:text-2xl dark:bg-transparent"
					/>
					<Pencil className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 group-focus-within:hidden" />
				</div>
			) : (
				<DialogTitle className="truncate text-center font-display text-2xl font-normal">{name}</DialogTitle>
			)}
			{/* the name slot stays present for the screen reader when the name renders as an input */}
			{note.canEdit && <DialogTitle className="sr-only">{name}</DialogTitle>}
			<DialogDescription className="sr-only">{VISIBILITY_TOOLTIPS[noteVisibility]}</DialogDescription>

			{/* the body: the editor on the stored body with edit access, the body rendered as is without. edits save on
				their own a moment after typing stops */}
			<div className="min-h-0 flex-1 overflow-hidden">
				{openedNote === false && (
					<p className="text-destructive py-2 text-sm">{"Carl couldn't open that note. Try again in a moment."}</p>
				)}
				{openedNote === null && LOADING_LINE}
				{openedNote && (
					<Suspense fallback={LOADING_LINE}>
						{note.canEdit ? (
							<NoteEditor
								note={openedNote}
								pageName={pageName}
								noteCommentThread={noteCommentThread}
								isCommentsOpen={isCommentsOpen}
								onSaveError={handleSaveNoteError}
								onSaveStatus={setNoteSaveStatus}
							/>
						) : (
							<NoteStatic note={openedNote} noteCommentThread={noteCommentThread} isCommentsOpen={isCommentsOpen} />
						)}
					</Suspense>
				)}
			</div>

			<NoteFooter
				canEdit={note.canEdit}
				canDelete={note.canDelete}
				noteSaveStatus={noteSaveStatus}
				onDelete={() => setIsConfirmingDelete(true)}
			/>

			{/* the delete confirmation */}
			{isConfirmingDelete && (
				<ConfirmDialog
					title="Delete this note?"
					confirmLabel="Delete note"
					cancelLabel="Keep it"
					onConfirm={handleDeleteNote}
					onClose={() => setIsConfirmingDelete(false)}
				>
					{`"${note.name}" and its comments go in the bin. Carl can't fish them back out.`}
				</ConfirmDialog>
			)}
		</>
	)
}
