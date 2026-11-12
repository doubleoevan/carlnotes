// the Dashboard charts' contract: the five charts, the controls each has, the props every platform renderer takes, and
// the words a chart point's detail shows

import {
	type DashboardBar,
	type DashboardChartSelection,
	type DashboardKind,
	type DashboardPin,
	type DashboardPlayFormat,
	type DashboardSlice,
	type DashboardTrend,
	type DashboardWord,
	dashboardRangeDays,
	type ViewItemKind,
} from "@carlnotes/contracts/dashboards"
import { toCountLabel, toDotSeparatedText } from "@carlnotes/contracts/text"
import { VIEWER_COUNT_LABEL } from "@carlnotes/contracts/viewerCounts"
import type { ComponentType, ReactElement } from "react"
import { type DashboardCount, sumDashboardCounts } from "./dashboardCounts"
import { toMonthDayLabel } from "./labels"

// the five charts, in the order the page lays them out
export const dashboardChartNames = ["bar", "pie", "wordCloud", "trend", "map"] as const
export type DashboardChartName = (typeof dashboardChartNames)[number]

// each chart's section title, which names its section and its controls for assistive tech too
export const DASHBOARD_CHART_TITLES: Record<DashboardChartName, string> = {
	bar: "Popular",
	pie: "Slices",
	wordCloud: "Poetry",
	trend: "Performance",
	map: VIEWER_COUNT_LABEL,
}

// the emoji after a chart's section title, which assistive tech skips
export const DASHBOARD_CHART_TITLE_EMOJIS: Partial<Record<DashboardChartName, string>> = { bar: "🔥" }

// what each chart's image shows, which names the image for assistive tech
export const DASHBOARD_CHART_IMAGE_LABELS: Record<DashboardChartName, string> = {
	bar: "The ten items with the highest counts",
	pie: "Each item's share of the count",
	wordCloud: "Words from the item titles, larger for higher counts",
	trend: "Each item's count by day",
	map: "Counts by place",
}

// each chart's height in pixels, which its empty card keeps too. the bar chart grows with its bars, and the map keeps
// its own box
export const DASHBOARD_CHART_HEIGHTS: Record<Exclude<DashboardChartName, "map">, number> = {
	bar: 260,
	pie: 260,
	wordCloud: 260,
	trend: 280,
}

// the height a chart's placeholder holds while its code or its selection loads, the pie's and the word cloud's height
export const DASHBOARD_CHART_PLACEHOLDER_HEIGHT = DASHBOARD_CHART_HEIGHTS.pie

// the pie's inner and outer radius in percent of half its box
export const DASHBOARD_PIE_RADII = { inner: 45, outer: 80 }

// one choice of a chart's control or the team dropdown, with the team's avatar beside a team's name
export type DashboardChoice<Value extends string> = { value: Value; label: string; icon?: ReactElement }

// the props of each app's select: its accessible label, the chosen value, the choices, what choosing one does, and
// whether it is highlighted in the primary color
export type DashboardSelectProps = {
	label: string
	value: string
	choices: DashboardChoice<string>[]
	onChange: (value: string) => void
	isHighlighted?: boolean
}

// the item kinds a Topic or Team Dashboard chart switches between, and the formats a Podcast Dashboard chart does
const VIEW_ITEM_KIND_CHOICES: DashboardChoice<ViewItemKind>[] = [
	{ value: "finding", label: "Findings" },
	{ value: "topic", label: "Topics" },
	{ value: "topicPost", label: "Posts" },
]
const PLAY_FORMAT_CHOICES: DashboardChoice<DashboardPlayFormat>[] = [
	{ value: "audio", label: "Podcasts" },
	{ value: "video", label: "Films" },
	{ value: "both", label: "Both" },
]

// the trend's range choices
export const DASHBOARD_RANGE_CHOICES: DashboardChoice<string>[] = dashboardRangeDays.map((rangeDays) => ({
	value: String(rangeDays),
	label: `${rangeDays} days`,
}))

// one point a tap or a hover focuses: its title, its page if it has one, a line under the title such as a day or a
// place, its counts with the colors of their swatches, for a pin the items there, and for a trend day each line's count
// that day
export type DashboardPoint = {
	title: string
	path: string | null
	subtitle?: string
	// its counts and the colors of their swatches
	counts: DashboardCount
	countColors?: string[]
	// whether it is a word of the word cloud, whose counts sum the items whose titles hold it, a pin's items, and a trend
	// day's lines
	isWord?: boolean
	items?: DashboardPin["items"]
	dayLines?: DashboardTrendDayLine[]
}

// one trend line on one day: its key, its title, its page or null for Other, its series color, and its count's line
type DashboardTrendDayLine = Omit<DashboardItemLine, "line" | "color"> & { color: string }

