// the web's bar chart for a Dashboard page, drawn by ECharts. a hover shows the bar's detail in the tooltip, and a click
// on a bar or its label opens its item's page
import type { DashboardBar } from "@carlnotes/contracts/dashboards"
import {
	DASHBOARD_CHART_IMAGE_LABELS,
	type DashboardChartProps,
	toDashboardBarPoint,
	toDashboardCountColors,
} from "@carlnotes/core/lib/dashboardCharts"
import { CHART_AXIS_LABEL_SIZE, toChartTheme } from "@carlnotes/nightshift/chartTheme"
import { type EChartsCoreOption, format } from "echarts/core"
import { useMemo, useState } from "react"
import { useColorMode } from "@/hooks/useColorMode"
import { toPointTooltipHtml } from "./chartTooltipHtml"
import { EChart, type EChartEventHandler } from "./EChart"
import { PlacedTitleTooltip } from "./PlacedTitleTooltip"

// the bar chart's height per bar
const BAR_HEIGHT = 32

// the longest a bar's label runs before it is cut
const BAR_LABEL_WIDTH = 160

// the widest chart, in pixels, that counts its axis in about three steps instead of five, so a phone's labels never
// touch
const NARROW_CHART_WIDTH = 480
const NARROW_CHART_OPTION = { xAxis: { splitNumber: 3 } }

/**
 * Draws the top ten as horizontal bars, largest on top, each with its count at its end, with the podcast and film plays
 * stacked under Both. Film plays take the second series color under Films too, as under Both.
 */
export function DashboardBarChart({
	data,
	playFormat,
	seriesColors,
	onItemPress,
}: DashboardChartProps<DashboardBar[]>) {
	const colorMode = useColorMode()
	const option = useMemo((): EChartsCoreOption => {
		// largest on top, which a category axis draws from the bottom, and the colors of a bar's segments
		const bars = data.toReversed()
		const isSplit = playFormat === "both"
		const countColors = toDashboardCountColors(playFormat, seriesColors)
		const [countColor, filmColor] = countColors

		// the bar's whole count at its end in the axis labels' style, on the last series so a split bar shows its total
		const countLabel = {
			show: true,
			position: "right",
			color: toChartTheme(colorMode).valueAxis.axisLabel.color,
			textBorderWidth: 0,
			fontSize: CHART_AXIS_LABEL_SIZE,
			formatter: ({ dataIndex }: { dataIndex: number }) => String(bars[dataIndex]?.count ?? ""),
		}

		// one series: its name, its values, its color, and its count label if it shows one
		const toBarSeries = (name: string, values: number[], color: string | undefined, label?: typeof countLabel) => ({
			type: "bar",
			name,
			stack: "plays",
			data: values,
			itemStyle: { color, borderRadius: isSplit ? 0 : [0, 4, 4, 0] },
			barMaxWidth: 20,
			cursor: "pointer",
			label,
		})

		// one series, or the podcast and film plays stacked in one bar. films keep their color in either
		const series = isSplit
			? [
					toBarSeries(
						"Podcast plays",
						bars.map(({ podcastPlayCount = 0 }) => podcastPlayCount),
						countColor,
					),
					toBarSeries(
						"Film plays",
						bars.map(({ filmPlayCount = 0 }) => filmPlayCount),
						filmColor,
						countLabel,
					),
				]
			: [
					toBarSeries(
						"Count",
						bars.map(({ count }) => count),
						countColor,
						countLabel,
					),
				]
		// the chart, with fewer counts along its axis while it is narrow
		const baseOption = {
			grid: { left: 8, right: 40, top: 8, bottom: 8, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
			xAxis: { type: "value", minInterval: 1 },
			yAxis: {
				type: "category",
				data: bars.map(({ title }) => title),
				axisLabel: { width: BAR_LABEL_WIDTH, overflow: "truncate" },
				triggerEvent: true,
				axisTick: { show: false },
			},
			tooltip: {
				trigger: "axis",
				axisPointer: { type: "shadow" },
				confine: true,
				formatter: (params: { dataIndex: number }[]) => {
					const bar = bars[params[0]?.dataIndex ?? -1]
					return bar ? toPointTooltipHtml(toDashboardBarPoint(bar, countColors), playFormat) : ""
				},
			},
			series,
		}
		return { baseOption, media: [{ query: { maxWidth: NARROW_CHART_WIDTH }, option: NARROW_CHART_OPTION }] }
	}, [colorMode, data, playFormat, seriesColors])

	// a click on a bar or its label opens its item, and a hover on a cut-off label shows its full title
	const [hoveredLabel, setHoveredLabel] = useState<{ title: string; x: number; y: number } | null>(null)
	const events = useMemo((): Record<string, EChartEventHandler> => {
		const labelFont = `${CHART_AXIS_LABEL_SIZE}px ${toChartTheme("light").textStyle.fontFamily}`
		return {
			click: ({ dataIndex, componentType, value }) => {
				const bar = componentType === "yAxis" ? data.find(({ title }) => title === value) : data.at(-1 - dataIndex)
				if (bar) {
					onItemPress(bar.path)
				}
			},
			mouseover: ({ componentType, value, event }) => {
				const isCutOff = typeof value === "string" && format.truncateText(value, BAR_LABEL_WIDTH, labelFont) !== value
				if (componentType === "yAxis" && isCutOff && event) {
					setHoveredLabel({ title: value, x: event.offsetX, y: event.offsetY })
				}
			},
			mouseout: ({ componentType }) => {
				if (componentType === "yAxis") {
					setHoveredLabel(null)
				}
			},
		}
	}, [data, onItemPress])
	return (
		<div className="relative">
			{/* the chart */}
			<EChart
				option={option}
				height={data.length * BAR_HEIGHT + 24}
				label={DASHBOARD_CHART_IMAGE_LABELS.bar}
				events={events}
			/>

			{/* a cut-off label's full title at the pointer */}
			{hoveredLabel && <PlacedTitleTooltip {...hoveredLabel} />}
		</div>
	)
}
