// the read-only note: the editor package's display component over the stored body, with the comment thread beside it
// and no composer. this module runs in the browser alone
import type { NoteResponse } from "@carlnotes/contracts/notes"
import type { NoteCommentThread } from "@carlnotes/core/hooks/useNoteComments"
import { EnrichedText } from "react-native-enriched-html"
import { openInNewTab } from "@/lib/externalLinks"
import { NoteLayout } from "./NoteLayout"
import { NOTE_BODY_CLASS, NOTE_HTML_STYLE } from "./noteStyle"

/**
 * The note as a user without edit access sees it: the stored body rendered by the same package that edits it, and the
 * thread to read.
 */
export function NoteStatic({
	note,
	noteCommentThread,
	isCommentsOpen,
}: {
	note: NoteResponse
	noteCommentThread: NoteCommentThread
	isCommentsOpen: boolean
}) {
	return (
		<div className="relative flex h-full flex-col">
			<NoteLayout noteCommentThread={noteCommentThread} canComment={false} isCommentsOpen={isCommentsOpen}>
				<div className={NOTE_BODY_CLASS}>
					<EnrichedText htmlStyle={NOTE_HTML_STYLE} onLinkPress={(event) => openInNewTab(event.url)}>
						{note.html}
					</EnrichedText>
				</div>
			</NoteLayout>
		</div>
	)
}