// the props every chart renderer takes: its data, the format a podcast chart counts, the colors its series take in
// turn, opening an item's page, and the point a tap focuses
export type DashboardChartProps<Data> = {
	data: Data
	playFormat: DashboardPlayFormat | null
	seriesColors: string[]
	onItemPress: (path: string) => void
	onPointFocus: (point: DashboardPoint) => void
}

// the renderers each platform supplies, one per chart
export type DashboardChartRenderers = {
	BarChart: ComponentType<DashboardChartProps<DashboardBar[]>>
	PieChart: ComponentType<DashboardChartProps<DashboardSlice[]>>
	WordCloud: ComponentType<DashboardChartProps<DashboardWord[]>>
	TrendChart: ComponentType<DashboardChartProps<DashboardTrend>>
	PlaceMap: ComponentType<DashboardChartProps<DashboardPin[]>>
}

/**
 * Returns a chart's choices for a dashboard kind: the formats on Podcast Dashboard, and the item kinds otherwise.
 */
export function toDashboardChoices(dashboardKind: DashboardKind): DashboardChoice<DashboardChartSelection>[] {
	return dashboardKind === "podcastDashboard" ? PLAY_FORMAT_CHOICES : VIEW_ITEM_KIND_CHOICES
}

// the noun a count of views takes: visitors, or visits on a map pin
type ViewCountNoun = "visitor" | "visit"

/**
 * Returns the lines a count shows: its views by the noun given on Topic and Team Dashboard, and on Podcast Dashboard
 * its plays, split into podcast and film under Both.
 */
export function toDashboardCountLines(
	counts: DashboardCount,
	playFormat: DashboardPlayFormat | null,
	viewNoun: ViewCountNoun = "visitor",
): string[] {
	if (playFormat === "both") {
		return [`${counts.podcastPlayCount ?? 0} podcast`, `${counts.filmPlayCount ?? 0} film`]
	}
	return [toCountLabel(counts.count, playFormat === null ? viewNoun : "play")]
}

/**
 * Returns an item's count in a pin's or a trend day's detail: the bare number, since the total under the items names
 * the noun, or its podcast and film plays under Both.
 */
function toDashboardItemCountLine(counts: DashboardCount, playFormat: DashboardPlayFormat | null): string {
	return playFormat === "both"
		? toDotSeparatedText(toDashboardCountLines(counts, playFormat))
		: counts.count.toLocaleString()
}

/**
 * Returns a sum's total at a detail's bottom right: its views by the noun given, its plays of one format, or its
 * podcast plays and film plays under Both.
 */
function toDashboardTotalLine(
	counts: DashboardCount,
	playFormat: DashboardPlayFormat | null,
	viewNoun: ViewCountNoun,
): string {
	if (playFormat === "both") {
		const podcastLine = toCountLabel(counts.podcastPlayCount ?? 0, "podcast play")
		return toDotSeparatedText([podcastLine, toCountLabel(counts.filmPlayCount ?? 0, "film play")])
	}
	return toCountLabel(counts.count, playFormat === null ? viewNoun : "play")
}

/**
 * Returns a word's count lines: the summed counts of the items whose titles hold it, in times, split into podcast and
 * film under Both.
 */
export function toDashboardWordCountLines(counts: DashboardCount, playFormat: DashboardPlayFormat | null): string[] {
	return playFormat === "both" ? toDashboardCountLines(counts, playFormat) : [toCountLabel(counts.count, "time")]
}

/**
 * Returns the series color at a place in the series, the colors taken in turn.
 */
export function toDashboardSeriesColor(seriesColors: string[], seriesIndex: number): string {
	return seriesColors[seriesIndex % seriesColors.length] ?? ""
}

/**
 * Returns the colors of a bar's segments and its count lines' swatches: the podcast and film plays under Both, and
 * films keep their color under Films.
 */
export function toDashboardCountColors(playFormat: DashboardPlayFormat | null, seriesColors: string[]): string[] {
	const [podcastColor = "", filmColor = ""] = seriesColors
	if (playFormat === "both") {
		return [podcastColor, filmColor]
	}
	return [playFormat === "video" ? filmColor : podcastColor]
}

// one line of a point's detail, with its swatch's color if it has one
type DashboardDetailLine = { line: string; color?: string }

// one item's line in a pin's or a trend day's detail: its key, its title, its count's line, the two as one line for a
// tooltip, the page it opens or null for Other, and a trend line's series color
type DashboardItemLine = {
	key: string
	title: string
	countLine: string
	line: string
	path: string | null
	color?: string
}

/**
 * Returns a point's detail lines, its item lines, and its total line.
 */
