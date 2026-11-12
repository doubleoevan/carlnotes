// the body of a Topic, Podcast, or Team Dashboard page: five chart sections in four rows, the bar chart with Carl's
// paragraph in its card, the pie beside the word cloud, the trend, and the map. each page opens on the default choices, and each app
// supplies its sections, controls, and chart renderers
import type { AnalyticsEventProperties, VisitAnalyticsEvent } from "@carlnotes/contracts/analyticsEvents"
import {
	type DashboardChartSelection,
	type DashboardKind,
	type DashboardPlayFormat,
	type DashboardResponse,
	type DashboardSeries,
	DEFAULT_DASHBOARD_RANGE_DAYS,
	toDashboardPlayFormat,
	toDashboardReadAccess,
	toDefaultDashboardSelection,
} from "@carlnotes/contracts/dashboards"
import { type ComponentType, type ReactNode, useEffect, useState } from "react"
import { useDashboardSnapshot } from "../hooks/useDashboardSnapshot"
import {
	DASHBOARD_CHART_HEIGHTS,
	DASHBOARD_CHART_PLACEHOLDER_HEIGHT,
	DASHBOARD_CHART_TITLE_EMOJIS,
	DASHBOARD_CHART_TITLES,
	DASHBOARD_RANGE_CHOICES,
	type DashboardChartName,
	type DashboardChartRenderers,
	type DashboardPoint,
	type DashboardSelectProps,
	toDashboardChoices,
} from "../lib/dashboardCharts"
import { RadioGroup, type RadioGroupElements } from "./RadioGroup"

// each app's elements: the chart renderers, the accordion of rows and the two-column row, one section with its title,
// the chart's card, the empty and loading cards with the chart's controls at their top right and Carl's paragraph under
// them if the card has it, the paragraph and its placeholder, the select, the radio group, and a sheet for a tapped point if the app has one
export type DashboardElements = DashboardChartRenderers & {
	Rows: ComponentType<{ children: ReactNode }>
	PairRow: ComponentType<{ children: ReactNode }>
	Section: ComponentType<{ value: DashboardChartName; title: string; titleEmoji?: string; children: ReactNode }>
	Card: ComponentType<{ controls: ReactNode; paragraph?: ReactNode; children: ReactNode }>
	EmptyCard: ComponentType<{ controls: ReactNode; paragraph?: ReactNode; height: number; children: string }>
	LoadingCard: ComponentType<{ controls: ReactNode; paragraph?: ReactNode }>
	Paragraph: ComponentType<{ children: string }>
	ParagraphShape: ComponentType
	Select: ComponentType<DashboardSelectProps>
	RadioGroup: RadioGroupElements
	PointDetail?: ComponentType<{
		point: DashboardPoint | null
		playFormat: DashboardPlayFormat | null
		onClose: () => void
		onItemPress: (path: string) => void
	}>
}

// the Dashboard, whether the user reads its full snapshot and owns it, and the default selection's read to start from
// with whether that read is already the full one
export type DashboardProps = {
	dashboardKind: DashboardKind
	subjectId: string
	hasFullAccess: boolean
	isOwner: boolean
	initialDashboard: DashboardResponse | null
	isInitialDashboardFull?: boolean
	// the colors the series take in turn in the app's color mode, sending a visit event, opening an item's page, and the
	// app's elements
	seriesColors: string[]
	captureVisitEvent: (event: VisitAnalyticsEvent, properties: AnalyticsEventProperties) => void
	onItemPress: (path: string) => void
	elements: DashboardElements
}

// a tapped point and the format its chart counts
type FocusedPoint = { point: DashboardPoint; playFormat: DashboardPlayFormat | null }

/**
 * Shows a Dashboard page's body: the five chart sections, with Carl's paragraph in the bar chart's card, every one open. A team's non-member sees
 * no charts. Each page starts on the default choices, so opening another page resets them.
 */
export function Dashboard(props: DashboardProps) {
	return <DashboardBody key={`${props.dashboardKind}:${props.subjectId}`} {...props} />
}

