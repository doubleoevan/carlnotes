// the app's top ten for a Dashboard page, drawn as native rows. a tap on a row opens its item's sheet
import type { DashboardBar } from "@carlnotes/contracts/dashboards"
import {
	DASHBOARD_CHART_IMAGE_LABELS,
	type DashboardChartProps,
	toDashboardBarPoint,
	toDashboardCountColors,
	toDashboardCountLines,
} from "@carlnotes/core/lib/dashboardCharts"
import { Pressable, View } from "react-native"
import { Text } from "@/components/primitives/text"

/**
 * Draws the top ten as rows, largest on top, each with its title, its bar, and its count, with the podcast and film
 * plays side by side in one bar under Both.
 */
export function DashboardBarChart({
	data,
	playFormat,
	seriesColors,
	onPointFocus,
}: DashboardChartProps<DashboardBar[]>) {
	// the largest count, whose bar fills the row, and the colors of a bar's counts
	const largestCount = Math.max(1, ...data.map(({ count }) => count))
	const countColors = toDashboardCountColors(playFormat, seriesColors)
	return (
		<View accessibilityLabel={DASHBOARD_CHART_IMAGE_LABELS.bar} className="gap-1">
			{data.map((bar) => {
				// the bar's segments: the podcast and film plays under Both, else its one count, films in their color
				const segmentCounts = playFormat === "both" ? [bar.podcastPlayCount ?? 0, bar.filmPlayCount ?? 0] : [bar.count]
				const segments = segmentCounts.map((count, i) => ({ count, color: countColors[i] }))
				return (
					<Pressable
						key={bar.path}
						accessibilityRole="button"
						accessibilityLabel={[bar.title, ...toDashboardCountLines(bar, playFormat)].join(", ")}
						onPress={() => onPointFocus(toDashboardBarPoint(bar, countColors))}
						className="min-h-11 flex-row items-center gap-2 active:opacity-75"
					>
						<Text numberOfLines={2} className="w-2/5 text-xs text-muted-foreground">
							{bar.title}
						</Text>
						<View className="h-5 flex-1 flex-row">
							{segments.map(({ count, color }, i) => (
								<View
									// biome-ignore lint/suspicious/noArrayIndexKey: a bar's segments are fixed and in order
									key={i}
									className={i === segments.length - 1 ? "rounded-r" : undefined}
									style={{ width: `${(count / largestCount) * 100}%`, backgroundColor: color }}
								/>
							))}
						</View>
						<Text className="min-w-6 text-right text-xs text-muted-foreground">{bar.count}</Text>
					</Pressable>
				)
			})}
		</View>
	)
}
