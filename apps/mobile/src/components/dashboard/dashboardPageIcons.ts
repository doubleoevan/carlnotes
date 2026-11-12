// each Dashboard page's icon, shared by the screen's title, the first team's Team Dashboard, and the user menu
import type { DashboardKind } from "@carlnotes/contracts/dashboards"
import { ChartBar, ChartLine, ChartPie, type LucideIcon } from "lucide-react-native"

/**
 * Each page's icon, the same as its row in the user menu.
 */
export const DASHBOARD_PAGE_ICONS: Record<DashboardKind, LucideIcon> = {
	topicDashboard: ChartBar,
	podcastDashboard: ChartPie,
	teamDashboard: ChartLine,
}
