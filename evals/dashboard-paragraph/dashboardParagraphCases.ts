// the dashboard paragraph eval's cases, each a made-up Dashboard page's counts, periods, and places

import type { DashboardSummary } from "@carlnotes/contracts/dashboards"

// one map pin's place: a country code, with a region and city if Cloudflare knew them
type DashboardParagraphCasePlace = { country: string; region?: string; city?: string }

// one case. what the case tests, the summary strip, the visits or plays of the last 30 days and the 30 before, the
// places of the map's pins most first, and what the case's paragraph has to do beyond the checks every case gets
export type DashboardParagraphCase = {
	description: string
	summary: DashboardSummary
	lastPeriodCount: number
	priorPeriodCount: number
	places: DashboardParagraphCasePlace[]
	rubric?: string
}

// the cases, each a different kind of page
export const DASHBOARD_PARAGRAPH_CASES: DashboardParagraphCase[] = [
	{
		description: "a growing Topic Dashboard with visitors from three cities",
		summary: {
			dashboardKind: "topicDashboard",
			topicCount: 4,
			findingCount: 212,
			topicPostCount: 3,
			viewerCount: 1840,
		},
		lastPeriodCount: 420,
		priorPeriodCount: 260,
		places: [
			{ country: "US", region: "Oregon", city: "Bend" },
			{ country: "DE", region: "Berlin", city: "Berlin" },
			{ country: "JP", region: "Tokyo", city: "Tokyo" },
		],
		rubric:
			"The paragraph says the visits went up and names at least one of Bend, Berlin, or Tokyo. Fail the output if it says they went down or stayed flat, or names only countries.",
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
		places: [{ country: "GB" }, { country: "CA" }],
		rubric:
			"The paragraph says the plays went down, without blame or worry. Fail the output if it says they went up, scolds or worries the reader, calls the plays visits, or mentions topics.",
	},
	{
		description: "a brand new page with no visitors yet",
		summary: { dashboardKind: "topicDashboard", topicCount: 1, findingCount: 6, topicPostCount: 0, viewerCount: 0 },
		lastPeriodCount: 0,
		priorPeriodCount: 0,
		places: [],
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
		places: [{ country: "FR" }, { country: "ES" }, { country: "IT" }, { country: "PT" }, { country: "NL" }],
		rubric: "Fail the output if it names more than three countries, or names Portugal or the Netherlands.",
	},
]
