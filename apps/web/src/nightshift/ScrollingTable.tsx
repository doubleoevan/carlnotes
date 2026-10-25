// the tables on the Nightshift pages, laid out as the app lays out its data tables. the first column stays put while
// the rest scrolls sideways under it
import { cn } from "@carlnotes/nightshift/classNames"
import type { Markdown } from "@storybook/addon-docs/blocks"
import type { ComponentProps, ReactNode } from "react"
import { TableCard } from "@/components/table/TableCard"
import { useScrollRegionTabStop } from "@/hooks/useScrollRegionTabStop"
import {
	ONE_PAGE_TABLE_CARD_CLASS,
	SCROLL_REGION_FOCUS_CLASS,
	TABLE_CLASS,
	TABLE_HEAD_CLASS,
	TABLE_SCROLL_CLASS,
} from "@/lib/styleClasses"
import { CODE_STYLE } from "./pageStyles"

// the header and body cells the app's tables write. Tailwind does not scan this folder, so each class here is one an
// app table already writes
export const HEADER_CELL_CLASS = "py-2 pr-4 align-top font-normal"
export const BODY_CELL_CLASS = "py-2 pr-4 align-top"

/**
 * Renders a table in the app's scroll box, with the app's table classes: the fixed first column, the row rules, and the
 * row hover. The box takes a tab stop while the table overflows it, so a keyboard can scroll it.
 */
export function ScrollingTable({
	label,
	minWidth,
	children,
}: {
	// the scroll box's accessible name
	label: string
	// the width the table keeps on a narrow screen, where it scrolls instead of squeezing its columns
	minWidth: string
	children: ReactNode
}) {
	const { ref, tabIndex } = useScrollRegionTabStop<HTMLElement>()
	return (
		<section
			ref={ref}
			tabIndex={tabIndex}
			aria-label={label}
			className={cn(TABLE_SCROLL_CLASS, SCROLL_REGION_FOCUS_CLASS)}
		>
			<table className={TABLE_CLASS} style={{ minWidth }}>
				{children}
			</table>
		</section>
	)
}

/**
 * Returns the Markdown block's options that render a markdown table as the app's table, in its card. The options
 * replace the block's own overrides, so inline code takes the pages' code style.
 */
export function toMarkdownTableOptions({
	label,
	minWidth,
}: {
	label: string
	minWidth: string
}): ComponentProps<typeof Markdown>["options"] {
	return {
		overrides: {
			// the card ends at the last row, and the docs page's own table styles stay off it
			table: ({ children }: { children: ReactNode }) => (
				<TableCard className={cn("sb-unstyled", ONE_PAGE_TABLE_CARD_CLASS)}>
					<ScrollingTable label={label} minWidth={minWidth}>
						{children}
					</ScrollingTable>
				</TableCard>
			),
			// every row draws its rule, and the head reads in the muted color
			thead: { props: { className: TABLE_HEAD_CLASS } },
			tr: { props: { className: "border-b" } },
			th: { props: { className: HEADER_CELL_CLASS } },
			td: { props: { className: BODY_CELL_CLASS } },
			code: { props: { style: CODE_STYLE } },
		},
	}
}