// the page's body
function DashboardBody(props: DashboardProps) {
	// the page's props, and the default selection every chart starts on
	const { dashboardKind, subjectId, hasFullAccess, isOwner, initialDashboard } = props
	const { isInitialDashboardFull } = props
	const { captureVisitEvent, onItemPress, elements } = props
	const defaultSelection = toDefaultDashboardSelection(dashboardKind)

	// whether the charts show, which a team's summary alone leaves out
	const areChartsShown = toDashboardReadAccess(dashboardKind, hasFullAccess) !== "summaryOnly"

	// each chart's changed choice, the trend's range starting on the default, and the tapped point
	const [selections, setSelections] = useState<Partial<Record<DashboardChartName, DashboardChartSelection>>>({})
	const [rangeDays, setRangeDays] = useState(String(DEFAULT_DASHBOARD_RANGE_DAYS))
	const [focusedPoint, setFocusedPoint] = useState<FocusedPoint | null>(null)

	// the properties every Dashboard event includes
	const eventProperties: AnalyticsEventProperties = { dashboardKind, subjectId, isOwner }
	useEffect(() => {
		captureVisitEvent("social_dashboard_view", { dashboardKind, subjectId, isOwner })
	}, [captureVisitEvent, dashboardKind, subjectId, isOwner])

	// the paragraph, from the default selection's read
	const { dashboard, isLoading: isParagraphLoading } = useDashboardSnapshot({
		dashboardKind,
		subjectId,
		selection: defaultSelection,
		hasFullAccess,
		initialDashboard,
		isInitialDashboardFull,
	})

	// change one chart's choice and send its event
	const handleSelectionChange = (chartName: DashboardChartName, selection: DashboardChartSelection): void => {
		setSelections((currentSelections) => ({ ...currentSelections, [chartName]: selection }))
		const event =
			dashboardKind === "podcastDashboard" ? "social_dashboard_format_change" : "social_dashboard_item_kind_change"
		captureVisitEvent(event, { ...eventProperties, chart: chartName, selection })
	}

	// change the trend's range and send its event
	const handleRangeDaysChange = (nextRangeDays: string): void => {
		setRangeDays(nextRangeDays)
		captureVisitEvent("social_dashboard_range_change", { ...eventProperties, chart: "trend", rangeDays: nextRangeDays })
	}

	// one chart's section, with what it shares with the others, and Carl's paragraph in the bar chart's card, or its
	// placeholder while it loads
	const { Rows, PairRow, Paragraph, ParagraphShape, PointDetail } = elements
	const paragraph = isParagraphLoading ? (
		<ParagraphShape />
	) : (
		dashboard?.paragraph && <Paragraph>{dashboard.paragraph}</Paragraph>
	)
	const renderSection = (chartName: DashboardChartName): ReactNode => (
		<DashboardChartSection
			key={chartName}
			chartName={chartName}
			paragraph={chartName === "bar" ? paragraph : undefined}
			selection={selections[chartName] ?? defaultSelection}
			rangeDays={rangeDays}
			dashboardProps={props}
			onSelectionChange={(selection) => handleSelectionChange(chartName, selection)}
			onRangeDaysChange={handleRangeDaysChange}
			onPointFocus={setFocusedPoint}
		/>
	)

	// the four rows of sections, and the sheet for a tapped point if the app has one
	return (
		<>
			{areChartsShown && (
				<Rows>
					{renderSection("bar")}
					<PairRow>
						{renderSection("pie")}
						{renderSection("wordCloud")}
					</PairRow>
					{renderSection("trend")}
					{renderSection("map")}
				</Rows>
			)}
			{PointDetail && (
				<PointDetail
					point={focusedPoint?.point ?? null}
					playFormat={focusedPoint?.playFormat ?? null}
					onClose={() => setFocusedPoint(null)}
					onItemPress={onItemPress}
				/>
			)}
		</>
	)
}

// one chart's section: its choice, the trend's range, Carl's paragraph if its card has it, the Dashboard's props, and
// what its controls and points do
type DashboardChartSectionProps = {
	chartName: DashboardChartName
	paragraph?: ReactNode
	selection: DashboardChartSelection
	rangeDays: string
	dashboardProps: DashboardProps
	onSelectionChange: (selection: DashboardChartSelection) => void
	onRangeDaysChange: (rangeDays: string) => void
	onPointFocus: (focusedPoint: FocusedPoint) => void
}

