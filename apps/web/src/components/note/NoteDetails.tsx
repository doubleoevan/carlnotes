import { toProfilePath } from "@carlnotes/contracts/seo"
import { type NoteDetailsElements, NoteDetails as SharedNoteDetails } from "@carlnotes/core/components/NoteDetails"
import { toCommentsToggleLabel } from "@carlnotes/core/lib/noteLabels"
import { MessageSquareText } from "lucide-react"
import type { ComponentProps } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ToolbarButton } from "./NoteToolbar"

/**
 * An open note's frame above its body: the visibility and the toolbar's controls on one row, then the name and the
 * owner's byline.
 */
export function NoteDetails(props: Omit<ComponentProps<typeof SharedNoteDetails>, "elements">) {
	return <SharedNoteDetails {...props} elements={NOTE_DETAILS_ELEMENTS} />
}

// the dialog's row of toolbar buttons, the display name, and the muted byline
export const NOTE_DETAILS_ELEMENTS: NoteDetailsElements = {
	HeaderRow: ({ children }) => <div className="flex min-h-9 items-center justify-between gap-2">{children}</div>,
	Controls: ({ children }) => <div className="ml-auto flex items-center gap-0.5">{children}</div>,
	// the comments toggle takes the pressed fill while the thread shows
	CommentsToggle: ({ isOpen, onToggle }) => (
		<ToolbarButton
			label={toCommentsToggleLabel(isOpen)}
			Icon={MessageSquareText}
			isPressed={isOpen}
			className="text-muted-foreground"
			onClick={onToggle}
		/>
	),
	Title: ({ children }) => <h2 className="truncate text-center font-display text-2xl font-normal">{children}</h2>,
	Byline: ({ owner }) => (
		<p className="text-muted-foreground text-center text-sm">
			by{" "}
			<AnchorLink href={toProfilePath(owner.id)} className="text-link">
				{owner.username}
			</AnchorLink>
		</p>
	),
}
