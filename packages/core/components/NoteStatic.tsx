import type { NoteResponse } from "@carlnotes/contracts/notes"
import type { ComponentType, PropsWithChildren, ReactNode, RefObject } from "react"
import type { NoteCommentThread } from "../hooks/useNoteComments"
import type { NoteEditorCommands } from "../lib/noteFormats"
import { toNoteLinkUrl } from "../lib/noteFormats"

export type NoteEditorInstance = NoteEditorCommands & {
	setValue: (html: string) => void
	focus: () => void
	blur: () => void
}
export type NoteLayoutProps = PropsWithChildren<{
	noteCommentThread: NoteCommentThread
	canComment: boolean
	isCommentsOpen: boolean
	header?: ReactNode
	toolbar?: ReactNode
	conflict?: ReactNode
	editorRef?: RefObject<NoteEditorInstance | null>
}>
export type NoteStaticProps = {
	header?: ReactNode
	note: NoteResponse
	noteCommentThread: NoteCommentThread
	isCommentsOpen: boolean
	onOpenLink: (url: string) => void
}
export type NoteReaderProps = { html: string; onOpenLink: (url: string) => void }

/**
 * Shares the read-only note composition while leaving library rendering and layout to each platform.
 */
export function NoteStatic({
	note,
	header,
	noteCommentThread,
	isCommentsOpen,
	onOpenLink,
	elements: { Layout, Reader },
}: NoteStaticProps & {
	elements: { Layout: ComponentType<NoteLayoutProps>; Reader: ComponentType<NoteReaderProps> }
}) {
	// guard stored destinations even when the display library recognizes a link
	function handleOpenLink(url: string): void {
		const safeUrl = toNoteLinkUrl(url)
		if (safeUrl) {
			onOpenLink(safeUrl)
		}
	}
	return (
		<Layout header={header} noteCommentThread={noteCommentThread} canComment={false} isCommentsOpen={isCommentsOpen}>
			<Reader html={note.html} onOpenLink={handleOpenLink} />
		</Layout>
	)
}
