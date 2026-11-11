import { toNoteLinkUrl } from "@carlnotes/core/lib/noteFormats"
import { NoteReader } from "@/components/note/NoteViewer"
import { openInNewTab } from "@/lib/externalLinks"

/**
 * Renders a Topic Post's stored body with the note's typography. It loads with the editor package, in the browser
 * alone.
 */
export function TopicPostReader({ html }: { html: string }) {
	// guard a stored destination even if the display library recognizes a link
	const handleOpenLink = (url: string): void => {
		const safeUrl = toNoteLinkUrl(url)
		if (safeUrl) {
			openInNewTab(safeUrl)
		}
	}
	return <NoteReader html={html} onOpenLink={handleOpenLink} />
}
