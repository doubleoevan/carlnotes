import { toDotSeparatedText } from "@carlnotes/contracts/text"
import type { SourceResult } from "@carlnotes/contracts/topics"
import {
	SourceResultsChart as SharedSourceResultsChart,
	type SourceResultsChartComponents,
	type SourceResultsChartProps,
} from "@carlnotes/core/components/SourceResultsChart"
import { toSourceResultDetailParts, toSourceResultStatusLine } from "@carlnotes/core/lib/sourceResults"
import { cn } from "@carlnotes/nightshift/classNames"
import { fontFamilies } from "@carlnotes/nightshift/typography"
import { Trash2 } from "lucide-react-native"
import type { ReactNode } from "react"

export type { SourceRemoval } from "@carlnotes/core/components/SourceResultsChart"

import { Pressable, useWindowDimensions, View } from "react-native"
import { Button, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { toTypeRoleStyle } from "@/typeRoleStyles"

/**
 * Renders the shared Source chart with native touch targets and text scaling.
 */
export function SourceResultsChart(props: SourceResultsChartProps) {
	return <SharedSourceResultsChart {...props} components={SOURCE_RESULTS_COMPONENTS} />
}

// native layout preserves the shared chart content and row interactions
const SOURCE_RESULTS_COMPONENTS: SourceResultsChartComponents = {
	Frame: ({ heading, dateLabel, summary, children }) => (
		<View className="mt-4">
			<View className="flex-row items-baseline justify-between gap-3">
				<Text
					accessibilityRole="header"
					style={{ ...toTypeRoleStyle("body"), fontFamily: fontFamilies.display.name }}
					className="font-display text-muted-foreground"
				>
					{heading}
				</Text>
				<Text className="text-xs text-muted-foreground">{dateLabel}</Text>
			</View>
			<View className="mt-0.5 flex-row flex-wrap items-start gap-x-3 gap-y-1">
				<Text className="min-w-44 flex-1 text-xs text-muted-foreground">{summary}</Text>
				<SourceResultsLegend />
			</View>
			<View className="-mx-2 mt-2 gap-0.5">{children}</View>
		</View>
	),
	Row: SourceResultRow,
	EarlierRow: ({ detail, ...props }) => (
		<ChartRow {...props} foundCount={0} keptCount={0}>
			<Text className="text-xs text-muted-foreground">{detail}</Text>
		</ChartRow>
	),
}

// identify the fills without repeating the row's accessible counts
function SourceResultsLegend() {
	return (
		<View className="flex-row gap-3" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
			{["kept", "read"].map((label) => (
				<View key={label} className="flex-row items-center gap-1">
					<View className={cn("size-2.5 rounded-sm", label === "kept" ? "bg-primary" : "bg-separator-strong")} />
					<Text className="text-xs text-muted-foreground">{label}</Text>
				</View>
			))}
		</View>
	)
}

// show the failure state on an empty track and reveal only details the api returned
function SourceResultRow({
	row,
	maxFoundCount,
	isOpen,
	onToggle,
	onRemoveSource,
}: {
	row: SourceResult
	maxFoundCount: number
	isOpen: boolean
	onToggle: () => void
	onRemoveSource?: (sourceId: string, label: string) => void
}) {
	// use the same detail text and failure labels as the web
	const isFailed = row.status === "failed"
	const statusLine = toSourceResultStatusLine(row)
	return (
		<ChartRow
			label={row.label}
			countLabel={isFailed ? "failed" : `${row.keptCount} / ${row.foundCount}`}
			screenReaderLabel={
				isFailed ? `${row.label}, failed` : `${row.label}, ${row.keptCount} kept of ${row.foundCount} read`
			}
			foundCount={isFailed ? 0 : row.foundCount}
			keptCount={isFailed ? 0 : row.keptCount}
			maxFoundCount={maxFoundCount}
			isFailed={isFailed}
			isOpen={isOpen}
			onToggle={onToggle}
		>
			<View className="min-w-0 flex-1">
				<Text className="text-xs text-muted-foreground">
					<Text className="text-xs font-semibold">{row.label} </Text>
					{toDotSeparatedText(toSourceResultDetailParts(row))}
				</Text>
				{statusLine ? <Text className="text-xs text-muted-foreground">{statusLine}</Text> : null}
			</View>
			{onRemoveSource ? (
				<Button
					variant="ghost"
					size="icon"
					accessibilityLabel={`Remove source ${row.label}`}
					onPress={() => onRemoveSource(row.sourceId, row.label)}
				>
					<Icon as={Trash2} className="size-4 text-destructive" />
				</Button>
			) : null}
		</ChartRow>
	)
}

// expose the full label and expanded state while keeping the visual columns aligned
function ChartRow({
	label,
	countLabel,
	screenReaderLabel,
	foundCount,
	keptCount,
	maxFoundCount,
	isFailed,
	isOpen,
	onToggle,
	children,
}: {
	label: string
	countLabel: string
	screenReaderLabel: string
	foundCount: number
	keptCount: number
	maxFoundCount: number
	isFailed?: boolean
	isOpen: boolean
	onToggle: () => void
	children: ReactNode
}) {
	const { fontScale } = useWindowDimensions()
	return (
		<View>
			<Pressable
				accessibilityRole="button"
				accessibilityLabel={screenReaderLabel}
				accessibilityState={{ expanded: isOpen }}
				onPress={onToggle}
				hitSlop={toTouchTargetHitSlop(44)}
				className={cn(
					"min-h-11 flex-row items-center gap-3 rounded-md px-2 py-1.5 active:bg-accent",
					isOpen && "bg-accent",
				)}
			>
				<Text numberOfLines={1} className="w-2/5 text-sm text-link">
					{label}
				</Text>
				<SourceResultBar foundCount={foundCount} keptCount={keptCount} maxFoundCount={maxFoundCount} />
				<Text
					style={{ width: 60 * fontScale }}
					className={cn("text-right text-sm tabular-nums", isFailed && "text-destructive")}
				>
					{countLabel}
				</Text>
			</Pressable>
			{isOpen ? <View className="flex-row items-center gap-2 px-2 pt-1 pb-2">{children}</View> : null}
		</View>
	)
}

// draw read and kept from the same edge, with a visible minimum for a kept finding
function SourceResultBar({
	foundCount,
	keptCount,
	maxFoundCount,
}: {
	foundCount: number
	keptCount: number
	maxFoundCount: number
}) {
	return (
		<View className="relative h-2 flex-1 overflow-hidden rounded-full bg-muted" accessibilityElementsHidden>
			{foundCount > 0 && maxFoundCount > 0 ? (
				<>
					<View
						className="absolute inset-y-0 left-0 rounded-full bg-separator-strong"
						style={{ width: `${(foundCount / maxFoundCount) * 100}%` }}
					/>
					{keptCount > 0 ? (
						<View
							className="absolute inset-y-0 left-0 rounded-full bg-primary"
							style={{ width: `${(keptCount / maxFoundCount) * 100}%`, minWidth: 6 }}
						/>
					) : null}
				</>
			) : null}
		</View>
	)
}
