// what a Dashboard route loads on the server: the page read, which holds the page's head and the public read of its
// default selection with its series, for the header, the summary, Carl's paragraph, and the first charts. a person or
// team the api does not have, or a private team, responds 404
import { fetchDashboardPageRead } from "@carlnotes/client/pageReadClient"
import type { DashboardKind, DashboardResponse } from "@carlnotes/contracts/dashboards"
import type { PageHead } from "@carlnotes/contracts/pageHead"
import { notFound } from "@tanstack/react-router"
import { loadPageReadOnServer } from "./loadOnServer"

// a Dashboard route's loaded data: the head, and the public default read with its series
export type DashboardRouteData = {
	head: PageHead | undefined
	initialDashboard: DashboardResponse | null
}

/**
 * Reads a Dashboard's page read on the server, and throws not found if the api has no such Dashboard.
 */
export async function loadDashboardRoute(dashboardKind: DashboardKind, subjectId: string): Promise<DashboardRouteData> {
	const dashboardPageRead = await loadPageReadOnServer(() => fetchDashboardPageRead({ dashboardKind, subjectId }))
	if (dashboardPageRead === null) {
		throw notFound()
	}
	return { head: dashboardPageRead?.head, initialDashboard: dashboardPageRead?.dashboard ?? null }
}
