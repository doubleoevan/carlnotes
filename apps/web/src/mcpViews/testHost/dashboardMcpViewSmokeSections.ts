// the dashboard MCP view through the test host: the header, the links to the three Dashboard pages, the summary, Carl's
// paragraph, and the five chart sections with the outline map, a chart's choice read through read_dashboard, and a
// team's summary alone
import { expect, test } from "bun:test"
import {
	DASHBOARD_CHART_IMAGE_LABELS,
	DASHBOARD_CHART_TITLES,
	dashboardChartNames,
} from "@carlnotes/core/lib/dashboardCharts"
import { PODCAST_DASHBOARD_RESULT, TOPIC_DASHBOARD_RESULT, toDashboardToolResult } from "./mcpViewFixtures"
import { waitForRecord, withMcpView } from "./mcpViewTestHarness"
import type { OpenMcpViewOptions } from "./mcpViewTestHost"

// the five chart sections' titles, top to bottom
const CHART_SECTION_TITLES = dashboardChartNames.map((chartName) => DASHBOARD_CHART_TITLES[chartName])

test("the dashboard MCP view shows the header, the summary, the paragraph, and five open charts, calling no tool", async () => {
	await withMcpView({ mcpView: "dashboard" }, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toDashboardToolResult())

		// the page's header with the subject header's name and summary, then Carl's paragraph
		await frame.getByRole("heading", { name: "Topic Daily Specials" }).waitFor()
		await frame.getByRole("link", { name: "vienna" }).waitFor()
		await frame.getByText("418 findings").waitFor()
		await frame.getByText(TOPIC_DASHBOARD_RESULT.dashboard.paragraph ?? "").waitFor()

		// the caller's three Dashboard pages, Team Dashboard opening on their first team
		const dashboardPageLinks = frame.getByRole("navigation", { name: "Specials" }).getByRole("link")
		expect(await dashboardPageLinks.allTextContents()).toEqual(["Topic Specials", "Podcast Specials", "Team Specials"])
		expect(await dashboardPageLinks.last().getAttribute("href")).toEndWith("/teams/specials")

		// every chart section open, with the outline map drawn in place of Google Maps
		for (const title of CHART_SECTION_TITLES) {
			expect(await frame.getByRole("button", { name: title }).getAttribute("aria-expanded")).toBe("true")
		}
		await frame.locator(`[aria-label="${DASHBOARD_CHART_IMAGE_LABELS.map}"] path`).first().waitFor()
		expect(toolCalls).toEqual([])
	})
})

test("a chart's choice reads its selection through read_dashboard", async () => {
	const options: OpenMcpViewOptions = {
		mcpView: "dashboard",
		respondToToolCall: () => toDashboardToolResult(PODCAST_DASHBOARD_RESULT),
	}
	await withMcpView(options, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toDashboardToolResult(PODCAST_DASHBOARD_RESULT))
		// the radio input is hidden behind its label, which takes the click
		const formatGroupName = `${DASHBOARD_CHART_TITLES.bar} format`
		await frame.getByRole("group", { name: formatGroupName }).getByText("Films", { exact: true }).click()
		await waitForRecord(toolCalls, 1)
		expect(toolCalls).toEqual([
			{ name: "read_dashboard", arguments: { dashboardKind: "podcasts", userId: "user-vienna", selection: "video" } },
		])
	})
})

test("a non-member sees a team's summary and no chart sections", async () => {
	await withMcpView({ mcpView: "dashboard" }, async ({ frame, sendToolResult }) => {
		const teamDashboard = {
			...TOPIC_DASHBOARD_RESULT,
			dashboardKind: "teamDashboard" as const,
			hasFullAccess: false,
			dashboard: {
				...TOPIC_DASHBOARD_RESULT.dashboard,
				subject: { subjectKind: "team" as const, team: { teamId: "team-1", name: "Roasters", avatarVersion: null } },
				summary: {
					dashboardKind: "teamDashboard" as const,
					topicCount: 4,
					findingCount: 80,
					topicPostCount: 1,
					memberCount: 3,
					viewerCount: 21,
				},
				paragraph: null,
				series: null,
			},
		}
		await sendToolResult(toDashboardToolResult(teamDashboard))
		await frame.getByRole("heading", { name: "Team Daily Specials" }).waitFor()
		await frame.getByText("80 findings").waitFor()
		expect(await frame.getByRole("button", { name: DASHBOARD_CHART_TITLES.bar }).count()).toBe(0)
	})
})
