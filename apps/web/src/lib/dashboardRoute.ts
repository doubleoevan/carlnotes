// what a Dashboard route loads on the server: the page's head and the public read of its default selection without its
// series, for the header, the summary, and Carl's paragraph. the charts read their series in the browser. a person or
// team the api does not have, or a private team, responds 404
import { fetchDashboard } from "@carlnotes/client/dashboardClient"
import { fetchDashboardPageHead } from "@carlnotes/client/pageHeadClient"
import {
	type DashboardKind,
	type DashboardResponse,
	type DashboardSubject,
	toDefaultDashboardSelection,
} from "@carlnotes/contracts/dashboards"
import type { PageHead } from "@carlnotes/contracts/pageHead"
import { notFound } from "@tanstack/react-router"
import { loadPageOnServer } from "./loadOnServer"

// a Dashboard route's loaded data: the head, and the public default read without its series
export type DashboardRouteData = {
	head: PageHead | undefined
	initialDashboard: DashboardResponse | null
}

/**
 * Reads a Dashboard page's head and public default read on the server, and throws not found if the api has no head.
 */
export async function loadDashboardRoute(dashboardKind: DashboardKind, subjectId: string): Promise<DashboardRouteData> {
	const [head, initialDashboard] = await loadPageOnServer({
		fetchPageHead: () => fetchDashboardPageHead({ dashboardKind, subjectId }),
		fetchPage: () => fetchDashboardWithoutSeries({ dashboardKind, subjectId }),
	})
	if (head === null) {
		throw notFound()
	}
	return { head, initialDashboard }
}

// the public read of the default selection, with its series left out of the server render and the page's payload
async function fetchDashboardWithoutSeries({
	dashboardKind,
	subjectId,
}: DashboardSubject): Promise<DashboardResponse | null> {
	const dashboard = await fetchDashboard({
		dashboardKind,
		subjectId,
		selection: toDefaultDashboardSelection(dashboardKind),
		hasFullAccess: false,
	})
	return dashboard && { ...dashboard, series: null }
}
