import { fetchNote, NoteReadError } from "@carlnotes/client/noteClient"
import type { NoteResponse } from "@carlnotes/contracts/notes"
import { type ComponentType, type ReactNode, useEffect, useRef, useState } from "react"
import {
	type NoteBodySave,
	type NoteSaveErrorReason,
	type NoteSaveStatus,
	useNoteBodySave,
} from "../hooks/useNoteBodySave"
import type { NoteCommentThread } from "../hooks/useNoteComments"
import { type RichTextEditorInputProps, useRichTextEditor } from "../hooks/useRichTextEditor"
import { NOTE_LABELS } from "../lib/noteLabels"
import type { NoteConflictNoticeProps } from "./NoteConflictNotice"
import type { NoteToolbarProps } from "./NoteToolbar"
import type { NoteLayoutProps } from "./NoteViewer"

// the shared editor state and the platform elements that display it
export type NoteEditorProps = {
	header?: ReactNode
	note: NoteResponse
	pageName: string
	noteCommentThread: NoteCommentThread
	isCommentsOpen: boolean
	onCloseComments?: () => void
	onSaveStatus: (status: NoteSaveStatus) => void
	onSaveError: (reason: NoteSaveErrorReason) => void
	onError: (message: string) => void
	controller?: NoteBodySave
}
export type NoteEditorInputProps = RichTextEditorInputProps
export type NoteEditorElements = {
	Layout: ComponentType<NoteLayoutProps>
	Input: ComponentType<RichTextEditorInputProps>
	Toolbar: ComponentType<NoteToolbarProps>
	ConflictNotice: ComponentType<NoteConflictNoticeProps>
}

/**
 * Shares editor normalization, formatting state, autosave and conflict recovery without a platform dependency.
 */
export function NoteEditor({
	note,
	header,
	pageName,
	noteCommentThread,
	isCommentsOpen,
	onCloseComments,
	onSaveStatus,
	onSaveError,
	onError,
	controller,
	elements: { Layout, Input, Toolbar, ConflictNotice },
}: NoteEditorProps & { elements: NoteEditorElements }) {
	// retain the restored draft and stable event handlers for the editor's lifetime
	const [initialHtml] = useState(() => controller?.getDraft().html ?? note.html)
	const [isReloading, setIsReloading] = useState(false)
	const isReloadingRef = useRef(false)
	const isMountedRef = useRef(true)
	const noteBodySave = useNoteBodySave({
		noteId: note.id,
		html: note.html,
		version: note.version,
		onSaveError,
		controller,
	})
	const { scheduleSave, setSavedHtml } = noteBodySave
	useEffect(() => onSaveStatus(noteBodySave.status), [noteBodySave.status, onSaveStatus])
	useEffect(() => {
		isMountedRef.current = true
		return () => {
			isMountedRef.current = false
		}
	}, [])

	// the editor's own rendering of the stored body is the saved one, and each edit after it schedules a save
	const { editorRef, toolbarProps, inputProps, setHtml } = useRichTextEditor({
		initialHtml,
		onBaselineHtml: setSavedHtml,
		onChangeHtml: scheduleSave,
	})

	// replace a draft only after a deliberate reload returns an editable note successfully
	async function handleReload(): Promise<void> {
		if (isReloadingRef.current) {
			return
		}
		isReloadingRef.current = true
		setIsReloading(true)
		try {
			const storedNote = await fetchNote(note.id, { shouldThrowOnError: true })
			if (!isMountedRef.current) {
				return
			}
			if (!storedNote?.canEdit) {
				onSaveError("unavailable")
				return
			}
			noteBodySave.resolveConflict(storedNote.html, storedNote.version)
			setHtml(storedNote.html)
		} catch (error) {
			reportReloadError(error)
		} finally {
			isReloadingRef.current = false
			if (isMountedRef.current) {
				setIsReloading(false)
			}
		}
	}

	// distinguish an ended session from a recoverable failed read
	function reportReloadError(error: unknown): void {
		if (!isMountedRef.current) {
			return
		}
		if (error instanceof NoteReadError && error.status === 401) {
			onSaveError("unavailable")
		} else {
			onError(NOTE_LABELS.reloadError)
		}
	}
	return (
		<Layout
			header={header}
			noteCommentThread={noteCommentThread}
			canComment
			isCommentsOpen={isCommentsOpen}
			onCloseComments={onCloseComments}
			editorRef={editorRef}
			toolbar={<Toolbar {...toolbarProps} />}
			conflict={
				noteBodySave.conflict ? (
					<ConflictNotice
						lastEditorUsername={noteBodySave.conflict.lastEditorUsername}
						isReloading={isReloading}
						onReload={() => void handleReload()}
					/>
				) : null
			}
		>
			<Input {...inputProps} placeholder={`TODO: a note about ${pageName}`} />
		</Layout>
	)
}
