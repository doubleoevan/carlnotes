// the rich text editor's state that a note and a Topic Post share: the editor's ref, its format state, its selection,
// the link at the caret, and the baseline that tells the editor's own rendering of a stored body from an edit
import { type RefObject, useCallback, useRef, useState } from "react"
import type { NoteToolbarProps } from "../components/NoteToolbar"
import type { NoteEditorInstance } from "../components/NoteViewer"
import type { NoteFormatState, NoteLink, NoteSelection } from "../lib/noteFormats"
import { EMPTY_EDITOR_HTML } from "./useNoteBodySave"
import { useStableCallback } from "./useStableCallback"
import type { PickedBodyImage } from "./useTopicPostBodyImageUpload"

// what each app's rich text input takes: the editor's ref, the body it opens with, its placeholder, and its events
export type RichTextEditorInputProps = {
	editorRef: RefObject<NoteEditorInstance | null>
	defaultValue: string
	placeholder: string
	// the body, the format state, the selection, and the link at the caret, as each changes
	onChangeHtml: (html: string) => void
	onChangeState: (state: NoteFormatState) => void
	onChangeSelection: (selection: NoteSelection) => void
	onLinkDetected: (link: NoteLink | null) => void
	// a Topic Post's pasted images. a note's input leaves a paste to the editor
	onPasteImages?: (images: PickedBodyImage[]) => void
}

// the body the editor opens with, the editor's own rendering of it, which is no edit, and each edit after it
type UseRichTextEditorOptions = {
	initialHtml: string
	onBaselineHtml: (html: string) => void
	onChangeHtml: (html: string) => void
}

// the editor's ref, what its toolbar and its input take, and the call that replaces its body
type RichTextEditor = {
	editorRef: RefObject<NoteEditorInstance | null>
	toolbarProps: NoteToolbarProps
	inputProps: Omit<RichTextEditorInputProps, "placeholder">
	setHtml: (html: string) => void
}

/**
 * Holds a rich text editor's format state, selection, and link for its toolbar, and reports the editor's first
 * rendering of the stored body apart from the edits after it.
 */
export function useRichTextEditor({
	initialHtml,
	onBaselineHtml,
	onChangeHtml,
}: UseRichTextEditorOptions): RichTextEditor {
	// the editor and what its toolbar reads
	const editorRef = useRef<NoteEditorInstance>(null)
	const [formatState, setFormatState] = useState<NoteFormatState | null>(null)
	const [selection, setSelection] = useState<NoteSelection>({ start: 0, end: 0, text: "" })
	const [activeLink, setActiveLink] = useState<NoteLink | null>(null)

	// treat the first normalized body as a baseline, skipping the library's preliminary empty document
	const baselineRef = useRef({ isTaken: false, hasBody: initialHtml !== "" })
	const handleBaselineHtml = useStableCallback(onBaselineHtml)
	const handleEditedHtml = useStableCallback(onChangeHtml)
	const handleChangeHtml = useCallback(
		(html: string) => {
			// a change after the baseline is an edit
			const baseline = baselineRef.current
			if (baseline.isTaken) {
				handleEditedHtml(html)
				return
			}

			// the empty document before a stored body loads is no baseline
			if (baseline.hasBody && html === EMPTY_EDITOR_HTML) {
				return
			}
			baseline.isTaken = true
			handleBaselineHtml(html)
		},
		[handleBaselineHtml, handleEditedHtml],
	)

	// replace the body, whose first rendering is a new baseline
	const setHtml = useCallback((html: string) => {
		baselineRef.current = { isTaken: false, hasBody: html !== "" }
		editorRef.current?.setValue(html)
	}, [])

	// the ref, the toolbar's state, and the input's body and handlers
	return {
		editorRef,
		toolbarProps: { editorRef, formatState, selection, activeLink },
		inputProps: {
			editorRef,
			defaultValue: initialHtml,
			onChangeHtml: handleChangeHtml,
			onChangeState: setFormatState,
			onChangeSelection: setSelection,
			onLinkDetected: setActiveLink,
		},
		setHtml,
	}
}
