// the Nightshift chart theme: the ECharts theme object the dashboards' charts draw with, built from the color tokens
// and the body font in each mode
import { type ColorMode, type ColorName, darkRoast, latte, type Palette } from "./colors"
import { fontFamilies } from "./typography"

// each mode's palette
const PALETTES: Record<ColorMode, Palette> = { light: latte, dark: darkRoast }

// the tokens a chart's series take in turn, ordered so neighbors differ in lightness
const SERIES_COLOR_NAMES: Record<ColorMode, ColorName[]> = {
	light: ["primary", "spendChat", "input", "link", "separatorStrong", "hero"],
	dark: ["primary", "spendChat", "input", "spendPodcastEpisode", "mutedForeground", "separatorStrong"],
}

// the body font's stack without quotes, which ECharts' svg renderer writes into an attribute as they are
const CHART_FONT_FAMILY = fontFamilies.sans.stack.replaceAll('"', "")

// the axis labels' size in pixels, before a phone's text scale
export const CHART_AXIS_LABEL_SIZE = 12

// one axis's line, labels, and split lines
type ChartAxisTheme = {
	axisLine: { lineStyle: { color: string } }
	axisTick: { lineStyle: { color: string } }
	axisLabel: { color: string; fontSize: number }
	splitLine: { lineStyle: { color: string } }
}

/** The ECharts theme object in one mode. */
export type ChartTheme = {
	// the series colors, the background, and the text
	color: string[]
	backgroundColor: string
	textStyle: { fontFamily: string; color: string }
	// each axis kind, then the tooltip
	categoryAxis: ChartAxisTheme
	valueAxis: ChartAxisTheme
	tooltip: { backgroundColor: string; borderColor: string; textStyle: { color: string } }
	// the outline map's land and borders, and the count on its pins
	geo: { itemStyle: { areaColor: string; borderColor: string; borderWidth: number } }
	mapPinLabel: { color: string }
}

/**
 * Returns the chart theme in one mode: the series colors, a transparent background over the card, the axes and the
 * tooltip in the card's text, border, and popover colors, the outline map's land in the muted color, and its pins'
 * counts in the color over the primary color.
 */
export function toChartTheme(mode: ColorMode): ChartTheme {
	// the mode's palette, and its axes' colors and label size
	const palette = PALETTES[mode]
	const axisTheme: ChartAxisTheme = {
		axisLine: { lineStyle: { color: palette.separatorStrong } },
		axisTick: { lineStyle: { color: palette.separatorStrong } },
		axisLabel: { color: palette.mutedForeground, fontSize: CHART_AXIS_LABEL_SIZE },
		splitLine: { lineStyle: { color: palette.separator } },
	}

	// the series colors, the text, the axes, the tooltip, and the outline map
	return {
		color: toChartSeriesColors(mode),
		backgroundColor: "transparent",
		textStyle: { fontFamily: CHART_FONT_FAMILY, color: palette.cardForeground },
		categoryAxis: axisTheme,
		valueAxis: axisTheme,
		tooltip: {
			backgroundColor: palette.popover,
			borderColor: palette.border,
			textStyle: { color: palette.popoverForeground },
		},
		geo: { itemStyle: { areaColor: palette.muted, borderColor: palette.separatorStrong, borderWidth: 0.5 } },
		mapPinLabel: { color: palette.primaryForeground },
	}
}

/**
 * Returns the colors a chart's series take in turn in one mode.
 */
export function toChartSeriesColors(mode: ColorMode): string[] {
	return SERIES_COLOR_NAMES[mode].map((colorName) => PALETTES[mode][colorName])
}
