// a Dashboard chart's count, the views or plays, with the split into podcast plays and film plays that Podcast
// Dashboard includes, and the sums of several counts and of their people
import type { DashboardBar } from "@carlnotes/contracts/dashboards"

export type DashboardCount = Pick<DashboardBar, "count" | "podcastPlayCount" | "filmPlayCount">

/**
 * Returns the sum of several counts. The podcast and film split is kept only if some count includes it.
 */
export function sumDashboardCounts(dashboardCounts: DashboardCount[]): DashboardCount {
	const count = dashboardCounts.reduce((sum, dashboardCount) => sum + dashboardCount.count, 0)
	if (!dashboardCounts.some(hasPlaySplit)) {
		return { count }
	}

	// sum the split too, reading a missing side as none
	return {
		count,
		podcastPlayCount: dashboardCounts.reduce((sum, { podcastPlayCount = 0 }) => sum + podcastPlayCount, 0),
		filmPlayCount: dashboardCounts.reduce((sum, { filmPlayCount = 0 }) => sum + filmPlayCount, 0),
	}
}

/**
 * Returns the distinct people of several counts, summed.
 */
export function sumPeopleCounts(peopleCounts: { peopleCount: number }[]): number {
	return peopleCounts.reduce((sum, { peopleCount }) => sum + peopleCount, 0)
}

/**
 * Returns a count's fields alone, so an object that holds more never leaks its other fields into a series.
 */
export function toDashboardCountFields(dashboardCount: DashboardCount): DashboardCount {
	const { count, podcastPlayCount, filmPlayCount } = dashboardCount
	return hasPlaySplit(dashboardCount) ? { count, podcastPlayCount, filmPlayCount } : { count }
}

// whether a count includes the podcast and film split
function hasPlaySplit({ podcastPlayCount, filmPlayCount }: DashboardCount): boolean {
	return podcastPlayCount !== undefined || filmPlayCount !== undefined
}
