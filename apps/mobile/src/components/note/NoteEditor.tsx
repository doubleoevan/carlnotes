import { showClientError } from "@carlnotes/client/apiClient"
import {
	type NoteEditorElements,
	type NoteEditorInputProps,
	type NoteEditorProps,
	NoteEditor as SharedNoteEditor,
} from "@carlnotes/core/components/NoteEditor"
import type { RefObject } from "react"
import { EnrichedTextInput, type EnrichedTextInputInstance } from "react-native-enriched-html"
import { NoteConflictNotice } from "./NoteConflictNotice"
import { NoteLayout, useNoteEditorHeight } from "./NoteLayout"
import { NoteToolbar } from "./NoteToolbar"
import { useNoteStyle } from "./noteStyle"

// retain the library instance and current selection across shared state updates
const ELEMENTS: NoteEditorElements = {
	Layout: NoteLayout,
	Input: NoteInput,
	Toolbar: NoteToolbar,
	ConflictNotice: NoteConflictNotice,
}

/**
 * Adapts the shared web editor lifecycle to the same library's native input.
 */
export function NoteEditor(props: Omit<NoteEditorProps, "onError">) {
	return <SharedNoteEditor {...props} onError={showClientError} elements={ELEMENTS} />
}

// normalize native events and leave the bounded input responsible for caret scrolling
function NoteInput({
	editorRef,
	defaultValue,
	placeholder,
	onChangeHtml,
	onChangeState,
	onChangeSelection,
	onLinkDetected,
}: NoteEditorInputProps) {
	const noteStyle = useNoteStyle()
	const height = useNoteEditorHeight()
	return (
		<EnrichedTextInput
			ref={editorRef as RefObject<EnrichedTextInputInstance | null>}
			defaultValue={defaultValue}
			placeholder={placeholder}
			accessibilityLabel="Note body"
			allowFontScaling
			style={{ ...noteStyle.bodyStyle, height }}
			htmlStyle={noteStyle.htmlStyle}
			placeholderTextColor={noteStyle.placeholderColor}
			scrollEnabled
			onChangeHtml={(event) => onChangeHtml(event.nativeEvent.value)}
			onChangeState={(event) => onChangeState(event.nativeEvent)}
			onChangeSelection={(event) => onChangeSelection(event.nativeEvent)}
			onLinkDetected={onLinkDetected}
		/>
	)
}
