// the api client for a Dashboard page's snapshot: the summary strip, Carl's paragraph, the share image, and one chart
// selection's series
import {
	type DashboardChartSelection,
	type DashboardKind,
	type DashboardMapSettings,
	type DashboardResponse,
	dashboardMapSettings,
	dashboardResponse,
	toDashboardQuery,
} from "@carlnotes/contracts/dashboards"
import { apiClient, readApiResponse, toReadRequestInit } from "./apiClient"

// the Dashboard, the chart selection, whether the user may read the full snapshot, and the read's abort signal
type FetchDashboardOptions = {
	dashboardKind: DashboardKind
	subjectId: string
	selection: DashboardChartSelection
	hasFullAccess: boolean
	signal?: AbortSignal
}

/**
 * Fetches a Dashboard's snapshot for one selection, or null for a Dashboard that is missing or that the user may not
 * read. The public snapshot is fetched without credentials. Any other failed read throws an error.
 */
export async function fetchDashboard({
	dashboardKind,
	subjectId,
	selection,
	hasFullAccess,
	signal,
}: FetchDashboardOptions): Promise<DashboardResponse | null> {
	// a person or team the api does not have, or a private team, reads as missing
	const response = await apiClient().api.dashboards[":dashboardKind"][":subjectId"].$get(
		{ param: { dashboardKind, subjectId }, query: toDashboardQuery(selection) },
		{ init: toReadRequestInit({ isPublic: !hasFullAccess, signal }) },
	)
	if (response.status === 404) {
		return null
	}

	// any other failed read is an error
	if (!response.ok) {
		throw new Error(`dashboard read failed: ${response.status}`)
	}
	return readApiResponse(dashboardResponse, response)
}

/**
 * Fetches the web map's Google Maps settings, or none of them if the read fails.
 */
export async function fetchDashboardMapSettings(): Promise<DashboardMapSettings> {
	const response = await apiClient()
		.api.dashboards["map-settings"].$get()
		.catch(() => null)
	return response?.ok ? readApiResponse(dashboardMapSettings, response) : { apiKey: null, mapId: null }
}
