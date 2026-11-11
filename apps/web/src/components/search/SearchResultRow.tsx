import {
	type SearchResultRowElements,
	type SearchResultRowProps,
	SearchResultRow as SharedSearchResultRow,
} from "@carlnotes/core/components/SearchResultRow"
import { cn } from "@carlnotes/nightshift/classNames"
import { DASHED_ROW_CLASS, LIST_ROW_HOVER_CLASS, RANK_SLOT_CLASS, ROW_METADATA_LINE_CLASS } from "@/lib/styleClasses"

// a row keeps its rank slot, and a selectable row replaces the rank with one checkbox
const elements: SearchResultRowElements = {
	Row: ({ children, className, onPress }) => (
		// biome-ignore lint/a11y/useKeyWithClickEvents: the button the row holds for what the press opens is the keyboard path
		// biome-ignore lint/a11y/noStaticElementInteractions: a pointer shortcut to that button
		<div
			// a press on one of the row's own links or buttons is that control's alone
			onClick={onPress && ((event) => !(event.target as Element).closest("a, button") && onPress())}
			className={cn(
				DASHED_ROW_CLASS,
				LIST_ROW_HOVER_CLASS,
				"group flex items-center",
				onPress && "cursor-pointer",
				className,
			)}
		>
			{children}
		</div>
	),
	Rank: ({ children }) => (
		<span className={cn("text-muted-foreground", RANK_SLOT_CLASS)} aria-hidden>
			<span className="font-display text-sm tabular-nums">{children}</span>
		</span>
	),
	Body: ({ children, hasRank }) => (
		<div className={cn("flex min-w-0 flex-1 items-start gap-2.5 py-3 pr-3", hasRank ? "pl-9" : "pl-3")}>{children}</div>
	),
	Content: ({ children }) => <div className="min-w-0 flex-1">{children}</div>,
	// the control sits right after the title, level with its first line, and adds no height to the row
	Title: ({ children, aside }) => (
		<div className="flex min-w-0 items-start gap-0.5 text-sm">
			<div className="min-w-0 truncate">{children}</div>
			{aside && <span className="-my-1 shrink-0">{aside}</span>}
		</div>
	),
	Details: ({ children }) => <div className={ROW_METADATA_LINE_CLASS}>{children}</div>,
}

/**
 * Adapts the shared result row to the site's standard search layout.
 */
export function SearchResultRow(props: SearchResultRowProps) {
	return <SharedSearchResultRow {...props} elements={elements} />
}
