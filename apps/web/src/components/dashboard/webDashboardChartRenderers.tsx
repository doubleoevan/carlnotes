// the web page's chart renderers, each loaded with import() after hydration
import type { DashboardChartProps, DashboardChartRenderers } from "@carlnotes/core/lib/dashboardCharts"
import { type ComponentType, lazy, Suspense } from "react"
import { useIsMounted } from "@/hooks/useBrowserValue"
import { ChartPlaceholder } from "./dashboardElements"

// the chart renderers, each in the chunk it loads from
const LazyBarChart = lazy(() => import("./DashboardBarChart").then((chart) => ({ default: chart.DashboardBarChart })))
const LazyPieChart = lazy(() => import("./DashboardPieChart").then((chart) => ({ default: chart.DashboardPieChart })))
const LazyTrendChart = lazy(() =>
	import("./DashboardTrendChart").then((chart) => ({ default: chart.DashboardTrendChart })),
)
const LazyWordCloud = lazy(() =>
	import("./DashboardWordCloud").then((wordCloud) => ({ default: wordCloud.DashboardWordCloud })),
)
const LazyPlaceMap = lazy(() => import("./PlaceMap").then((placeMap) => ({ default: placeMap.PlaceMap })))

/**
 * Returns a chart renderer that shows its placeholder on the server and until its code loads in the browser.
 */
function toLoadedAfterHydration<Data>(
	LazyChart: ComponentType<DashboardChartProps<Data>>,
): ComponentType<DashboardChartProps<Data>> {
	return function LoadedChart(props: DashboardChartProps<Data>) {
		const isMounted = useIsMounted()
		return isMounted ? (
			<Suspense fallback={<ChartPlaceholder />}>
				<LazyChart {...props} />
			</Suspense>
		) : (
			<ChartPlaceholder />
		)
	}
}

// the web's chart renderers, loaded after hydration
export const WEB_DASHBOARD_CHART_RENDERERS: DashboardChartRenderers = {
	BarChart: toLoadedAfterHydration(LazyBarChart),
	PieChart: toLoadedAfterHydration(LazyPieChart),
	WordCloud: toLoadedAfterHydration(LazyWordCloud),
	TrendChart: toLoadedAfterHydration(LazyTrendChart),
	PlaceMap: toLoadedAfterHydration(LazyPlaceMap),
}
