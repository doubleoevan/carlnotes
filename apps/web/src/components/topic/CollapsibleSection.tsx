import { cn } from "@carlnotes/nightshift/classNames"
import type * as React from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"

/**
 * The divider under a closed section of a column, which shows only below the width where the page's columns sit side
 * by side.
 */
export const STACKED_CLOSED_DIVIDER_CLASS = "max-lg:data-[state=closed]:last:border-b"

// the classes that stop the trigger and the filler after the note from filling the title row from a screen width up
// while the section is open, so the count sits right after the title. a closed section keeps its count at the far right
const COUNT_BESIDE_TITLE_CLASSES = {
	sm: { trigger: "sm:group-data-[state=open]/section:flex-none!", filler: "sm:group-data-[state=open]/section:grow-0" },
	lg: { trigger: "lg:group-data-[state=open]/section:flex-none!", filler: "lg:group-data-[state=open]/section:grow-0" },
}

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
	countBesideTitleFrom,
	isCountHiddenOnNarrowScreens,
	isContentKept,
	hasClosedDivider,
	hasStackedClosedDivider,
	hasCompactHeader,
	canWrapHeader,
	isOpen,
	onOpenChange,
	id,
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
	// the screen width from which the count sits right after the title instead of at the far right, for a section
	// whose content does not reach the far right
	countBesideTitleFrom?: keyof typeof COUNT_BESIDE_TITLE_CLASSES
	// whether the count hides on a narrow screen, for a title too long to leave the count room there
	isCountHiddenOnNarrowScreens?: boolean
	// whether the content stays mounted while closed, for content that holds its own state
	isContentKept?: boolean
	// whether a divider shows under the section while it is closed, for a full-width section above another section
	hasClosedDivider?: boolean
	// whether that divider shows only below the width where the page puts its sections in two columns, for a section
	// of a column that fills a row of its own on a narrow screen
	hasStackedClosedDivider?: boolean
	// give a header action the same space above its card as the compact Tasting Notes header
	hasCompactHeader?: boolean
	// allow actions that do not fit to flow to a second line
	canWrapHeader?: boolean
	// the section's open state and its change, for a section whose state is saved. open by default if left out
	isOpen?: boolean
	onOpenChange?: (isOpen: boolean) => void
	// the section's anchor, which a link scrolls to below the sticky search bar
	id?: string
	className?: string
	children: React.ReactNode
}) {
	// the classes that put the count right after the title, for content that ends short of the far right
	const countBesideTitleClasses = countBesideTitleFrom && COUNT_BESIDE_TITLE_CLASSES[countBesideTitleFrom]
	return (
		<Accordion
			type="multiple"
			defaultValue={[value]}
			value={isOpen === undefined ? undefined : isOpen ? [value] : []}
			onValueChange={(openValues) => onOpenChange?.(openValues.includes(value))}
			id={id}
			className={cn(id && "scroll-mt-20", className)}
		>
			<AccordionItem
				value={value}
				className={cn(
					"group/section",
					hasClosedDivider && "data-[state=closed]:last:border-b",
					hasStackedClosedDivider && STACKED_CLOSED_DIVIDER_CLASS,
				)}
			>
				{/* the note and the aside sit beside the trigger, so a click on the note or the aside never toggles the section.
				    the trigger fills the row, which puts the aside and the count at the far right. with a note, the trigger
				    ends at the title and a filler after the note puts the aside at the far right, or at the left of its own
				    line once the aside wraps */}
				<div
					className={cn(
						"flex items-center gap-2",
						!titleNote && "[&>:first-child]:flex-1",
						hasCompactHeader && "mb-2",
						canWrapHeader && "max-sm:flex-wrap max-sm:gap-y-0 max-sm:[&>:first-child]:min-w-max",
					)}
				>
					<AccordionTrigger className={cn("py-2", titleNote && "flex-none", countBesideTitleClasses?.trigger)}>
						<span className="font-display text-xl">{title}</span>
					</AccordionTrigger>
					{titleNote}
					{titleNote && <span aria-hidden="true" className={cn("grow", countBesideTitleClasses?.filler)} />}
					{titleAside}
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
