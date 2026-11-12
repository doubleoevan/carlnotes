// the web's trend for a Dashboard page, drawn by ECharts: one line per item over the range's days. a hover shows the
// day's tooltip with every line's count, most first, with the line nearest the pointer highlighted on the chart and in
// bold in its color in the tooltip. a click pins the day's detail, whose lines open their pages
import type { DashboardTrend } from "@carlnotes/contracts/dashboards"
import {
	DASHBOARD_CHART_HEIGHTS,
	DASHBOARD_CHART_IMAGE_LABELS,
	type DashboardChartProps,
	type DashboardPoint,
	toDashboardDayLabel,
	toDashboardPointLineGroups,
	toDashboardSeriesColor,
	toDashboardTrendDayPoint,
} from "@carlnotes/core/lib/dashboardCharts"
import { cn } from "@carlnotes/nightshift/classNames"
import { type EChartsCoreOption, type EChartsType, format } from "echarts/core"
import { useMemo, useRef, useState } from "react"
import { toSwatchHtml, toTooltipFrameHtml } from "./chartTooltipHtml"
import { EChart, type EChartPointerHandler } from "./EChart"
import { PointDetailPanel } from "./PointDetailPanel"

// the pinned detail's width in pixels
const PINNED_DAY_WIDTH = 320

// the hover tooltip's class, which a pinned day hides
const HOVER_TOOLTIP_CLASS = "dashboard-trend-tooltip"

// a pinned day: the trend it was pinned on, its point, the line nearest the click, and the detail's left edge in pixels
type PinnedDay = { trend: DashboardTrend; dayPoint: DashboardPoint; nearestLineKey: string | null; left: number }

/**
 * Draws one line per item over the range's days, with the day's tooltip on a hover and its pinned detail on a click.
 */
export function DashboardTrendChart({
	data,
	playFormat,
	seriesColors,
	onItemPress,
}: DashboardChartProps<DashboardTrend>) {
	// the line nearest the pointer, which the tooltip draws in bold in its color, and the pinned day, which a new range
	// closes
	const nearestLineKeyRef = useRef<string | null>(null)
	const [pinnedDay, setPinnedDay] = useState<PinnedDay | null>(null)
	const shownPinnedDay = pinnedDay?.trend === data ? pinnedDay : null

	// the axes, the day's tooltip, and each line in its series color
	const option = useMemo(
		(): EChartsCoreOption => ({
			grid: { left: 8, right: 16, top: 16, bottom: 8, outerBoundsMode: "same", outerBoundsContain: "axisLabel" },
			xAxis: { type: "category", data: data.days.map(toDashboardDayLabel), boundaryGap: false },
			yAxis: { type: "value", minInterval: 1 },
			tooltip: {
				trigger: "axis",
				confine: true,
				className: HOVER_TOOLTIP_CLASS,
				axisPointer: { type: "line" },
				formatter: (params: { dataIndex: number }[]) => {
					const dayIndex = params[0]?.dataIndex ?? 0
					const dayPoint = toDashboardTrendDayPoint({ trend: data, dayIndex, playFormat, seriesColors })
					const { totalLine } = toDashboardPointLineGroups(dayPoint, playFormat)
					return toDayTooltipHtml({ dayPoint, totalLine, nearestLineKey: nearestLineKeyRef.current })
				},
			},
			series: data.lines.map((line, i) => {
				const color = toDashboardSeriesColor(seriesColors, i)
				return {
					type: "line",
					name: line.title,
					data: line.counts,
					showSymbol: false,
					symbolSize: 8,
					lineStyle: { width: 2, color },
					itemStyle: { color },
					emphasis: { focus: "series" },
				}
			}),
		}),
		[data, playFormat, seriesColors],
	)

	// a hover highlights the line nearest the pointer, a click pins its day, and leaving the chart clears the highlight
	const pointerEvents = useMemo((): Record<string, EChartPointerHandler> => {
		const handleMouseMove: EChartPointerHandler = (pixel, chart) => {
			const nearestLine = toNearestLine(data, pixel, chart)
			const nearestLineKey = nearestLine?.key ?? null
			if (nearestLineKey === nearestLineKeyRef.current) {
				return
			}
			nearestLineKeyRef.current = nearestLineKey
			chart.dispatchAction({ type: "downplay" })
			if (nearestLine) {
				chart.dispatchAction({ type: "highlight", seriesIndex: nearestLine.seriesIndex })
			}
		}
		return {
			mousemove: handleMouseMove,
			click: (pixel, chart) => {
				const nearestLine = toNearestLine(data, pixel, chart)
				if (!nearestLine) {
					return
				}
				// the day's detail centered on its day, kept inside the chart's box
				const { dayIndex } = nearestLine
				const dayX = chart.convertToPixel({ xAxisIndex: 0 }, dayIndex) as number
				const left = Math.max(0, Math.min(dayX - PINNED_DAY_WIDTH / 2, chart.getWidth() - PINNED_DAY_WIDTH))
				setPinnedDay({
					trend: data,
					dayPoint: toDashboardTrendDayPoint({ trend: data, dayIndex, playFormat, seriesColors }),
					nearestLineKey: nearestLine.key,
					left,
				})
			},
			globalout: (_pixel, chart) => {
				nearestLineKeyRef.current = null
				chart.dispatchAction({ type: "downplay" })
			},
		}
	}, [data, playFormat, seriesColors])

	// the chart, with its hover tooltip hidden while a day is pinned
	const handleClosePinnedDay = (): void => setPinnedDay(null)
	return (
		<div className={cn("relative", shownPinnedDay && "[&_.dashboard-trend-tooltip]:hidden!")}>
			{/* the chart */}
			<EChart
				option={option}
				height={DASHBOARD_CHART_HEIGHTS.trend}
				label={DASHBOARD_CHART_IMAGE_LABELS.trend}
				pointerEvents={pointerEvents}
			/>

			{/* the pinned day's detail over the chart: its day, then each line's count, most first, opening its page, with
			the nearest line in bold in its color */}
			{shownPinnedDay && (
				<PointDetailPanel
					point={shownPinnedDay.dayPoint}
					playFormat={playFormat}
					highlightedKey={shownPinnedDay.nearestLineKey}
					onItemPress={onItemPress}
					onClose={handleClosePinnedDay}
					className="top-2 max-w-full"
					style={{ left: shownPinnedDay.left, width: PINNED_DAY_WIDTH }}
				/>
			)}
		</div>
	)
}

