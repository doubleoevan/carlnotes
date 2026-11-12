// the app's pie for a Dashboard page, a donut drawn with Victory Native on Skia. a tap on a slice opens its sheet
import type { DashboardSlice } from "@carlnotes/contracts/dashboards"
import {
	DASHBOARD_CHART_HEIGHTS,
	DASHBOARD_CHART_IMAGE_LABELS,
	DASHBOARD_PIE_RADII,
	type DashboardChartProps,
	toDashboardCountLines,
	toDashboardSeriesColor,
	toDashboardSlicePoint,
} from "@carlnotes/core/lib/dashboardCharts"
import { useState } from "react"
import { type GestureResponderEvent, Pressable, View } from "react-native"
import { Pie, PolarChart } from "victory-native"

// the pie's outer radius against half its box, and its inner radius against its outer one
const PIE_OUTER_RATIO = DASHBOARD_PIE_RADII.outer / 100
const PIE_INNER_RATIO = DASHBOARD_PIE_RADII.inner / DASHBOARD_PIE_RADII.outer

/**
 * Draws each item's share of the count as a donut. A tap on a slice opens its sheet.
 */
export function DashboardPieChart({
	data,
	playFormat,
	seriesColors,
	onPointFocus,
}: DashboardChartProps<DashboardSlice[]>) {
	const [width, setWidth] = useState(0)

	// each slice in its series color, the slices' total count, and the donut's outer radius in the measured box
	const slices = data.map((slice, i) => ({
		slice,
		label: slice.title,
		value: slice.count,
		color: toDashboardSeriesColor(seriesColors, i),
	}))
	const totalCount = slices.reduce((sum, { value }) => sum + value, 0)
	const outerRadius = (Math.min(width, DASHBOARD_CHART_HEIGHTS.pie) / 2) * PIE_OUTER_RATIO

	// a tap inside the donut's ring opens the slice under it
	const handleSlicePress = ({ nativeEvent }: GestureResponderEvent): void => {
		// the tap's distance from the donut's middle, which must fall inside the ring
		const offsetX = nativeEvent.locationX - width / 2
		const offsetY = nativeEvent.locationY - DASHBOARD_CHART_HEIGHTS.pie / 2
		const distance = Math.hypot(offsetX, offsetY)
		if (totalCount === 0 || distance > outerRadius || distance < outerRadius * PIE_INNER_RATIO) {
			return
		}

		// the slice whose turn holds the tap's angle, clockwise from 12 o'clock
		const turn = (((Math.atan2(offsetY, offsetX) * 180) / Math.PI + 450) % 360) / 360
		let cumulativeTurn = 0
		const tappedSlice = slices.find(({ value }) => {
			cumulativeTurn += value / totalCount
			return turn <= cumulativeTurn
		})
		if (tappedSlice) {
			onPointFocus(toDashboardSlicePoint(tappedSlice.slice))
		}
	}

	// the donut, named for a screen reader with each slice's count, under the tap's overlay
	const accessibilityLabel = [
		DASHBOARD_CHART_IMAGE_LABELS.pie,
		...slices.map(({ slice }) => `${slice.title}: ${toDashboardCountLines(slice, playFormat).join(", ")}`),
	].join(". ")
	return (
		<View
			accessible
			accessibilityRole="image"
			accessibilityLabel={accessibilityLabel}
			style={{ height: DASHBOARD_CHART_HEIGHTS.pie }}
			onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
		>
			{slices.length > 0 && width > 0 && (
				<PolarChart data={slices} labelKey="label" valueKey="value" colorKey="color">
					<Pie.Chart innerRadius={`${PIE_INNER_RATIO * 100}%`} startAngle={-90} size={outerRadius * 2} />
				</PolarChart>
			)}
			<Pressable accessible={false} onPress={handleSlicePress} className="absolute inset-0" />
		</View>
	)
}
