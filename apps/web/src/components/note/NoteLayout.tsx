// the note's layout: the page card on a sunken field, the comment thread in the margin beside it on a wide screen, and
// the sheet a phone slides the thread up in

import type { NoteLayoutProps } from "@carlnotes/core/components/NoteStatic"
import type { NoteCommentThread } from "@carlnotes/core/hooks/useNoteComments"
import { cn } from "@carlnotes/nightshift/classNames"
import type { PointerEvent, ReactNode } from "react"
import { NoteComments } from "./NoteComments"

/**
 * Places the shared editor slots in the browser's existing toolbar, notice and comment layout.
 */
export function NoteLayout({ header, toolbar, conflict, editorRef, children, ...props }: NoteLayoutProps) {
	return (
		<div className="relative flex h-full flex-col">
			{header}
			{toolbar && <div className={cn("pb-4", props.isCommentsOpen && "hidden sm:block")}>{toolbar}</div>}
			{conflict}
			<NoteBodyLayout
				{...props}
				onCardPointerDown={(event) => {
					if (!(event.target as HTMLElement).closest(".eti-editor")) {
						editorRef?.current?.focus()
					}
				}}
			>
				{children}
			</NoteBodyLayout>
		</div>
	)
}

/**
 * The layout around a note's body, editable or not, with its comment thread in the margin column or the phone's
 * sheet, whichever the screen shows.
 */
function NoteBodyLayout({
	noteCommentThread,
	canComment,
	isCommentsOpen,
	onCardPointerDown,
	children,
}: {
	// the thread the dialog loaded as the note opened
	noteCommentThread: NoteCommentThread
	// whether the thread offers a composer, which takes edit access
	canComment: boolean
	// whether the margin column or the sheet shows
	isCommentsOpen: boolean
	// a press on the page card itself, outside the body
	onCardPointerDown?: (event: PointerEvent<HTMLDivElement>) => void
	children: ReactNode
}) {
	// the thread and its heading, rendered in whichever of the two places the screen shows
	const commentsHeading = <h3 className="font-display pb-2 text-lg">Comments</h3>
	const noteComments = <NoteComments {...noteCommentThread} canComment={canComment} />
	return (
		<>
			{/* the note is a card page on a sunken field, and on a wide screen the thread sits in the margin beside it. the
				whole layout scrolls as one. a phone drops the field and the page's own padding */}
			<div className="min-h-0 flex-1 overflow-y-auto sm:bg-sunken sm:rounded-md sm:p-4">
				<div className="flex min-h-full items-start gap-4">
					<div
						onPointerDown={onCardPointerDown}
						className="bg-card min-w-0 flex-1 self-stretch py-4 sm:rounded-lg sm:border sm:py-6 sm:shadow-raised"
					>
						{children}
					</div>
					{isCommentsOpen && (
						<aside className="hidden w-64 shrink-0 sm:block">
							{commentsHeading}
							{noteComments}
						</aside>
					)}
				</div>
			</div>

			{/* the phone's comments sheet, sliding up over the note on the dialog's own background. motion-safe skips the
				slide for a user who asked for reduced motion */}
			{isCommentsOpen && (
				<div className="bg-popover motion-safe:animate-in motion-safe:slide-in-from-bottom-16 motion-safe:duration-200 absolute inset-0 z-10 flex flex-col sm:hidden">
					{commentsHeading}
					<div className="min-h-0 flex-1 overflow-y-auto">{noteComments}</div>
				</div>
			)}
		</>
	)
}
