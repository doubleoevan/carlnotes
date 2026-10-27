// the note dialog, which creates a note or opens one. a user who can edit gets the editor on the stored body, and a
// read-only open gets the body rendered as is, both with the comment thread beside it

import { authClient } from "@carlnotes/client/authClient"
import { fetchNote, type NotePageRef } from "@carlnotes/client/noteClient"
import { NOTE_NAME_MAX_CHARS, type Note, type NoteResponse } from "@carlnotes/contracts/notes"
import { useNoteRead } from "@carlnotes/core/hooks/useNoteBadges"
import type { NoteSaveErrorReason, NoteSaveStatus } from "@carlnotes/core/hooks/useNoteBodySave"
import { useNoteComments } from "@carlnotes/core/hooks/useNoteComments"
import { useNoteManagement } from "@carlnotes/core/hooks/useNoteManagement"
import {
	NOTE_DELETE,
	NOTE_LABELS,
	NOTE_SAVE_ERRORS,
	NOTE_SAVE_STATUS_LABELS,
	toNoteDeleteDescription,
} from "@carlnotes/core/lib/noteLabels"
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
const LOADING_LINE = <p className="text-muted-foreground py-2 text-sm">{NOTE_LABELS.loading}</p>

// how the dialog words each save status. the toast carries the reason, so these stay the plain fact
const SAVE_STATUS_LABELS = NOTE_SAVE_STATUS_LABELS

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
	// where the note stands. it opens saved, since everything already in it is on the server
	const [noteSaveStatus, setNoteSaveStatus] = useState<NoteSaveStatus>("saved")
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

	// the comment thread: loaded as the note opens, a column open by default on a wide screen, a sheet a phone opens on
	// demand
	const noteCommentThread = useNoteComments(note.id)
	const [isCommentsOpen, setIsCommentsOpen] = useState(() => isWideScreen())

	// the body's chunk starts loading at once, beside the note fetch, instead of after it
	useEffect(() => {
		void (note.canEdit ? loadNoteEditor() : loadNoteStatic())
	}, [note.canEdit])

	// every open fetches the stored body and the version a save names. null until it arrives, false if it never does
	const [openedNote, setOpenedNote] = useState<NoteResponse | null | false>(null)
	const { data: session } = authClient().useSession()
	useNoteRead(openedNote ? openedNote.id : null, session?.user.id)
	const permissions = openedNote || null
	const canEdit = Boolean(permissions?.canEdit)
	const canDelete = Boolean(permissions?.canDelete)
	const isNoteOwner = Boolean(permissions?.isNoteOwner)
	useEffect(() => {
		let isCurrent = true
		void fetchNote(note.id)
			.then((response) => {
				if (isCurrent) {
					setOpenedNote(response ?? false)
				}
			})
			.catch(() => {
				if (isCurrent) {
					setOpenedNote(false)
				}
			})
		return () => {
			isCurrent = false
		}
	}, [note.id])

	// share metadata writes while the dialog owns confirmation and close behavior
	const {
		name,
		setName,
		savedName,
		visibility: noteVisibility,
		isPending,
		rename,
		changeVisibility,
		remove,
	} = useNoteManagement({
		note: { ...note, canEdit, canDelete, isNoteOwner },
		onChanged,
		onDeleted: () => {
			onChanged()
			onClose()
		},
		onError: (message) => toast.error(message),
	})

	// a save error shows as a toast. a failed save retries on the next change, a body too long to keep needs a copy
	function handleSaveNoteError(reason: NoteSaveErrorReason) {
		toast.error(NOTE_SAVE_ERRORS[reason])
	}

	return (
		<>
			{/* the owner's visibility select on the left, the expand and close controls grouped on the right */}
			<div className="flex min-h-9 items-center justify-between gap-2">
				{isNoteOwner ? (
					<NoteVisibilitySelect
						visibilities={creatableVisibilities}
						visibility={noteVisibility}
						onNoteVisibilityChange={changeVisibility}
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
			{canEdit ? (
				<div className="group relative">
					{/* the name reads as a title at rest, with no field fill in either mode, and takes the ghost hover fill
						while hovered or being edited */}
					<Input
						value={name}
						onChange={(event) => setName(event.target.value)}
						onBlur={() => void rename()}
						aria-label="Note name"
						maxLength={NOTE_NAME_MAX_CHARS}
						disabled={isPending}
						className="hover:bg-accent focus-visible:bg-accent dark:hover:bg-accent/50 dark:focus-visible:bg-accent/50 h-auto border-none px-8 text-center font-display text-2xl shadow-none focus-visible:ring-0 md:text-2xl bg-transparent"
					/>
					<Pencil className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 group-focus-within:hidden" />
				</div>
			) : (
				<DialogTitle className="truncate text-center font-display text-2xl font-normal">{name}</DialogTitle>
			)}
			{/* the name slot stays present for the screen reader when the name renders as an input */}
			{canEdit && <DialogTitle className="sr-only">{name}</DialogTitle>}
			<DialogDescription className="sr-only">{VISIBILITY_TOOLTIPS[noteVisibility]}</DialogDescription>

			{/* the body: the editor on the stored body with edit access, the body rendered as is without. edits save on
				their own a moment after typing stops */}
			<div className="min-h-0 flex-1 overflow-hidden">
				{openedNote === false && <p className="text-destructive py-2 text-sm">{NOTE_LABELS.openError}</p>}
				{openedNote === null && LOADING_LINE}
				{openedNote && (
					<Suspense fallback={LOADING_LINE}>
						{openedNote.canEdit ? (
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
				canEdit={canEdit}
				canDelete={canDelete}
				noteSaveStatus={noteSaveStatus}
				onDelete={() => setIsConfirmingDelete(true)}
			/>

			{/* the delete confirmation */}
			{isConfirmingDelete && (
				<ConfirmDialog
					title={NOTE_DELETE.title}
					confirmLabel={NOTE_DELETE.confirmLabel}
					cancelLabel={NOTE_DELETE.cancelLabel}
					onConfirm={remove}
					onClose={() => setIsConfirmingDelete(false)}
				>
					{toNoteDeleteDescription(savedName)}
				</ConfirmDialog>
			)}
		</>
	)
}
