// the table a row story renders in: the card, the scroll box, and the table, as the app's tables wrap their rows
import type { Decorator } from "@storybook/tanstack-react"
import type { ReactNode } from "react"
import { TableCard } from "@/components/table/TableCard"
import { TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

/**
 * Renders table rows in the card, the scroll box, and the table, under a header row if one is given. A table with a
 * header row alone renders no rows.
 */
export function StoryTable({
	className,
	cardClassName,
	head,
	children,
}: {
	// classes the table adds, such as a minimum width
	className?: string
	// classes the card adds, such as ONE_PAGE_TABLE_CARD_CLASS for a table that fits on one page
	cardClassName?: string
	// the header row, if the rows sit under column labels
	head?: ReactNode
	children?: ReactNode
}) {
	return (
		<TableCard className={cardClassName}>
			<div className={TABLE_SCROLL_CLASS}>
				<table className={cn(TABLE_CLASS, className)}>
					{head && <thead className={TABLE_HEAD_CLASS}>{head}</thead>}
					{children && <tbody>{children}</tbody>}
				</table>
			</div>
		</TableCard>
	)
}

/**
 * Returns a decorator that renders a row story in a table's body, as its table renders it, with the table's own classes,
 * such as the minimum width that keeps an opened subtable from squeezing its columns.
 */
export function toTableBodyDecorator(tableClassName?: string): Decorator {
	return (Story) => (
		<StoryTable className={tableClassName}>
			<Story />
		</StoryTable>
	)
}
