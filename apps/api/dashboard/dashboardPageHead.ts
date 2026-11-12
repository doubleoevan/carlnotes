// a Dashboard page's head. it is the profile's or team's own head renamed for the page, with Carl's paragraph or the
// public summary as its description and the public share image as its card, or the profile's or team's own image
// before one is drawn. it reads only the public snapshot
import {
	type DashboardKind,
	type DashboardSummary,
	toDashboardPageTitle,
	toDashboardPath,
	toDashboardReadAccess,
	toDashboardSummaryCounts,
} from "@carlnotes/contracts/dashboards"
import type { PageHead } from "@carlnotes/contracts/pageHead"
import { toPageTitle } from "@carlnotes/contracts/seo"
import { toCountLabel } from "@carlnotes/contracts/text"
import { appUrl } from "@carlnotes/server/appUrl"
import { toProfilePageHead, toTeamPageHead } from "../share/pageHead"
import { toProfilePreview, toTeamPreview } from "../share/preview"
import { loadDashboard } from "./dashboards"

/**
 * Returns a Dashboard page's head from its public snapshot, or null for a missing person, or a missing or private team.
 */
export async function loadDashboardPageHead(dashboardKind: DashboardKind, subjectId: string): Promise<PageHead | null> {
	// the person's or team's head and name, or nothing for a missing person or a missing or private team
	const subjectHead = await loadSubjectHead(dashboardKind, subjectId)
	if (!subjectHead) {
		return null
	}

	// the public summary and share image, with the paragraph a team's non-members never see left out of a team's head
	const readAccess = toDashboardReadAccess(dashboardKind, false)
	const dashboard = await loadDashboard({ dashboardKind, subjectId, selection: "summary", readAccess })
	const title = toPageTitle(toDashboardPageTitle(dashboardKind, subjectHead.subjectName))
	const pageUrl = `${appUrl()}${toDashboardPath({ dashboardKind, subjectId })}`
	const isIndexed = hasDashboardCounts(dashboard.summary)

	// the person's or team's head, renamed for the page, described by Carl's paragraph or the strip's counts
	return {
		...subjectHead.pageHead,
		title,
		cardTitle: title,
		description: dashboard.paragraph ?? toSummaryDescription(dashboard.summary),
		canonicalUrl: isIndexed ? pageUrl : null,
		cardUrl: pageUrl,
		imageUrl: dashboard.imageUrl ? `${appUrl()}${dashboard.imageUrl}` : subjectHead.pageHead.imageUrl,
		isIndexed,
		jsonLd: null,
	}
}

// the person's or team's own head and their name
async function loadSubjectHead(
	dashboardKind: DashboardKind,
	subjectId: string,
): Promise<{ pageHead: PageHead; subjectName: string } | null> {
	if (dashboardKind === "teamDashboard") {
		const teamPreview = await toTeamPreview(subjectId)
		return teamPreview ? { pageHead: toTeamPageHead(teamPreview, appUrl()), subjectName: teamPreview.name } : null
	}

	// a person's head and username
	const profilePreview = await toProfilePreview(subjectId)
	return profilePreview
		? { pageHead: toProfilePageHead(profilePreview, appUrl()), subjectName: profilePreview.username }
		: null
}

// whether the public summary counts a topic or a podcast
function hasDashboardCounts(summary: DashboardSummary): boolean {
	return summary.dashboardKind === "podcastDashboard" ? summary.podcastCount > 0 : summary.topicCount > 0
}

// the strip's counts as one sentence
function toSummaryDescription(summary: DashboardSummary): string {
	return `${toDashboardSummaryCounts(summary)
		.map(({ count, noun }) => toCountLabel(count, noun))
		.join(", ")}.`
}
