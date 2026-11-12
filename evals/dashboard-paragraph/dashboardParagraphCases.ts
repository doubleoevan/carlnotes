// the dashboard paragraph eval's cases, each a made-up Dashboard page's counts, periods, and countries

import type { DashboardSummary } from "@carlnotes/contracts/dashboards"

// one case. what the case tests, the summary strip, the visits or plays of the last 30 days and the 30 before, the
// country codes of the map's pins most first, and what the case's paragraph has to do beyond the checks every case gets
export type DashboardParagraphCase = {
	description: string
	summary: DashboardSummary
	lastPeriodCount: number
	priorPeriodCount: number
	countries: string[]
	rubric?: string
}

// the cases, each a different kind of page
export const DASHBOARD_PARAGRAPH_CASES: DashboardParagraphCase[] = [
	{
		description: "a growing Topic Dashboard with visitors from three countries",
		summary: {
			dashboardKind: "topicDashboard",
			topicCount: 4,
			findingCount: 212,
			topicPostCount: 3,
			viewerCount: 1840,
		},
		lastPeriodCount: 420,
		priorPeriodCount: 260,
		countries: ["US", "DE", "JP"],
		rubric: "The paragraph says the visits went up. Fail the output if it says they went down or stayed flat.",
	},
	{
		description: "a quieter month on a Podcast Dashboard",
		summary: {
			dashboardKind: "podcastDashboard",
			podcastCount: 2,
			podcastEpisodeCount: 31,
			podcastPlayCount: 900,
			filmPlayCount: 140,
		},
		lastPeriodCount: 70,
		priorPeriodCount: 110,
		countries: ["GB", "CA"],
		rubric:
			"The paragraph says the plays went down, without blame or worry. Fail the output if it says they went up, scolds or worries the reader, calls the plays visits, or mentions topics.",
	},
	{
		description: "a brand new page with no visitors yet",
		summary: { dashboardKind: "topicDashboard", topicCount: 1, findingCount: 6, topicPostCount: 0, viewerCount: 0 },
		lastPeriodCount: 0,
		priorPeriodCount: 0,
		countries: [],
		rubric:
			"The paragraph says plainly and kindly that nobody has visited yet. Fail the output if it invents visitors, a place, or a reason.",
	},
	{
		description: "a team page names its members and at most three places",
		summary: {
			dashboardKind: "teamDashboard",
			topicCount: 9,
			findingCount: 540,
			topicPostCount: 12,
			memberCount: 5,
			viewerCount: 860,
		},
		lastPeriodCount: 300,
		priorPeriodCount: 300,
		countries: ["FR", "ES", "IT", "PT", "NL"],
		rubric: "Fail the output if it names more than three countries, or names Portugal or the Netherlands.",
	},
]