// the line on the day under the pointer whose count sits nearest it, or null outside the plot
function toNearestLine(
	trend: DashboardTrend,
	pixel: [number, number],
	chart: EChartsType,
): { key: string; seriesIndex: number; dayIndex: number } | null {
	if (!chart.containPixel({ gridIndex: 0 }, pixel)) {
		return null
	}

	// the day under the pointer, then the line whose count that day sits nearest the pointer's height
	const [dayValue, countValue] = chart.convertFromPixel({ gridIndex: 0 }, pixel) as [number, number]
	const dayIndex = Math.min(trend.days.length - 1, Math.max(0, Math.round(dayValue)))
	const nearestLine = trend.lines
		.map((line, seriesIndex) => ({
			key: line.key,
			seriesIndex,
			distance: Math.abs((line.counts[dayIndex] ?? 0) - countValue),
		}))
		.sort((first, second) => first.distance - second.distance)[0]
	return nearestLine ? { key: nearestLine.key, seriesIndex: nearestLine.seriesIndex, dayIndex } : null
}

// the day's tooltip html: the day in bold, then each line's color, title, and count, the nearest line in bold in its
// color, and the day's total at the right, every title escaped
function toDayTooltipHtml({
	dayPoint,
	totalLine,
	nearestLineKey,
}: {
	dayPoint: DashboardPoint
	totalLine: string | null
	nearestLineKey: string | null
}): string {
	const rows = (dayPoint.dayLines ?? []).map((dayLine) => {
		const { color } = dayLine
		const nearestStyle = dayLine.key === nearestLineKey ? `font-weight:600;color:${color};` : ""
		return [
			`<div style="display:flex;align-items:center;gap:8px;${nearestStyle}">`,
			toSwatchHtml(color),
			`<span style="flex:1;max-width:240px;overflow:hidden;text-overflow:ellipsis">${format.encodeHTML(dayLine.title)}</span>`,
			`<span>${format.encodeHTML(dayLine.countLine)}</span>`,
			"</div>",
		].join("")
	})
	return toTooltipFrameHtml(dayPoint.title, rows, totalLine)
}
