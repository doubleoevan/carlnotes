import {
	type SearchResultRowElements,
	type SearchResultRowProps,
	SearchResultRow as SharedSearchResultRow,
} from "@carlnotes/core/components/SearchResultRow"
import { cn } from "@carlnotes/nightshift/classNames"
import { DASHED_ROW_CLASS, LIST_ROW_HOVER_CLASS } from "@/lib/styleClasses"

// search keeps its existing rank slot; selectable rows replace the rank and kind icon with one checkbox
const elements: SearchResultRowElements = {
	Row: ({ children, className }) => (
		<div className={cn(DASHED_ROW_CLASS, LIST_ROW_HOVER_CLASS, "group flex items-center", className)}>{children}</div>
	),
	Rank: ({ children }) => (
		<span
			className="text-muted-foreground absolute top-0 left-0 grid size-11 place-items-center sm:top-1.5 sm:size-8"
			aria-hidden
		>
			<span className="font-display text-sm tabular-nums">{children}</span>
		</span>
	),
	Body: ({ children, hasRank }) => (
		<div className={cn("flex min-w-0 flex-1 items-start gap-2.5 py-3 pr-3", hasRank ? "pl-9" : "pl-3")}>{children}</div>
	),
	Content: ({ children }) => <div className="min-w-0 flex-1">{children}</div>,
	Title: ({ children }) => <div className="truncate text-sm">{children}</div>,
	Details: ({ children }) => (
		<div className="text-muted-foreground mt-0.5 flex flex-wrap items-center gap-1.5 text-xs group-hover:text-foreground/80">
			{children}
		</div>
	),
}

/**
 * Adapts the shared result row to the site's standard search layout.
 */
export function SearchResultRow(props: SearchResultRowProps) {
	return <SharedSearchResultRow {...props} elements={elements} />
}
