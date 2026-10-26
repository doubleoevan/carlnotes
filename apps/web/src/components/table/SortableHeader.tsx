import type { RowSort } from "@carlnotes/core/hooks/useRowSort"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"

export { type RowSort, type SortValue, toSortedRows, useRowSort } from "@carlnotes/core/hooks/useRowSort"

/**
 * A clickable column header that drives the sort. an arrow on the active column, a faint hint on the rest.
 */
export function SortableHeader({
	sort,
	sortKey,
	label,
	tooltip,
	className,
}: {
	sort: RowSort
	sortKey: string
	label: string
	tooltip?: string
	className?: string
}) {
	const isActive = sort.sortKey === sortKey
	// the header button, optionally wrapped in a tooltip explaining the shortened label
	const headerButton = (
		<button
			type="button"
			onClick={() => sort.toggleSort(sortKey)}
			className="hover:text-foreground inline-flex items-center gap-1"
		>
			{label}
			{isActive ? (
				sort.isDescending ? (
					<ArrowDown className="size-3" />
				) : (
					<ArrowUp className="size-3" />
				)
			) : (
				<ChevronsUpDown className="size-3 opacity-40" />
			)}
		</button>
	)
	return (
		<th className={className}>
			{tooltip ? (
				<Tooltip>
					<TooltipTrigger asChild>{headerButton}</TooltipTrigger>
					<TooltipContent>{tooltip}</TooltipContent>
				</Tooltip>
			) : (
				headerButton
			)}
		</th>
	)
}
