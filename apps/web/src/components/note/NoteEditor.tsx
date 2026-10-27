import {
	type NoteEditorElements,
	type NoteEditorInputProps,
	type NoteEditorProps,
	NoteEditor as SharedNoteEditor,
} from "@carlnotes/core/components/NoteEditor"
import type { RefObject } from "react"
import type { EnrichedTextInputInstance } from "react-native-enriched-html"
import { EnrichedTextInput } from "react-native-enriched-html"
import { toast } from "sonner"
import { NoteConflictNotice } from "./NoteConflictNotice"
import { NoteLayout } from "./NoteLayout"
import { NoteToolbar } from "./NoteToolbar"
import { NOTE_BODY_CLASS, NOTE_BODY_STYLE, NOTE_HTML_STYLE, NOTE_PLACEHOLDER_COLOR } from "./noteStyle"

// keep platform elements stable so typing never remounts the editor
const ELEMENTS: NoteEditorElements = {
	Layout: NoteLayout,
	Input: NoteInput,
	Toolbar: NoteToolbar,
	ConflictNotice: NoteConflictNotice,
}

/**
 * Adapts the shared note editor to browser input and toast feedback.
 */
export function NoteEditor(props: Omit<NoteEditorProps, "onError">) {
	return <SharedNoteEditor {...props} onError={toast.error} elements={ELEMENTS} />
}

// normalize library events at the platform boundary
function NoteInput({
	editorRef,
	defaultValue,
	placeholder,
	onChangeHtml,
	onChangeState,
	onChangeSelection,
	onLinkDetected,
}: NoteEditorInputProps) {
	return (
		<div className={NOTE_BODY_CLASS} style={NOTE_BODY_STYLE}>
			<EnrichedTextInput
				ref={editorRef as RefObject<EnrichedTextInputInstance | null>}
				defaultValue={defaultValue}
				placeholder={placeholder}
				placeholderTextColor={NOTE_PLACEHOLDER_COLOR}
				htmlStyle={NOTE_HTML_STYLE}
				scrollEnabled={false}
				onChangeHtml={(event) => onChangeHtml(event.nativeEvent.value)}
				onChangeState={(event) => onChangeState(event.nativeEvent)}
				onChangeSelection={(event) => onChangeSelection(event.nativeEvent)}
				onLinkDetected={onLinkDetected}
			/>
		</div>
	)
}
