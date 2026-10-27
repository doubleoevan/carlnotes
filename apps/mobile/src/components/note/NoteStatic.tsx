import {
	type NoteReaderProps,
	type NoteStaticProps,
	NoteStatic as SharedNoteStatic,
} from "@carlnotes/core/components/NoteStatic"
import { EnrichedText } from "react-native-enriched-html"
import { openExternalLink } from "@/components/common/AnchorLink"
import { NoteLayout } from "./NoteLayout"
import { useNoteStyle } from "./noteStyle"

// use the same note layout without an input, toolbar or comment composer
const ELEMENTS = { Layout: NoteLayout, Reader: NoteReader }

/**
 * Renders shared read-only note composition with the native display component.
 */
export function NoteStatic(props: Omit<NoteStaticProps, "onOpenLink">) {
	return <SharedNoteStatic {...props} onOpenLink={(url) => void openExternalLink(url)} elements={ELEMENTS} />
}

// render the stored HTML with the editor's own typography and safe destination handling
function NoteReader({ html, onOpenLink }: NoteReaderProps) {
	const noteStyle = useNoteStyle()
	return (
		<EnrichedText
			style={noteStyle.bodyStyle}
			htmlStyle={noteStyle.htmlStyle}
			onLinkPress={(event) => onOpenLink(event.url)}
		>
			{html}
		</EnrichedText>
	)
}