export function toDashboardPointLineGroups(
	point: DashboardPoint,
	playFormat: DashboardPlayFormat | null,
): { lines: DashboardDetailLine[]; itemLines: DashboardItemLine[]; totalLine: string | null } {
	// a trend day lists each line's count that day under its day, then the day's total
	const subtitleLines = point.subtitle ? [{ line: point.subtitle }] : []
	if (point.dayLines) {
		const totalLine = toDashboardTotalLine(point.counts, playFormat, "visitor")
		return { lines: subtitleLines, itemLines: point.dayLines.map(toItemLine), totalLine }
	}

	// a pin's total counts views or plays, and another point's count lines each keep their swatch's color
	if (point.items) {
		const totalLine = toDashboardTotalLine(point.counts, playFormat, "visit")
		return { lines: subtitleLines, itemLines: toPinItemLines(point.items, playFormat), totalLine }
	}
	const toCountLines = point.isWord ? toDashboardWordCountLines : toDashboardCountLines
	const countLines = toCountLines(point.counts, playFormat).map((line, i) => ({
		line,
		color: point.countColors?.[i],
	}))
	// Both splits a play count in two, so its total plays, or a word's times, follow at the right
	const totalNoun = point.isWord ? "time" : "play"
	const totalLine = playFormat === "both" ? toCountLabel(point.counts.count, totalNoun) : null
	return { lines: [...subtitleLines, ...countLines], itemLines: [], totalLine }
}

// a pin's items with their own counts in views or plays, most first
function toPinItemLines(items: DashboardPin["items"], playFormat: DashboardPlayFormat | null): DashboardItemLine[] {
	return [...items]
		.sort((first, second) => second.count - first.count)
		.map((item) => {
			const countLine = toDashboardItemCountLine(item, playFormat)
			return toItemLine({ key: item.itemId, title: item.title, countLine, path: item.path })
		})
}

// an item's line from its key, its title, its count's line, its page, and its series color if it has one
function toItemLine({ key, title, countLine, path, color }: Omit<DashboardItemLine, "line">): DashboardItemLine {
	return { key, title, countLine, line: `${title}: ${countLine}`, path, color }
}

/**
 * Returns a trend day, YYYY-MM-DD, as its short month and day, such as Nov 9, read in UTC so the day never shifts.
 */
export function toDashboardDayLabel(day: string): string {
	const dayStart = `${day}T00:00:00Z`
	return Number.isNaN(Date.parse(dayStart)) ? day : toMonthDayLabel(dayStart, { timeZone: "UTC" })
}

// the trend, the day's place in its days, the format a podcast chart counts, and the colors its lines take in turn
type ToDashboardTrendDayPointOptions = {
	trend: DashboardTrend
	dayIndex: number
	playFormat: DashboardPlayFormat | null
	seriesColors: string[]
}

/**
 * Returns one trend day as a point: its day as the title, and each line with a count that day, most first, keeping its
 * series color.
 */
export function toDashboardTrendDayPoint({
	trend,
	dayIndex,
	playFormat,
	seriesColors,
}: ToDashboardTrendDayPointOptions): DashboardPoint {
	// each line's counts that day, with the color its place in the series gives it before the sort
	const dayCounts = trend.lines.map((line, i) => ({
		line,
		color: toDashboardSeriesColor(seriesColors, i),
		counts: {
			count: line.counts[dayIndex] ?? 0,
			podcastPlayCount: line.podcastPlayCounts?.[dayIndex],
			filmPlayCount: line.filmPlayCounts?.[dayIndex],
		},
	}))

	// the lines with a count, most first, each with its count's line
	const countedDayCounts = dayCounts.filter(({ counts }) => counts.count > 0)
	const rankedDayCounts = countedDayCounts.sort((first, second) => second.counts.count - first.counts.count)
	const dayLines = rankedDayCounts.map(({ line, color, counts }) => ({
		key: line.key,
		title: line.title,
		path: line.path,
		color,
		countLine: toDashboardItemCountLine(counts, playFormat),
	}))

	// the point titled by its date, or by its week's first date, with every line's counts summed
	const dayTotal = sumDashboardCounts(dayCounts.map(({ counts }) => counts))
	const dayLabel = toDashboardDayLabel(trend.days[dayIndex] ?? "")
	const title = trend.daysPerPoint > 1 ? `Week of ${dayLabel}` : dayLabel
	return { title, path: null, counts: dayTotal, dayLines }
}

/**
 * Returns a bar as a point, with its count lines' swatch colors.
 */
export function toDashboardBarPoint(bar: DashboardBar, countColors: string[]): DashboardPoint {
	return { title: bar.title, path: bar.path, counts: bar, countColors }
}

/**
 * Returns a pie slice as a point. Other has no page.
 */
export function toDashboardSlicePoint(slice: DashboardSlice): DashboardPoint {
	return { title: slice.title, path: slice.path, counts: slice }
}

/**
 * Returns a word of the word cloud as a point with the summed counts of the items whose titles hold it.
 */
export function toDashboardWordPoint(dashboardWords: DashboardWord[], word: string): DashboardPoint {
	const dashboardWord = dashboardWords.find((candidateWord) => candidateWord.word === word)
	return { title: word, path: null, isWord: true, counts: dashboardWord ?? { count: 0 } }
}
