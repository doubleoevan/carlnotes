import { cn } from "@carlnotes/nightshift/classNames"
import type * as React from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"

/**
 * The divider under a closed section of a column, which shows only below the width where the page's columns sit side
 * by side.
 */
export const STACKED_CLOSED_DIVIDER_CLASS = "max-lg:data-[state=closed]:last:border-b"

/**
 * A titled section of a page that opens by default and collapses on click, or follows a saved open state. The topic
 * page's and the podcast episode page's sections share it, so their headers share the same design.
 */
export function CollapsibleSection({
	value,
	title,
	titleNote,
	titleAside,
	countLabel,
	isCountHiddenOnNarrowScreens,
	isContentKept,
	hasClosedDivider,
	hasStackedClosedDivider,
	isOpen,
	onOpenChange,
	className,
	children,
}: {
	// the accordion's own key for this section, which also names it in the open-by-default list
	value: string
	title: string
	// what sits right after the title, such as a note icon
	titleNote?: React.ReactNode
	// what sits at the far right of the title row
	titleAside?: React.ReactNode
	// the section's count at the far right, such as "6 episodes", for a section with no aside of its own
	countLabel?: string
	// whether the count hides on a narrow screen, for a title too long to leave the count room there
	isCountHiddenOnNarrowScreens?: boolean
	// whether the content stays mounted while closed, for content that holds its own state
	isContentKept?: boolean
	// whether a divider shows under the section while it is closed, for a full-width section above another section
	hasClosedDivider?: boolean
	// whether that divider shows only below the width where the page puts its sections in two columns, for a section
	// of a column that fills a row of its own on a narrow screen
	hasStackedClosedDivider?: boolean
	// the section's open state and its change, for a section whose state is saved. open by default if left out
	isOpen?: boolean
	onOpenChange?: (isOpen: boolean) => void
	className?: string
	children: React.ReactNode
}) {
	return (
		<Accordion
			type="multiple"
			defaultValue={[value]}
			value={isOpen === undefined ? undefined : isOpen ? [value] : []}
			onValueChange={(openValues) => onOpenChange?.(openValues.includes(value))}
			className={className}
		>
			<AccordionItem
				value={value}
				className={cn(
					hasClosedDivider && "data-[state=closed]:last:border-b",
					hasStackedClosedDivider && STACKED_CLOSED_DIVIDER_CLASS,
				)}
			>
				{/* the note and the aside sit beside the trigger, so a click on the note or the aside never toggles the section.
				    the trigger fills the row, which puts the aside and the count at the far right. with a note, the trigger
				    ends at the title and the aside moves to the far right */}
				<div className={cn("flex items-center gap-2", !titleNote && "[&>:first-child]:flex-1")}>
					<AccordionTrigger className={cn("py-2", titleNote && "flex-none")}>
						<span className="font-display text-xl">{title}</span>
					</AccordionTrigger>
					{titleNote}
					{titleNote ? <div className="ml-auto">{titleAside}</div> : titleAside}
					{countLabel && (
						<span
							className={cn("text-muted-foreground shrink-0 text-sm", isCountHiddenOnNarrowScreens && "max-sm:hidden")}
						>
							{countLabel}
						</span>
					)}
				</div>
				<AccordionContent forceMount={isContentKept || undefined}>{children}</AccordionContent>
			</AccordionItem>
		</Accordion>
	)
}
