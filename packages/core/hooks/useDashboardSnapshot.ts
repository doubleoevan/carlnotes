// a Dashboard's snapshot for one chart selection, read once per selection and shared by every chart that shows it
import { fetchDashboard } from "@carlnotes/client/dashboardClient"
import {
	type DashboardChartSelection,
	type DashboardKind,
	type DashboardResponse,
	type DashboardSubject,
	toDashboardReadAccess,
} from "@carlnotes/contracts/dashboards"
import { useQuery } from "@tanstack/react-query"

// the Dashboard, the selection, whether the user reads the full snapshot, the read to start from, and whether that read
// is already the full one
type UseDashboardSnapshotOptions = {
	dashboardKind: DashboardKind
	subjectId: string
	selection: DashboardChartSelection
	hasFullAccess: boolean
	initialDashboard?: DashboardResponse | null
	isInitialDashboardFull?: boolean
}

// the snapshot, whether it is still loading, and whether the read failed. until a read lands, the snapshot is the read
// to start from, and null with full access
type DashboardSnapshotState = { dashboard: DashboardResponse | null; isLoading: boolean; hasFailed: boolean }

/**
 * Returns the query key every snapshot of one Dashboard starts with.
 */
export function toDashboardQueryKey({
	dashboardKind,
	subjectId,
}: DashboardSubject): readonly ["dashboard", DashboardKind, string] {
	return ["dashboard", dashboardKind, subjectId]
}

/**
 * Reads one selection's snapshot, starting from the given read only if it is complete.
 */
export function useDashboardSnapshot({
	dashboardKind,
	subjectId,
	selection,
	hasFullAccess,
	initialDashboard,
	isInitialDashboardFull = false,
}: UseDashboardSnapshotOptions): DashboardSnapshotState {
	// start from a full read, a team's summary for a non-member, or a public read with its series. the server's read of
	// a person's Dashboard has no series, so it starts nothing
	const readAccess = toDashboardReadAccess(dashboardKind, hasFullAccess)
	const isInitialDashboardComplete =
		isInitialDashboardFull ||
		readAccess === "summaryOnly" ||
		(readAccess === "public" && Boolean(initialDashboard?.series))
	const dashboardQuery = useQuery({
		queryKey: [...toDashboardQueryKey({ dashboardKind, subjectId }), selection, hasFullAccess],
		queryFn: ({ signal }) => fetchDashboard({ dashboardKind, subjectId, selection, hasFullAccess, signal }),
		initialData: isInitialDashboardComplete ? (initialDashboard ?? undefined) : undefined,
		staleTime: Number.POSITIVE_INFINITY,
	})

	// the read, or until it lands the read to start from, which full access never shows
	const dashboard = dashboardQuery.data ?? (hasFullAccess ? null : (initialDashboard ?? null))
	return { dashboard, isLoading: dashboardQuery.isPending, hasFailed: dashboardQuery.isError }
}
