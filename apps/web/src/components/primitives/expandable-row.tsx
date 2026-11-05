import {
	type ExpandableRowElements,
	type ExpandableRowProps,
	ExpandableRow as SharedExpandableRow,
} from "@carlnotes/core/components/ExpandableRow"
import { cn } from "@carlnotes/nightshift/classNames"
import { expandableRowClasses } from "@carlnotes/nightshift/components/expandable-row"
import { ChevronDown, ChevronUp } from "lucide-react"
import { Button } from "@/components/primitives/button"

// native button semantics preserve keyboard activation and the expanded relationship
const ELEMENTS: ExpandableRowElements = {
	Title: ({ children, className }) => (
		<span
			className={cn(
				className,
				"block underline-offset-4 group-hover/expandable:underline group-focus-visible/expandable:underline",
			)}
		>
			{children}
		</span>
	),
	Text: ({ children, className }) => <span className={cn("block", className)}>{children}</span>,
	Row: ({ children, className }) => <div className={cn("min-w-0", className)}>{children}</div>,
	Disclosure: ({ children, isExpanded, contentId, onPress }) => (
		<Button
			type="button"
			variant="ghost"
			aria-expanded={isExpanded}
			aria-controls={contentId}
			onClick={onPress}
			className={cn(
				expandableRowClasses.trigger,
				"group/expandable min-h-11 whitespace-normal text-left has-[>svg]:px-0 hover:bg-transparent dark:hover:bg-transparent hover:text-foreground",
			)}
		>
			{children}
		</Button>
	),
	Details: ({ id, children, className }) => (
		<div id={id} className={cn(className, "space-y-3 [overflow-wrap:anywhere]")}>
			{children}
		</div>
	),
	Chevron: ({ isExpanded }) =>
		isExpanded ? (
			<ChevronUp aria-hidden className={expandableRowClasses.chevron} />
		) : (
			<ChevronDown aria-hidden className={expandableRowClasses.chevron} />
		),
}

/**
 * Renders the shared row with browser button and disclosure semantics.
 */
export function ExpandableRow(props: ExpandableRowProps) {
	return <SharedExpandableRow {...props} elements={ELEMENTS} />
}
