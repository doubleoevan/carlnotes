import { type TableColumnWidths, toTableColumnWidths } from "@carlnotes/core/lib/tableColumns"
import { cn } from "@carlnotes/nightshift/classNames"
import { createContext, type ReactNode, useContext, useRef, useState } from "react"
import { Animated, useWindowDimensions, View } from "react-native"
import { ScrollIndicator } from "@/components/common/ScrollIndicator"

// one horizontal offset pins every first cell, including headings and totals
const TableScrollContext = createContext<{
	widths: TableColumnWidths
	firstColumn: string
	scrollOffset: Animated.Value
	hasOverflow: boolean
} | null>(null)

/**
 * Scrolls a table as one layout with its first column fixed and an orange overflow indicator.
 */
export function TableScroll({ children, columns }: { children: ReactNode; columns: TableColumnWidths }) {
	// retain native-driven motion without rerendering rows on every scroll event
	const scrollOffset = useRef(new Animated.Value(0)).current
	const [viewportWidth, setViewportWidth] = useState(0)
	const { fontScale } = useWindowDimensions()
	const widths = toTableColumnWidths({ columns, viewportWidth, fontScale })
	const contentWidth = Object.values(widths).reduce((total, width) => total + width, 0)
	const hasOverflow = contentWidth > viewportWidth + 1
	return (
		<TableScrollContext.Provider
			value={{ widths, firstColumn: Object.keys(columns)[0] ?? "", scrollOffset, hasOverflow }}
		>
			<View className="relative" onLayout={(event) => setViewportWidth(event.nativeEvent.layout.width)}>
				{/* keep row height intrinsic so wrapped text aligns across the frozen and scrolling cells */}
				<Animated.ScrollView
					horizontal
					bounces={false}
					removeClippedSubviews={false}
					showsHorizontalScrollIndicator={false}
					scrollEventThrottle={16}
					keyboardShouldPersistTaps="handled"
					contentContainerStyle={{ paddingBottom: hasOverflow ? 10 : 0 }}
					onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollOffset } } }], {
						useNativeDriver: true,
					})}
				>
					<View style={{ width: contentWidth }}>{children}</View>
				</Animated.ScrollView>
				<ScrollIndicator
					scrollOffset={scrollOffset}
					viewportSize={viewportWidth}
					contentSize={contentWidth}
					isHorizontal
				/>
			</View>
		</TableScrollContext.Provider>
	)
}

/**
 * Draws a column cell, keeping the first column above the scrolling cells without duplicating its content.
 */
export function TableCell({
	children,
	column,
	className,
}: {
	children: ReactNode
	column: string
	className?: string
}) {
	// translate the first cell back by the table's scroll distance
	const table = useContext(TableScrollContext)
	if (!table) {
		throw new Error("TableCell requires TableScroll")
	}
	const isFixed = column === table.firstColumn && table.hasOverflow
	return (
		<Animated.View
			className={cn("justify-center px-4 py-2", isFixed && "z-10 border-r border-separator bg-card", className)}
			style={{ width: table.widths[column], transform: isFixed ? [{ translateX: table.scrollOffset }] : undefined }}
		>
			{children}
		</Animated.View>
	)
}
