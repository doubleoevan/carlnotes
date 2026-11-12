// the app's word cloud for a Dashboard page: react-native-svg words laid out by the shared spiral, the same layout the
// web draws, each sized by the count of the items whose titles hold it. a tap on a word opens its sheet
import type { DashboardWord } from "@carlnotes/contracts/dashboards"
import {
	DASHBOARD_CHART_HEIGHTS,
	DASHBOARD_CHART_IMAGE_LABELS,
	type DashboardChartProps,
	toDashboardSeriesColor,
	toDashboardWordCountLines,
	toDashboardWordPoint,
} from "@carlnotes/core/lib/dashboardCharts"
import { toPlacedWords } from "@carlnotes/core/lib/wordCloud"
import { fontFamilies } from "@carlnotes/nightshift/typography"
import { useMemo, useState } from "react"
import { View } from "react-native"
import Svg, { Text as SvgText } from "react-native-svg"

/**
 * Draws the words heaviest first from the middle, in the series colors in turn.
 */
export function DashboardWordCloud({
	data,
	playFormat,
	seriesColors,
	onPointFocus,
}: DashboardChartProps<DashboardWord[]>) {
	const [width, setWidth] = useState(0)

	// the laid out words once the box is measured
	const placedWords = useMemo(
		() => (width > 0 ? toPlacedWords(data, width, DASHBOARD_CHART_HEIGHTS.wordCloud) : []),
		[data, width],
	)

	// the cloud, named for a screen reader with each word's count
	const accessibilityLabel = [
		DASHBOARD_CHART_IMAGE_LABELS.wordCloud,
		...data.map((word) => `${word.word}: ${toDashboardWordCountLines(word, playFormat).join(", ")}`),
	].join(". ")
	return (
		<View
			accessible
			accessibilityRole="image"
			accessibilityLabel={accessibilityLabel}
			style={{ height: DASHBOARD_CHART_HEIGHTS.wordCloud }}
			onLayout={(event) => setWidth(Math.round(event.nativeEvent.layout.width))}
		>
			<Svg width={width} height={DASHBOARD_CHART_HEIGHTS.wordCloud}>
				{placedWords.map(({ word, x, y, fontSize }, i) => (
					<SvgText
						key={word}
						x={x}
						y={y}
						fontSize={fontSize}
						fontFamily={fontFamilies.sans.name}
						textAnchor="middle"
						alignmentBaseline="central"
						fill={toDashboardSeriesColor(seriesColors, i)}
						onPress={() => onPointFocus(toDashboardWordPoint(data, word))}
					>
						{word}
					</SvgText>
				))}
			</Svg>
		</View>
	)
}
