import type { RowSort } from "@carlnotes/core/hooks/useRowSort"
import { cn } from "@carlnotes/nightshift/classNames"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react-native"
import { Alert } from "react-native"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

/**
 * Draws a table column's shared sorting state with the web's direction icons.
 */
export function SortableHeader({
	sort,
	sortKey,
	label,
	className,
	tooltip,
}: {
	sort: RowSort
	sortKey: string
	label: string
	className?: string
	tooltip?: string
}) {
	// expose the column's direction to readers and assistive technology
	const isActive = sort.sortKey === sortKey
	const SortIcon = isActive ? (sort.isDescending ? ArrowDown : ArrowUp) : ChevronsUpDown
	const direction = isActive ? (sort.isDescending ? "descending" : "ascending") : "unsorted"
	return (
		<Button
			variant="ghost"
			className={cn("min-h-11 justify-start gap-1 px-0", className)}
			accessibilityLabel={`Sort by ${label.toLowerCase()}`}
			accessibilityValue={{ text: direction }}
			accessibilityHint={tooltip}
			onLongPress={tooltip ? () => Alert.alert(label, tooltip) : undefined}
			onPress={() => sort.toggleSort(sortKey)}
		>
			<Text className="text-sm font-normal text-muted-foreground">{label}</Text>
			<Icon as={SortIcon} className={cn("size-3 text-muted-foreground", !isActive && "opacity-40")} />
		</Button>
	)
}
