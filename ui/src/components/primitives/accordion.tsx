import * as AccordionPrimitive from "@radix-ui/react-accordion"
import { ChevronRight } from "lucide-react"
import type * as React from "react"

import { cn } from "@/lib/utils"

// accordion root — shadcn new-york, adapted with a LEFT disclosure chevron per the design
function Accordion({ ...props }: React.ComponentProps<typeof AccordionPrimitive.Root>) {
	return <AccordionPrimitive.Root data-slot="accordion" {...props} />
}

// one collapsible section
function AccordionItem({ className, ...props }: React.ComponentProps<typeof AccordionPrimitive.Item>) {
	return (
		<AccordionPrimitive.Item
			data-slot="accordion-item"
			className={cn("border-b last:border-b-0", className)}
			{...props}
		/>
	)
}

// the header row; the chevron leads (▸ collapsed, rotates to ▾ when open)
function AccordionTrigger({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
	return (
		<AccordionPrimitive.Header className="flex">
			<AccordionPrimitive.Trigger
				data-slot="accordion-trigger"
				className={cn(
					"focus-visible:ring-ring/50 flex flex-1 items-center gap-2 rounded-md py-4 text-left outline-none focus-visible:ring-[3px] disabled:pointer-events-none [&[data-state=open]>svg:first-child]:rotate-90",
					className,
				)}
				{...props}
			>
				<ChevronRight className="text-muted-foreground pointer-events-none size-4 shrink-0 transition-transform duration-200" />
				{children}
			</AccordionPrimitive.Trigger>
		</AccordionPrimitive.Header>
	)
}

// the collapsible body, height-animated open/closed
function AccordionContent({ className, children, ...props }: React.ComponentProps<typeof AccordionPrimitive.Content>) {
	return (
		<AccordionPrimitive.Content
			data-slot="accordion-content"
			className="data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down overflow-hidden"
			{...props}
		>
			<div className={cn("pb-2", className)}>{children}</div>
		</AccordionPrimitive.Content>
	)
}

export { Accordion, AccordionContent, AccordionItem, AccordionTrigger }
