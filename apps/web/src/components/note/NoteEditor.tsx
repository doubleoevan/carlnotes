// the note editor: the shared editor over the note's stored body, the toolbar lit from its state, the debounced save
// with its conflict notice, and the comment thread beside it. this module runs in the browser alone
import { fetchNote } from "@carlnotes/client/noteClient"
import type { NoteResponse } from "@carlnotes/contracts/notes"
import {
	EMPTY_EDITOR_HTML,
	type NoteSaveErrorReason,
	type NoteSaveStatus,
	useNoteBodySave,
} from "@carlnotes/core/hooks/useNoteBodySave"
import type { NoteCommentThread } from "@carlnotes/core/hooks/useNoteComments"
import { cn } from "@carlnotes/nightshift/classNames"
import { type ComponentProps, type PointerEvent, useCallback, useEffect, useRef, useState } from "react"
import {
	EnrichedTextInput,
	type EnrichedTextInputInstance,
	type OnChangeSelectionEvent,
	type OnChangeStateEvent,
	type OnLinkDetected,
} from "react-native-enriched-html"
import { toast } from "sonner"
import { NoteConflictNotice } from "./NoteConflictNotice"
import { NoteLayout } from "./NoteLayout"
import { NoteToolbar } from "./NoteToolbar"
import { NOTE_BODY_CLASS, NOTE_HTML_STYLE, NOTE_PLACEHOLDER_COLOR } from "./noteStyle"

// the selection before the editor reports one
const EMPTY_SELECTION: OnChangeSelectionEvent = { start: 0, end: 0, text: "" }

// the editor's props, for the handlers' types
type EditorProps = ComponentProps<typeof EnrichedTextInput>

/**
 * The always-editable note for a user with edit access, open on the stored body. Typing saves a moment after it stops,
 * and closing the dialog sends what is still waiting.
 */
export function NoteEditor({
	note,
	pageName,
	noteCommentThread,
	isCommentsOpen,
	onSaveStatus,
	onSaveError,
}: {
	note: NoteResponse
	// the topic or team the note belongs to, named in the empty note's placeholder
	pageName: string
	// the thread the dialog loaded as the note opened
	noteCommentThread: NoteCommentThread
	// whether the comment thread shows beside the note or over it
	isCommentsOpen: boolean
	onSaveStatus: (status: NoteSaveStatus) => void
	onSaveError: (reason: NoteSaveErrorReason) => void
}) {
	// the editor, and what it last reported: its style state, its selection, and the link the caret moved onto
	const editorRef = useRef<EnrichedTextInputInstance>(null)
	const [formatState, setFormatState] = useState<OnChangeStateEvent | null>(null)
	const [selection, setSelection] = useState<OnChangeSelectionEvent>(EMPTY_SELECTION)
	const [activeLink, setActiveLink] = useState<OnLinkDetected | null>(null)

	// whether the reload after a conflict is on its way
	const [isReloading, setIsReloading] = useState(false)

	// the save schedule, opened on the stored body and version, with its status reported to the dialog's footer
	const noteBodySave = useNoteBodySave({ noteId: note.id, html: note.html, version: note.version, onSaveError })
	const { scheduleSave, setSavedHtml } = noteBodySave
	useEffect(() => onSaveStatus(noteBodySave.status), [noteBodySave.status, onSaveStatus])

	// the saved baseline is the editor's own rendering of the stored body, taken from its first report of that body.
	// every report after it is a change. before it loads a body the editor reports the empty document once, which is no
	// baseline for a note that has one
	const baselineRef = useRef({ isTaken: false, hasBody: note.html !== "" })
	const handleChangeHtml = useCallback<NonNullable<EditorProps["onChangeHtml"]>>(
		(event) => {
			const html = event.nativeEvent.value
			const baseline = baselineRef.current
			if (baseline.isTaken) {
				scheduleSave(html)
				return
			}
			if (baseline.hasBody && html === EMPTY_EDITOR_HTML) {
				return
			}
			baseline.isTaken = true
			setSavedHtml(html)
		},
		[scheduleSave, setSavedHtml],
	)

	// the editor's state and selection reports, stable so the editor's own subscriptions survive a re-render
	const handleChangeState = useCallback<NonNullable<EditorProps["onChangeState"]>>(
		(event) => setFormatState(event.nativeEvent),
		[],
	)
	const handleChangeSelection = useCallback<NonNullable<EditorProps["onChangeSelection"]>>(
		(event) => setSelection(event.nativeEvent),
		[],
	)

	// the reload after a conflict: the stored body replaces the editor's, and saving resumes at the stored version. the
	// conflict resolves first, so the editor's report of the reloaded body is the new baseline
	async function handleReload(): Promise<void> {
		setIsReloading(true)
		const storedNote = await fetchNote(note.id)
		setIsReloading(false)
		if (!storedNote) {
			toast.error("Carl couldn't reload that note. Try again in a moment.")
			return
		}
		noteBodySave.resolveConflict(storedNote.html, storedNote.version)
		baselineRef.current = { isTaken: false, hasBody: storedNote.html !== "" }
		editorRef.current?.setValue(storedNote.html)
	}

	// a press on the page card below the text focuses the editor, which takes a press inside its own box alone
	function handleCardPointerDown(event: PointerEvent<HTMLDivElement>): void {
		if (!(event.target as HTMLElement).closest(".eti-editor")) {
			editorRef.current?.focus()
		}
	}

	return (
		<div className="relative flex h-full flex-col">
			{/* the formatting controls across the top, hidden on a phone while the comments sheet covers the note */}
			<div className={cn("pb-4", isCommentsOpen && "hidden sm:block")}>
				<NoteToolbar editorRef={editorRef} formatState={formatState} selection={selection} activeLink={activeLink} />
			</div>

			{/* the notice a lost save leaves, until the reload */}
			{noteBodySave.conflict && (
				<NoteConflictNotice
					lastEditorUsername={noteBodySave.conflict.lastEditorUsername}
					isReloading={isReloading}
					onReload={() => void handleReload()}
				/>
			)}

			{/* the editor on the page card, growing with its content inside the scrolling layout */}
			<NoteLayout
				noteCommentThread={noteCommentThread}
				canComment
				isCommentsOpen={isCommentsOpen}
				onCardPointerDown={handleCardPointerDown}
			>
				<div className={NOTE_BODY_CLASS}>
					<EnrichedTextInput
						ref={editorRef}
						defaultValue={note.html}
						placeholder={`TODO: a note about ${pageName}`}
						placeholderTextColor={NOTE_PLACEHOLDER_COLOR}
						htmlStyle={NOTE_HTML_STYLE}
						scrollEnabled={false}
						onChangeHtml={handleChangeHtml}
						onChangeState={handleChangeState}
						onChangeSelection={handleChangeSelection}
						onLinkDetected={setActiveLink}
					/>
				</div>
			</NoteLayout>
		</div>
	)
}
