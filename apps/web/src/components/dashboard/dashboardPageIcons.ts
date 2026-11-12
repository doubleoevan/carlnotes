// each Dashboard page's icon
import type { DashboardKind } from "@carlnotes/contracts/dashboards"
import { ChartBar, ChartLine, ChartPie, type LucideIcon } from "lucide-react"

export const DASHBOARD_PAGE_ICONS: Record<DashboardKind, LucideIcon> = {
	topicDashboard: ChartBar,
	podcastDashboard: ChartPie,
	teamDashboard: ChartLine,
}
