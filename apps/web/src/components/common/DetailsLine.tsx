import {
	type DetailsLineElements,
	type DetailsLineProps,
	DetailsLine as SharedDetailsLine,
} from "@carlnotes/core/components/DetailsLine"
import { cn } from "@carlnotes/nightshift/classNames"

// the web's elements: a wrapping row of small muted text, where each detail is one item that wraps whole
const DETAILS_LINE_ELEMENTS: DetailsLineElements = {
	Line: ({ className, children }) => (
		<p className={cn("text-muted-foreground flex flex-wrap items-center gap-x-1 text-sm", className)}>{children}</p>
	),
	Detail: ({ children }) => <span>{children}</span>,
}

/**
 * The muted details line under a page's byline on the web: a Topic Post's date and reading time, and the counts of a
 * topic, a profile, and a team.
 */
export function DetailsLine(props: DetailsLineProps) {
	return <SharedDetailsLine {...props} elements={DETAILS_LINE_ELEMENTS} />
}
