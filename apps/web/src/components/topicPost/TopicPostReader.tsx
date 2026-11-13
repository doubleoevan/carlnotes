import type { TopicPostBodyProps } from "@carlnotes/core/components/TopicPostPage"
import { toNoteLinkUrl } from "@carlnotes/core/lib/noteFormats"
import { useRef } from "react"
import { NoteReader } from "@/components/note/NoteViewer"
import { CODE_BLOCK_COLORS_CLASS } from "@/components/note/noteStyle"
import { useCodeBlockColors } from "@/hooks/useCodeBlockColors"
import { openInNewTab } from "@/lib/externalLinks"
import { TopicPostBodyImageReportButtons } from "./TopicPostBodyImageReportButtons"

/**
 * Renders a Topic Post's stored body with the note's typography, its code blocks in a language in their colors, and a
 * Report image button over each image its reader may report. It loads with the editor package, in the browser alone.
 */
export function TopicPostReader({ html, bodyImageReports, onBodyImageReportClosed }: TopicPostBodyProps) {
	// the rendered body, whose code blocks color once the highlighter loads
	const bodyRef = useRef<HTMLDivElement>(null)
	useCodeBlockColors(bodyRef, html)

	// guard a stored destination even if the display library recognizes a link
	const handleOpenLink = (url: string): void => {
		const safeUrl = toNoteLinkUrl(url)
		if (safeUrl) {
			openInNewTab(safeUrl)
		}
	}
	return (
		<div className="relative">
			<div ref={bodyRef} className={CODE_BLOCK_COLORS_CLASS}>
				<NoteReader html={html} onOpenLink={handleOpenLink} />
			</div>
			<TopicPostBodyImageReportButtons
				bodyRef={bodyRef}
				bodyImageReports={bodyImageReports}
				onReportClosed={onBodyImageReportClosed}
			/>
		</div>
	)
}
