// a Topic Post's alignment buttons: one set for the paragraphs at the caret and for a selected image, which sits at the
// left or the right with the text beside it, or centered
import { isTopicPostAlign, type TopicPostAlign } from "@carlnotes/contracts/topicPostBodyImages"
import type { NoteEditorCommands, NoteFormatState } from "./noteFormats"

// the alignment buttons in their order, each with its label
export const TOPIC_POST_ALIGN_OPTIONS: { align: TopicPostAlign; label: string }[] = [
	{ align: "left", label: "Align left" },
	{ align: "center", label: "Align center" },
	{ align: "right", label: "Align right" },
]

/**
 * Returns the alignment the buttons show as active: a selected image's alignment, or the paragraphs' alignment at the
 * caret. An image on its own line and a paragraph in the text's own direction show none.
 */
export function toActiveTopicPostAlign(formatState: NoteFormatState | null): TopicPostAlign | null {
	// a selected image shows its own alignment
	if (formatState?.image?.isActive) {
		return formatState.image.align ?? null
	}
	const alignment = formatState?.alignment
	return isTopicPostAlign(alignment) ? alignment : null
}

/**
 * Sets a selected image's alignment, or the alignment of the paragraphs at the caret. A press on the active button sets it
 * back: the image to its own line, and the paragraphs to the text's own direction. An editor that cannot place an
 * image aligns the paragraphs.
 */
export function alignTopicPostBody(
	editor: NoteEditorCommands,
	formatState: NoteFormatState | null,
	align: TopicPostAlign,
): void {
	const isActive = toActiveTopicPostAlign(formatState) === align
	if (formatState?.image?.isActive && editor.setImageAlign) {
		editor.setImageAlign(isActive ? null : align)
		return
	}
	editor.setTextAlignment?.(isActive ? "auto" : align)
}
