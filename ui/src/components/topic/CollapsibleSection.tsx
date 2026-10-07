import type * as React from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { cn } from "@/lib/utils"

/**
 * A titled section of the topic page that opens by default and collapses on click.
 * The topic page's four sections share it, so their headers share the same design.
 */
export function CollapsibleSection({
	value,
	title,
	titleNote,
	titleAside,
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
	className?: string
	children: React.ReactNode
}) {
	return (
		<Accordion type="multiple" defaultValue={[value]} className={className}>
			<AccordionItem value={value}>
				{/* the note and the aside sit beside the trigger, so a click on the note or the aside never toggles the section.
				    with a note, the trigger ends at the title and the aside moves to the far right */}
				<div className="flex items-center gap-2">
					<AccordionTrigger className={cn("py-2", titleNote && "flex-none")}>
						<span className="font-display text-lg">{title}</span>
					</AccordionTrigger>
					{titleNote}
					{titleNote ? <div className="ml-auto">{titleAside}</div> : titleAside}
				</div>
				<AccordionContent>{children}</AccordionContent>
			</AccordionItem>
		</Accordion>
	)
}
