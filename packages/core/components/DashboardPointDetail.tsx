// the detail of one chart point: its title, its counts with the kind of play on Podcast Dashboard, a pin's items or a
// trend day's lines with their pages in a box that scrolls a long list, and its page's button
import type { DashboardPlayFormat } from "@carlnotes/contracts/dashboards"
import type { ComponentType, ReactNode } from "react"
import { type DashboardPoint, toDashboardPointLineGroups } from "../lib/dashboardCharts"

// one item of a pin or a trend day: its title, its count beside it, a trend line's swatch color, whether it is
// highlighted, and opening its page, none for Other
type DashboardPointDetailItemProps = {
	children: string
	countLine: string
	color?: string
	isHighlighted: boolean
	onPress?: () => void
}

// each app's elements: the title, one line with its swatch's color if it has one, the box that scrolls a long list of
// items, one item, the total at the right after the lines, or at the left for a word, and the button that opens the
// point's page, whose accessible label names the point
export type DashboardPointDetailElements = {
	Title: ComponentType<{ children: string }>
	Line: ComponentType<{ children: string; color?: string }>
	Items: ComponentType<{ children: ReactNode }>
	Item: ComponentType<DashboardPointDetailItemProps>
	Total: ComponentType<{ children: string; isStartAligned?: boolean }>
	OpenButton: ComponentType<{ children: string; label: string; onPress: () => void }>
}

// the point, the format a podcast chart counts, the key of the highlighted item if any, and opening its page
export type DashboardPointDetailProps = {
	point: DashboardPoint
	playFormat: DashboardPlayFormat | null
	highlightedKey?: string | null
	onItemPress: (path: string) => void
}

/**
 * Shows a point's title and lines, a pin's items or a trend day's lines with their pages, the total after them, then
 * a button to its page if it has one. Other has no page, so its item opens nothing.
 */
export function DashboardPointDetail({
	point,
	playFormat,
	highlightedKey = null,
	onItemPress,
	elements: { Title, Line, Items, Item, Total, OpenButton },
}: DashboardPointDetailProps & { elements: DashboardPointDetailElements }) {
	// the point's page, and its lines grouped for the detail
	const { path } = point
	const { lines, itemLines, totalLine } = toDashboardPointLineGroups(point, playFormat)
	return (
		<>
			<Title>{point.title}</Title>
			{lines.map(({ line, color }) => (
				<Line key={line} color={color}>
					{line}
				</Line>
			))}
			{itemLines.length > 0 && (
				<Items>
					{itemLines.map(({ key, title, countLine, color, path: itemPath }) => (
						<Item
							key={key}
							countLine={countLine}
							color={color}
							isHighlighted={key === highlightedKey}
							onPress={itemPath ? () => onItemPress(itemPath) : undefined}
						>
							{title}
						</Item>
					))}
				</Items>
			)}
			{totalLine && <Total isStartAligned={point.isWord}>{totalLine}</Total>}
			{path && (
				<OpenButton label={`Open ${point.title}`} onPress={() => onItemPress(path)}>
					Open
				</OpenButton>
			)}
		</>
	)
}
