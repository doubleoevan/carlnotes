import { cn } from "@carlnotes/nightshift/classNames"
import type { MouseEvent, ReactNode } from "react"
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { RAIL_TEXT_INSET } from "@/lib/styleClasses"

/**
 * One section of a page's accordion of sections, as the Topics page and the home page draw them: the title with its
 * count at the far right, and a divider under the section only while it is closed.
 */
export function AccordionSection({
	value,
	title,
	countLabel,
	isContentKept,
	onTriggerClick,
	children,
}: {
	// the accordion's own key for this section
	value: string
	title: string
	// the section's count, such as "6 topics", or nothing until it is known
	countLabel?: string
	// whether the content stays in the html while closed, for a crawler or for content that holds its own state
	isContentKept?: boolean
	onTriggerClick?: (event: MouseEvent<HTMLButtonElement>) => void
	children: ReactNode
}) {
	return (
		<AccordionItem value={value}>
			<AccordionTrigger onClick={onTriggerClick} className="pb-1">
				<span className="font-display flex-1 text-xl">{title}</span>
				{/* the count, inset to end on the same line as the quota line above the Topics page's sections */}
				{countLabel && <span className={cn("text-muted-foreground text-sm", RAIL_TEXT_INSET)}>{countLabel}</span>}
			</AccordionTrigger>
			<AccordionContent forceMount={isContentKept || undefined}>{children}</AccordionContent>
		</AccordionItem>
	)
}
