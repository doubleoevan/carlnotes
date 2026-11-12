// the Dashboard routes the app reaches

import type { ApiRouteContract } from "./apiRouteContracts"
import { dashboardParam, dashboardQuery, dashboardResponse } from "./dashboards"

// the entries, in client module order
export const dashboardRouteContracts: Record<string, ApiRouteContract> = {
	// a Dashboard screen's snapshot for one chart selection
	"dashboardClient.fetchDashboard": {
		method: "GET",
		path: "/api/dashboards/:dashboardKind/:subjectId",
		params: dashboardParam,
		query: dashboardQuery,
		response: dashboardResponse,
	},
}
