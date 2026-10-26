import {
	TablePagination as SharedTablePagination,
	type TablePaginationComponents,
} from "@carlnotes/core/components/TablePagination"
import type { PaginationState } from "@carlnotes/core/hooks/usePagination"
import { cn } from "@carlnotes/nightshift/classNames"
import { paginationClasses } from "@carlnotes/nightshift/pagination"
import { ChevronLeft, ChevronRight } from "lucide-react-native"
import { View } from "react-native"
import { useSafeAreaInsets } from "react-native-safe-area-context"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/primitives/select"
import { Text } from "@/components/primitives/text"

/**
 * Renders the shared web table footer with an anchored native dropdown.
 */
export function TablePagination({ pagination }: { pagination: PaginationState }) {
	return <SharedTablePagination pagination={pagination} components={TABLE_PAGINATION_COMPONENTS} />
}

// native layout and touch targets surround the shared footer composition
const TABLE_PAGINATION_COMPONENTS: TablePaginationComponents = {
	Root: ({ children }) => (
		<View className="mt-2 flex-row flex-wrap items-center justify-between gap-2">{children}</View>
	),
	Rows: ({ children }) => <View className="flex-row items-center gap-1.5">{children}</View>,
	Text: ({ children }) => (
		<Text className="text-xs text-muted-foreground" accessibilityLiveRegion="polite">
			{children}
		</Text>
	),
	Pager: ({ children }) => <View className="flex-row items-center gap-1.5">{children}</View>,
	PageButton: ({ direction, label, isDisabled, onPress }) => (
		<Button
			variant="outline"
			size="icon-lg"
			className={cn(paginationClasses.idle.box, "shadow-none active:bg-card disabled:opacity-40")}
			accessibilityLabel={label}
			disabled={isDisabled}
			onPress={onPress}
		>
			<Icon
				as={direction === "previous" ? ChevronLeft : ChevronRight}
				className={cn("size-3.5", paginationClasses.idle.text)}
			/>
		</Button>
	),
	Select: function PageSizeSelect({ value, options, onValueChange }) {
		const insets = useSafeAreaInsets()
		return (
			<Select
				value={{ value: String(value), label: String(value) }}
				onValueChange={(option) => {
					if (option) {
						onValueChange(Number(option.value))
					}
				}}
			>
				<SelectTrigger
					accessibilityLabel={`Rows per page: ${value}`}
					className={cn("min-w-12 justify-center gap-1 px-2", paginationClasses.idle.box)}
				>
					<SelectValue placeholder="Rows" className={paginationClasses.idle.text} />
				</SelectTrigger>
				<SelectContent insets={insets} align="start">
					{options.map((pageSize) => (
						<SelectItem
							key={pageSize}
							value={String(pageSize)}
							label={String(pageSize)}
							accessibilityLabel={`${pageSize} rows`}
						/>
					))}
				</SelectContent>
			</Select>
		)
	},
}
