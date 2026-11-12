// the web's pie for a Dashboard page, drawn by ECharts. a hover shows the slice's detail in the tooltip, and a click on
// a slice opens its item's page
import type { DashboardSlice } from "@carlnotes/contracts/dashboards"
import {
	DASHBOARD_CHART_HEIGHTS,
	DASHBOARD_CHART_IMAGE_LABELS,
	DASHBOARD_PIE_RADII,
	type DashboardChartProps,
	toDashboardSeriesColor,
	toDashboardSlicePoint,
} from "@carlnotes/core/lib/dashboardCharts"
import type { EChartsCoreOption } from "echarts/core"
import { useMemo } from "react"
import { toPointTooltipHtml } from "./chartTooltipHtml"
import { EChart, type EChartEventHandler } from "./EChart"

/**
 * Draws each item's share of the count as a donut.
 */
export function DashboardPieChart({
	data,
	playFormat,
	seriesColors,
	onItemPress,
}: DashboardChartProps<DashboardSlice[]>) {
	// the slice's tooltip, and each slice in its series color
	const option = useMemo(
		(): EChartsCoreOption => ({
			tooltip: {
				trigger: "item",
				confine: true,
				formatter: ({ dataIndex }: { dataIndex: number }) => {
					const slice = data[dataIndex]
					return slice ? toPointTooltipHtml(toDashboardSlicePoint(slice), playFormat) : ""
				},
			},
			series: [
				{
					type: "pie",
					radius: [`${DASHBOARD_PIE_RADII.inner}%`, `${DASHBOARD_PIE_RADII.outer}%`],
					label: { show: false },
					itemStyle: { borderWidth: 2, borderColor: "transparent" },
					data: data.map((slice, i) => ({
						value: slice.count,
						name: slice.title,
						itemStyle: { color: toDashboardSeriesColor(seriesColors, i) },
					})),
				},
			],
		}),
		[data, playFormat, seriesColors],
	)

	// a click on a slice opens its item, and Other has no page
	const events = useMemo(
		(): Record<string, EChartEventHandler> => ({
			click: ({ dataIndex }) => {
				const path = data[dataIndex]?.path
				if (path) {
					onItemPress(path)
				}
			},
		}),
		[data, onItemPress],
	)
	return (
		<EChart
			option={option}
			height={DASHBOARD_CHART_HEIGHTS.pie}
			label={DASHBOARD_CHART_IMAGE_LABELS.pie}
			events={events}
		/>
	)
}
