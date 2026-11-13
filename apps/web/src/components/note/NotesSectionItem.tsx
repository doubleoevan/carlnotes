// the Tasting Notes accordion item and its Add Note link
import type { NotePageRef } from "@carlnotes/client/noteClient"
import { toSectionCountLabel } from "@carlnotes/core/lib/labels"
import { cn } from "@carlnotes/nightshift/classNames"
import { Plus } from "lucide-react"
import type { ReactNode } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { buttonVariants } from "@/components/primitives/button"

/**
 * The label of the button that starts a note.
 */
export const ADD_NOTE_LABEL = "Add Note"

/**
 * The Tasting Notes accordion item: the title with its count, the actions beside the trigger, and the notes under it.
 */
export function NotesSectionItem({
	pageType,
	noteCount,
	titleClassName,
	hasCompactHeader,
	className,
	actions,
	children,
}: {
	pageType: NotePageRef["pageType"]
	noteCount: number | null
	// the header text style, the compact header, and the item's own classes
	titleClassName?: string
	hasCompactHeader: boolean
	className?: string
	// what sits beside the trigger, such as the Add Note button
	actions: ReactNode
	children: ReactNode
}) {
	// a team's section says Team notes, and a topic's says Tasting Notes
	const sectionTitle = pageType === "team" ? "Team notes" : "Tasting Notes"
	return (
		<AccordionItem value="notes" className={className}>
			{/* the actions sit beside the trigger. clicks on them never toggle the section */}
			<div className={cn("flex items-center gap-2 [&>:first-child]:flex-1", hasCompactHeader && "mb-2")}>
				<AccordionTrigger className={cn(hasCompactHeader && "py-2")}>
					<span className={cn(titleClassName, "flex-1")}>{sectionTitle}</span>
					{/* the section counts its notes at the far right of its title */}
					<NoteCount noteCount={noteCount} />
				</AccordionTrigger>
				{actions}
			</div>
			<AccordionContent>{children}</AccordionContent>
		</AccordionItem>
	)
}

/**
 * The Add Note button as a link, which opens a page in place of the create flow.
 */
export function AddNoteLink({ href }: { href: string }) {
	return (
		<AnchorLink href={href} className={cn(buttonVariants(), "shrink-0")}>
			<Plus className="size-4" />
			{ADD_NOTE_LABEL}
		</AnchorLink>
	)
}

// how many notes a section holds, or nothing for a section with none
function NoteCount({ noteCount }: { noteCount: number | null }) {
	const countLabel = toSectionCountLabel(noteCount, "note")
	return countLabel ? <span className="text-muted-foreground text-sm">{countLabel}</span> : null
}
