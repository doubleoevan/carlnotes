// a Topic Post's body on its screen: the stored html on a card with the note's typography
import { toNoteLinkUrl } from "@carlnotes/core/lib/noteFormats"
import { toWidthLimitedImageHtml } from "@carlnotes/core/lib/topicPostBodyHtml"
import { useState } from "react"
import { View } from "react-native"
import { openExternalLink } from "@/components/common/AnchorLink"
import { NoteReader } from "@/components/note/NoteViewer"

/**
 * Renders the body on a card with safe destination handling. The native view draws an image at its stored size, so
 * the body shows once its width is measured, with each image no wider than it.
 */
export function TopicPostBody({ html }: { html: string }) {
	const [bodyWidth, setBodyWidth] = useState<number | null>(null)

	// guard a stored destination even if the display library recognizes a link
	const handleOpenLink = (url: string): void => {
		const safeUrl = toNoteLinkUrl(url)
		if (safeUrl) {
			void openExternalLink(safeUrl)
		}
	}
	return (
		<View className="my-3 rounded-lg border border-border bg-card px-4 py-4 shadow-raised">
			<View onLayout={(event) => setBodyWidth(event.nativeEvent.layout.width)}>
				{bodyWidth !== null && (
					<NoteReader html={toWidthLimitedImageHtml(html, bodyWidth)} onOpenLink={handleOpenLink} />
				)}
			</View>
		</View>
	)
}
