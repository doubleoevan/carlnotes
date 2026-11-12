// the app's trend for a Dashboard page, one line per item drawn with Victory Native on Skia. a tap opens the sheet of
// the day under it
import type { DashboardTrend } from "@carlnotes/contracts/dashboards"
import {
	DASHBOARD_CHART_HEIGHTS,
	DASHBOARD_CHART_IMAGE_LABELS,
	type DashboardChartProps,
	toDashboardCountLines,
	toDashboardDayLabel,
	toDashboardSeriesColor,
	toDashboardTrendDayPoint,
} from "@carlnotes/core/lib/dashboardCharts"
import { CHART_AXIS_LABEL_SIZE, toChartTheme } from "@carlnotes/nightshift/chartTheme"
import { Karla_400Regular } from "@expo-google-fonts/karla"
import { useFont } from "@shopify/react-native-skia"
import { useRef } from "react"
import { type GestureResponderEvent, Pressable, useWindowDimensions, View } from "react-native"
import { CartesianChart, Line } from "victory-native"
import { useColorMode } from "@/theme"

// the day scale Victory reports for the trend's plot area
type ChartScale = { (value: number): number; invert: (pixel: number) => number }

/**
 * Draws one line per item over the range's days. A tap opens the sheet of the day under it, with each line's count
 * that day, most first, each opening its page.
 */
export function DashboardTrendChart({
	data,
	playFormat,
	seriesColors,
	onPointFocus,
}: DashboardChartProps<DashboardTrend>) {
	// the axes' colors in the color mode, their font at the reader's text size, and the plot's day scale
	const chartTheme = toChartTheme(useColorMode())
	const { fontScale } = useWindowDimensions()
	const font = useFont(Karla_400Regular, CHART_AXIS_LABEL_SIZE * fontScale)
	const xScaleRef = useRef<ChartScale | null>(null)

	// each line in its series color under a key of its place, and each day's row of the lines' counts
	const shownLines = data.lines.map((line, i) => ({
		line,
		yKey: `line${i}`,
		color: toDashboardSeriesColor(seriesColors, i),
	}))
	const dayRows: Record<string, number>[] = data.days.map((_, dayIndex) => ({
		dayIndex,
		...Object.fromEntries(shownLines.map(({ line, yKey }) => [yKey, line.counts[dayIndex] ?? 0])),
	}))

	// the day under a tap, whose sheet lists each line's count that day
	const handleDayPress = ({ nativeEvent }: GestureResponderEvent): void => {
		const xScale = xScaleRef.current
		if (!xScale) {
			return
		}
		const dayIndex = Math.min(data.days.length - 1, Math.max(0, Math.round(xScale.invert(nativeEvent.locationX))))
		onPointFocus(toDashboardTrendDayPoint({ trend: data, dayIndex, playFormat, seriesColors }))
	}

	// the lines over the axes, named for a screen reader with each line's total, under the tap's overlay
	const accessibilityLabel = [
		DASHBOARD_CHART_IMAGE_LABELS.trend,
		...shownLines.map(({ line }) => {
			const counts = {
				count: toSum(line.counts),
				podcastPlayCount: toSum(line.podcastPlayCounts ?? []),
				filmPlayCount: toSum(line.filmPlayCounts ?? []),
			}
			return `${line.title}: ${toDashboardCountLines(counts, playFormat).join(", ")}`
		}),
	].join(". ")
	const { axisLabel, axisLine, splitLine } = chartTheme.valueAxis
	return (
		<View
			accessible
			accessibilityRole="image"
			accessibilityLabel={accessibilityLabel}
			style={{ height: DASHBOARD_CHART_HEIGHTS.trend }}
		>
			{shownLines.length > 0 && (
				<CartesianChart
					data={dayRows}
					xKey="dayIndex"
					yKeys={shownLines.map(({ yKey }) => yKey)}
					padding={{ top: 16, right: 16, bottom: 8, left: 8 }}
					xAxis={{
						font,
						labelColor: axisLabel.color,
						lineColor: axisLine.lineStyle.color,
						tickCount: 4,
						formatXLabel: (dayIndex) => toDashboardDayLabel(data.days[Number(dayIndex)] ?? ""),
					}}
					yAxis={[
						{
							font,
							labelColor: axisLabel.color,
							lineColor: splitLine.lineStyle.color,
							formatYLabel: (count) => (Number.isInteger(Number(count)) ? String(count) : ""),
						},
					]}
					onScaleChange={(xScale) => {
						xScaleRef.current = xScale
					}}
				>
					{({ points }) =>
						shownLines.map(({ yKey, color }) => (
							<Line key={yKey} points={points[yKey] ?? []} color={color} strokeWidth={2} curveType="linear" />
						))
					}
				</CartesianChart>
			)}
			<Pressable accessible={false} onPress={handleDayPress} className="absolute inset-0" />
		</View>
	)
}

// the sum of a line's counts
function toSum(counts: number[]): number {
	return counts.reduce((sum, count) => sum + count, 0)
}
