import type * as React from "react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"

/**
 * A titled section of the topic page that opens by default and collapses on click.
 * The topic page's four sections share it, so their headers share the same design.
 */
export function CollapsibleSection({
	value,
	title,
	className,
	children,
}: {
	// the accordion's own key for this section, which also names it in the open-by-default list
	value: string
	title: string
	className?: string
	children: React.ReactNode
}) {
	return (
		<Accordion type="multiple" defaultValue={[value]} className={className}>
			<AccordionItem value={value}>
				<AccordionTrigger className="py-2">
					<span className="font-display text-lg">{title}</span>
				</AccordionTrigger>
				<AccordionContent>{children}</AccordionContent>
			</AccordionItem>
		</Accordion>
	)
}
