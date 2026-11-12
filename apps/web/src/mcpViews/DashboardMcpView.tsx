import { type DashboardKind, toDashboardPageLinks } from "@carlnotes/contracts/dashboards"
import type { McpViewDashboard } from "@carlnotes/contracts/mcpViews"
import { Dashboard } from "@carlnotes/core/components/Dashboard"
import { toChartSeriesColors } from "@carlnotes/nightshift/chartTheme"
import { cn } from "@carlnotes/nightshift/classNames"
import { AnchorLink } from "@/components/common/AnchorLink"
import { DashboardBarChart } from "@/components/dashboard/DashboardBarChart"
import { DashboardHeader } from "@/components/dashboard/DashboardHeader"
import { DashboardPieChart } from "@/components/dashboard/DashboardPieChart"
import { DashboardTrendChart } from "@/components/dashboard/DashboardTrendChart"
import { DashboardWordCloud } from "@/components/dashboard/DashboardWordCloud"
import { toWebDashboardElements } from "@/components/dashboard/dashboardElements"
import { DASHBOARD_PAGE_ICONS } from "@/components/dashboard/dashboardPageIcons"
import { OutlineMap } from "@/components/dashboard/OutlineMap"
import { useColorMode } from "@/hooks/useColorMode"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"
import { captureVisitEvent } from "@/lib/visitAnalytics"
import { openMcpViewLink, toMcpViewSiteUrl, useMcpViewData } from "./mcpViewHost"

// the web's Dashboard elements with the outline map. Google Maps cannot load in the host's sandboxed frame. the
// dashboard MCP view's own bundle holds the chart code, so the charts draw with no import()
const MCP_VIEW_DASHBOARD_ELEMENTS = toWebDashboardElements({
	BarChart: DashboardBarChart,
	PieChart: DashboardPieChart,
	WordCloud: DashboardWordCloud,
	TrendChart: DashboardTrendChart,
	PlaceMap: OutlineMap,
})

/**
 * Shows the dashboard MCP view: the Dashboard page's header, the links to the caller's three Dashboard pages, and the
 * shared Dashboard, from the read the tool returned. Another chart selection reads through the tool, and a bar, a
 * slice, a pinned day's line, a place, or a link opens its page on the site through the host.
 */
export function DashboardMcpView({ mcpViewDashboard }: { mcpViewDashboard: McpViewDashboard }) {
	const { dashboardKind, subjectId, hasFullAccess, dashboard } = mcpViewDashboard
	const colorMode = useColorMode()
	const { session } = useMcpViewData()
	return (
		<div>
			{/* the Dashboard page's header */}
			<DashboardHeader
				dashboardKind={dashboardKind}
				subject={dashboard.subject}
				summary={dashboard.summary}
				isSubjectHeaderShown
			/>

			{/* the links to the caller's three Dashboard pages */}
			{session && <DashboardPageLinks userId={session.userId} dashboardKind={dashboardKind} />}

			{/* the shared Dashboard. the MCP view reports no events, so it reports no owner */}
			<Dashboard
				dashboardKind={dashboardKind}
				subjectId={subjectId}
				hasFullAccess={hasFullAccess}
				isOwner={false}
				initialDashboard={dashboard}
				isInitialDashboardFull
				seriesColors={toChartSeriesColors(colorMode)}
				captureVisitEvent={captureVisitEvent}
				onItemPress={(path) => void openMcpViewLink(toMcpViewSiteUrl(path))}
				elements={MCP_VIEW_DASHBOARD_ELEMENTS}
			/>
		</div>
	)
}

// the caller's three Dashboard pages, each with its user menu icon, opening on the site. the page in view is marked
function DashboardPageLinks({ userId, dashboardKind }: { userId: string; dashboardKind: DashboardKind }) {
	return (
		<nav aria-label="Specials" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
			{toDashboardPageLinks(userId).map(({ dashboardKind: linkDashboardKind, label, path }) => {
				const PageIcon = DASHBOARD_PAGE_ICONS[linkDashboardKind]
				return (
					<AnchorLink
						key={linkDashboardKind}
						href={path}
						aria-current={linkDashboardKind === dashboardKind ? "page" : undefined}
						className={cn(STANDALONE_LINK_CLASS, "inline-flex items-center gap-1.5")}
					>
						<PageIcon className="size-4" />
						{label}
					</AnchorLink>
				)
			})}
		</nav>
	)
}
