// the note dialog, which creates a note or opens one. a user who can edit gets the live editor with
// comments, and a read-only open gets the stored HTML
import { NOTE_NAME_MAX_CHARS, type Note } from "@shared/contracts"
import type { noteVisibilities } from "@shared/enums"
import { Maximize2, MessageSquareText, Minimize2, Pencil, X } from "lucide-react"
import { lazy, Suspense, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { createNote, deleteNote, fetchNote, type NotePageRef, sendNoteRead, updateNote } from "@/clients/noteClient"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { Button } from "@/components/primitives/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/primitives/dialog"
import { Input } from "@/components/primitives/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { MENU_BUTTON_HIGHLIGHT_CLASS } from "@/lib/styleClasses"
import { cn, isWideScreen } from "@/lib/utils"
import { markNoteOpened } from "@/stores/noteBadgeStore"
import { NoteStatic } from "./NoteStatic"
import { NoteVisibilitySelect, VISIBILITY_TOOLTIPS } from "./NoteVisibilitySelect"

// the editor and the blocknote bundle load only when a note opens for a user who can edit
const NoteEditor = lazy(() => import("./NoteEditor"))

type NoteVisibility = (typeof noteVisibilities)[number]

/**
 * One note's dialog, or the create flow when no note is given. Closing it ends any live connection.
 */
export function NoteDialog({
	page,
	pageName,
	creatableVisibilities,
	mentionableUsernames,
	note,
	onClose,
	onChanged,
}: {
	page: NotePageRef
	// the topic or team the note belongs to, named in the empty note's placeholder
	pageName: string
	creatableVisibilities: NoteVisibility[]
	// who a comment's "@" menu offers, the other members of the note's team
	mentionableUsernames: string[]
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

	// the open note's size: medium by default, the full screen when expanded
	const openNoteClass = isExpanded
		? "flex h-[calc(100dvh-1.5rem)] max-h-none w-[calc(100vw-1.5rem)] max-w-none flex-col sm:h-[calc(100dvh-3rem)] sm:w-[calc(100vw-3rem)]"
		: "flex h-[80dvh] w-[calc(100vw-1.5rem)] max-w-3xl flex-col"
	return (
		<Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
			<DialogContent
				// the create flow keeps the standard small dialog. an open note takes the editor size above
				className={openNote ? openNoteClass : undefined}
				// an open note renders its own expand and close controls and hides the default close
				hideCloseButton={Boolean(openNote)}
				onOpenAutoFocus={(event) => event.preventDefault()}
			>
				{openNote ? (
					<OpenNote
						note={openNote}
						pageName={pageName}
						creatableVisibilities={creatableVisibilities}
						mentionableUsernames={mentionableUsernames}
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

// the create flow: a name, a visibility the creator may use, and one button
function CreateNote({
	page,
	creatableVisibilities,
	onCreated,
}: {
	page: NotePageRef
	creatableVisibilities: NoteVisibility[]
	onCreated: (note: Note) => void
}) {
	// the name and visibility the create posts. default to team when that visibility is available, otherwise private
	const [name, setName] = useState("")
	const [noteVisibility, setNoteVisibility] = useState<NoteVisibility>(
		creatableVisibilities.includes("team") ? "team" : "private",
	)

	// a wide screen focuses the name on open. a phone waits for a tap.
	// focus on a phone pops the keyboard over the dialog
	const nameInputRef = useRef<HTMLInputElement>(null)
	useEffect(() => {
		if (isWideScreen()) {
			nameInputRef.current?.focus()
		}
	}, [])

	// the create itself, rejected server-side outside the creatable visibilities
	async function handleCreate() {
		const created = await createNote(page, name.trim(), noteVisibility)
		if (!created) {
			toast.error("Carl couldn't start that note. Try again in a moment.")
			return
		}
		onCreated(created)
	}

	return (
		<>
			<DialogTitle>New note</DialogTitle>

			{/* the name, then the visibility with its meaning on the same row */}
			<div className="space-y-3">
				<Input
					ref={nameInputRef}
					value={name}
					onChange={(event) => setName(event.target.value)}
					placeholder="Name your note"
					aria-label="Note name"
					maxLength={NOTE_NAME_MAX_CHARS}
				/>
				<div className="flex items-center gap-3">
					<NoteVisibilitySelect
						visibilities={creatableVisibilities}
						visibility={noteVisibility}
						onNoteVisibilityChange={setNoteVisibility}
					/>
					<DialogDescription className="text-sm">{VISIBILITY_TOOLTIPS[noteVisibility]}</DialogDescription>
				</div>
			</div>

			{/* the action, bottom-right */}
			<div className="flex justify-end">
				<Button onClick={() => void handleCreate()} disabled={name.trim().length === 0}>
					Add note
				</Button>
			</div>
		</>
	)
}

// an open note: the header row, the always-editable body, and the delete action
function OpenNote({
	note,
	pageName,
	creatableVisibilities,
	mentionableUsernames,
	isExpanded,
	onToggleExpand,
	onChanged,
	onClose,
}: {
	note: Note
	pageName: string
	creatableVisibilities: NoteVisibility[]
	mentionableUsernames: string[]
	// whether the dialog fills the screen, and the toggle that sets it
	isExpanded: boolean
	onToggleExpand: () => void
	onChanged: () => void
	onClose: () => void
}) {
	// the dialog's own copy of the mutable header fields
	const [name, setName] = useState(note.name)
	const [noteVisibility, setNoteVisibility] = useState<NoteVisibility>(note.visibility)
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)

	// the comment threads panel: a sidebar open by default on a wide screen, a sheet a phone opens on demand
	const [isThreadsOpen, setIsThreadsOpen] = useState(() => isWideScreen())

	// opening a note is what clears its badges. the store clears them at once, and the mark holds until the poll agrees
	useEffect(() => {
		markNoteOpened(note.id)
		void sendNoteRead(note.id)
	}, [note.id])

	// a read-only open needs the stored note, fetched once
	const [staticHtml, setStaticHtml] = useState<string | null>(null)
	useEffect(() => {
		if (note.canEdit) {
			return
		}
		let isCurrent = true
		void fetchNote(note.id).then((response) => {
			if (isCurrent) {
				setStaticHtml(response?.html ?? null)
			}
		})
		return () => {
			isCurrent = false
		}
	}, [note.id, note.canEdit])

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

	// deleting removes the note, its threads, and its comments
	async function handleDeleteNote() {
		const isNoteDeleted = await deleteNote(note.id)
		if (!isNoteDeleted) {
			toast.error("Carl couldn't toss that note. Try again in a moment.")
			return
		}
		onChanged()
		onClose()
	}

	// an unsaved edit shows once as a toast. the sync provider keeps the content and retries
	function handleSaveNoteError() {
		toast.error("That note didn't save. Carl kept your words — try again in a moment.")
	}

	return (
		<>
			{/* the owner's visibility select on the left, the expand and close controls grouped on the right */}
			<div className="flex min-h-9 items-center justify-between gap-2">
				{note.isOwner ? (
					<NoteVisibilitySelect
						visibilities={creatableVisibilities}
						visibility={noteVisibility}
						onNoteVisibilityChange={handleNoteVisibilityChange}
					/>
				) : (
					<span />
				)}
				<div className="flex items-center gap-0.5">
					{note.canEdit && (
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label={isThreadsOpen ? "Hide comments" : "Show comments"}
									aria-pressed={isThreadsOpen}
									onClick={() => setIsThreadsOpen((wasOpen) => !wasOpen)}
									// the closed comments button is a plain glyph like the close beside it.
									// the opened comments takes the standard highlight treatment
									className={cn(
										"text-muted-foreground hover:text-foreground grid size-8 shrink-0 place-items-center rounded-md",
										isThreadsOpen && `${MENU_BUTTON_HIGHLIGHT_CLASS} shadow-lift`,
									)}
								>
									<MessageSquareText className="size-4" />
								</button>
							</TooltipTrigger>
							<TooltipContent>{isThreadsOpen ? "Hide comments" : "Show comments"}</TooltipContent>
						</Tooltip>
					)}
					{/* the expand toggle only shows on a wide screen. a phone is always full screen */}
					<button
						type="button"
						aria-label={isExpanded ? "Collapse" : "Expand"}
						onClick={onToggleExpand}
						className="text-muted-foreground hover:text-foreground hidden size-8 shrink-0 place-items-center rounded-md sm:grid"
					>
						{isExpanded ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
					</button>
					<button
						type="button"
						aria-label="Close"
						onClick={onClose}
						className="text-muted-foreground hover:text-foreground grid size-8 shrink-0 place-items-center rounded-md"
					>
						<X className="size-4" />
					</button>
				</div>
			</div>
			{/* the note name on its own centered row. the pencil shows the name is editable and hides while it is being edited */}
			{note.canEdit ? (
				<div className="group relative">
					<Input
						value={name}
						onChange={(event) => setName(event.target.value)}
						onBlur={() => void handleRenameNote()}
						aria-label="Note name"
						maxLength={NOTE_NAME_MAX_CHARS}
						className="h-auto border-none px-8 text-center font-display text-2xl shadow-none focus-visible:ring-0 md:text-2xl"
					/>
					<Pencil className="text-muted-foreground pointer-events-none absolute top-1/2 right-2 size-4 -translate-y-1/2 group-focus-within:hidden" />
				</div>
			) : (
				<DialogTitle className="truncate text-center font-display text-2xl font-normal">{name}</DialogTitle>
			)}
			{/* the name slot stays present for the screen reader when the name renders as an input */}
			{note.canEdit && <DialogTitle className="sr-only">{name}</DialogTitle>}
			<DialogDescription className="sr-only">{VISIBILITY_TOOLTIPS[noteVisibility]}</DialogDescription>

			{/* the body: the always-editable editor with edit access, the stored HTML without. edits auto-save */}
			<div className="min-h-0 flex-1 overflow-hidden">
				{note.canEdit ? (
					<Suspense fallback={<p className="text-muted-foreground py-2 text-sm">{"Unfolding the note…"}</p>}>
						<NoteEditor
							noteId={note.id}
							pageName={pageName}
							mentionableUsernames={mentionableUsernames}
							isThreadsOpen={isThreadsOpen}
							onSaveError={handleSaveNoteError}
						/>
					</Suspense>
				) : (
					<div className="h-full overflow-y-auto">{staticHtml && <NoteStatic html={staticHtml} />}</div>
				)}
			</div>

			{/* the owner and an admin may delete, bottom-right, behind a confirmation */}
			{note.canDelete && (
				<div className="flex justify-end">
					<Button variant="destructive" onClick={() => setIsConfirmingDelete(true)}>
						Delete
					</Button>
				</div>
			)}

			{/* the delete confirmation */}
			{isConfirmingDelete && (
				<ConfirmDialog
					title="Delete this note?"
					confirmLabel="Delete note"
					cancelLabel="Keep it"
					onConfirm={() => void handleDeleteNote()}
					onClose={() => setIsConfirmingDelete(false)}
				>
					{`"${note.name}" and its comments go in the bin. Carl can't fish them back out.`}
				</ConfirmDialog>
			)}
		</>
	)
}
