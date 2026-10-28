import {
	type NoteReaderProps,
	type NoteViewerProps,
	NoteViewer as SharedNoteViewer,
} from "@carlnotes/core/components/NoteViewer"
import { EnrichedText } from "react-native-enriched-html"
import { openInNewTab } from "@/lib/externalLinks"
import { NoteLayout } from "./NoteLayout"
import { NOTE_BODY_CLASS, NOTE_BODY_STYLE, NOTE_HTML_STYLE } from "./noteStyle"

// keep browser display elements stable across renders
const ELEMENTS = { Layout: NoteLayout, Reader: NoteReader }

/**
 * Renders the shared read-only note in the browser's existing note layout.
 */
export function NoteViewer(props: Omit<NoteViewerProps, "onOpenLink">) {
	return <SharedNoteViewer {...props} onOpenLink={openInNewTab} elements={ELEMENTS} />
}

// render saved HTML with the same typography as the editor
function NoteReader({ html, onOpenLink }: NoteReaderProps) {
	return (
		<div className={NOTE_BODY_CLASS} style={NOTE_BODY_STYLE}>
			<EnrichedText htmlStyle={NOTE_HTML_STYLE} onLinkPress={(event) => onOpenLink(event.url)}>
				{html}
			</EnrichedText>
		</div>
	)
}
