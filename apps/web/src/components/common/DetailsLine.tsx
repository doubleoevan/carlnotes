import {
	type DetailsLineElements,
	type DetailsLineProps,
	DetailsLine as SharedDetailsLine,
} from "@carlnotes/core/components/DetailsLine"
import { cn } from "@carlnotes/nightshift/classNames"

// the web's elements: a line of small muted text, where each detail is an inline block that wraps whole, so the line
// flows around a floated avatar
const DETAILS_LINE_ELEMENTS: DetailsLineElements = {
	Line: ({ className, children }) => <p className={cn("text-muted-foreground text-sm", className)}>{children}</p>,
	Detail: ({ children }) => <span className="mr-1 inline-block">{children}</span>,
}

/**
 * The muted details line under a page's byline on the web: a Topic Post's date and reading time, and the counts of a
 * topic, a profile, and a team.
 */
export function DetailsLine(props: DetailsLineProps) {
	return <SharedDetailsLine {...props} elements={DETAILS_LINE_ELEMENTS} />
}