// a chart's section: its title over its chart's card with the controls, which reads the chart's own selection
function DashboardChartSection({
	chartName,
	paragraph,
	selection,
	rangeDays,
	dashboardProps,
	onSelectionChange,
	onRangeDaysChange,
	onPointFocus,
}: DashboardChartSectionProps) {
	// the Dashboard's props and the app's elements
	const { dashboardKind, subjectId, hasFullAccess, initialDashboard, isInitialDashboardFull, elements } = dashboardProps
	const { Section, Select, LoadingCard } = elements

	// the selection's snapshot, starting from the server's read if it is the default selection
	const isDefaultSelection = selection === toDefaultDashboardSelection(dashboardKind)
	const { dashboard, isLoading, hasFailed } = useDashboardSnapshot({
		dashboardKind,
		subjectId,
		selection,
		hasFullAccess,
		initialDashboard: isDefaultSelection ? initialDashboard : null,
		isInitialDashboardFull,
	})

	// a podcast chart's format radio group, another chart's item kind select, and the trend's range select after it
	const choiceLabel = `${DASHBOARD_CHART_TITLES[chartName]} ${dashboardKind === "podcastDashboard" ? "format" : "items"}`
	const choiceControl =
		dashboardKind === "podcastDashboard" ? (
			<RadioGroup
				label={choiceLabel}
				value={selection}
				choices={toDashboardChoices(dashboardKind)}
				onChange={onSelectionChange}
				elements={elements.RadioGroup}
			/>
		) : (
			<Select
				label={choiceLabel}
				value={selection}
				choices={toDashboardChoices(dashboardKind)}
				onChange={(value) => onSelectionChange(value as DashboardChartSelection)}
			/>
		)
	const controls =
		chartName === "trend" ? (
			<>
				{choiceControl}
				<Select label="Trend range" value={rangeDays} choices={DASHBOARD_RANGE_CHOICES} onChange={onRangeDaysChange} />
			</>
		) : (
			choiceControl
		)

	// the chart in its card, a loading card while the selection reads, keyed by the selection so its state starts fresh
	return (
		<Section
			value={chartName}
			title={DASHBOARD_CHART_TITLES[chartName]}
			titleEmoji={DASHBOARD_CHART_TITLE_EMOJIS[chartName]}
		>
			{isLoading ? (
				<LoadingCard controls={controls} paragraph={paragraph} />
			) : (
				<DashboardChart
					key={selection}
					chartName={chartName}
					series={dashboard?.series ?? null}
					hasFailed={hasFailed}
					rangeDays={rangeDays}
					playFormat={toDashboardPlayFormat(selection)}
					controls={controls}
					paragraph={paragraph}
					dashboardProps={dashboardProps}
					onPointFocus={onPointFocus}
				/>
			)}
		</Section>
	)
}

// one chart's series, whether its read failed, the trend's range, the format a podcast chart counts, its card's
// controls and Carl's paragraph if the card has it, and what its points do
type DashboardChartProps = {
	chartName: DashboardChartName
	series: DashboardSeries | null
	hasFailed: boolean
	rangeDays: string
	playFormat: DashboardPlayFormat | null
	controls: ReactNode
	paragraph?: ReactNode
	dashboardProps: DashboardProps
	onPointFocus: (focusedPoint: FocusedPoint) => void
}

// one chart drawn by the app's renderer in its card, or its empty card at the chart's height in place of the card. the
// map draws even with no pins, and a failed read shows its failure in the empty card for every chart
function DashboardChart({
	chartName,
	series,
	hasFailed,
	rangeDays,
	playFormat,
	controls,
	paragraph,
	dashboardProps,
	onPointFocus,
}: DashboardChartProps) {
	// the app's elements, and the failure line in place of any chart whose read failed, at the placeholder's height for
	// the map
	const { dashboardKind, seriesColors, onItemPress, elements } = dashboardProps
	const { BarChart, PieChart, WordCloud, TrendChart, PlaceMap, Card, EmptyCard } = elements
	if (hasFailed) {
		const height = chartName === "map" ? DASHBOARD_CHART_PLACEHOLDER_HEIGHT : DASHBOARD_CHART_HEIGHTS[chartName]
		return (
			<EmptyCard controls={controls} paragraph={paragraph} height={height}>
				Could not load this chart.
			</EmptyCard>
		)
	}

	// the props every renderer shares
	const chartProps = {
		playFormat,
		seriesColors,
		onItemPress,
		onPointFocus: (point: DashboardPoint) => onPointFocus({ point, playFormat }),
	}

	// the map always draws, and the other charts show the empty card with no counts
	if (chartName !== "map" && (!series || isChartEmpty(chartName, series, rangeDays))) {
		return (
			<EmptyCard controls={controls} paragraph={paragraph} height={DASHBOARD_CHART_HEIGHTS[chartName]}>
				{dashboardKind === "podcastDashboard" ? "No plays yet." : "No visitors yet."}
			</EmptyCard>
		)
	}

	// each chart in its card
	const trend = series?.trends[rangeDays]
	const charts: Record<DashboardChartName, ReactNode> = {
		bar: series && <BarChart data={series.bars} {...chartProps} />,
		pie: series && <PieChart data={series.slices} {...chartProps} />,
		wordCloud: series && <WordCloud data={series.words} {...chartProps} />,
		trend: trend && <TrendChart data={trend} {...chartProps} />,
		map: <PlaceMap data={series?.pins ?? []} {...chartProps} />,
	}
	return (
		<Card controls={controls} paragraph={paragraph}>
			{charts[chartName]}
		</Card>
	)
}

// whether a chart has nothing to draw: no bars, slices, or words, or no trend line with a count in the range
function isChartEmpty(chartName: DashboardChartName, series: DashboardSeries, rangeDays: string): boolean {
	if (chartName === "bar") {
		return series.bars.length === 0
	}
	if (chartName === "pie") {
		return series.slices.length === 0
	}
	if (chartName === "wordCloud") {
		return series.words.length === 0
	}
	return !series.trends[rangeDays]?.lines.some(({ counts }) => counts.some((count) => count > 0))
}
