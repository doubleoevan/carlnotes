// the read_dashboard tool: a visitor with no one named, the caller's own Podcast Dashboard, a team read by someone not
// on it, and a Dashboard the caller cannot open
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { DashboardSummary } from "@carlnotes/contracts/dashboards"
import { MCP_VIEW_META_KEY, type McpViewData } from "@carlnotes/contracts/mcpViews"
import { UNTRUSTED_DATA_TAG } from "@carlnotes/models/prompts/write"
import * as dashboards from "../dashboard/dashboards"
import * as mcpViewDataModule from "./mcpViewData"
import { CONNECT_ACCOUNT_TEXT } from "./results"
import { type RegisteredToolHandler, toRegisteredTools, toResultText, USER, VISITOR } from "./toolTestFixtures"

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

// the caller's Podcast Dashboard summary, and a team's
const PODCAST_SUMMARY: DashboardSummary = {
	dashboardKind: "podcastDashboard",
	podcastCount: 2,
	podcastEpisodeCount: 9,
	podcastPlayCount: 120,
	filmPlayCount: 30,
}
const TEAM_SUMMARY: DashboardSummary = {
	dashboardKind: "teamDashboard",
	topicCount: 4,
	findingCount: 80,
	topicPostCount: 1,
	memberCount: 3,
	viewerCount: 21,
}

// whose Dashboards the reads name
const CALLER_SUBJECT = {
	subjectKind: "user" as const,
	user: { userId: "user-1", username: "vienna", avatarSource: null, avatarVersion: null },
}
const TEAM_SUBJECT = { subjectKind: "team" as const, team: { teamId: "team-1", name: "Roasters", avatarVersion: null } }

// the read_dashboard handler a caller gets, with the MCP view's caller read with no database
function toDashboardHandler(...registeredToolOptions: Parameters<typeof toRegisteredTools>): RegisteredToolHandler {
	spyOn(mcpViewDataModule, "loadMcpViewSession").mockResolvedValue(null)
	const handler = toRegisteredTools(...registeredToolOptions).get("read_dashboard")?.handler
	if (!handler) {
		throw new Error("read_dashboard is not registered")
	}
	return handler
}

test("a visitor who names no one reads that an account is needed", async () => {
	const accessSpy = spyOn(dashboards, "loadDashboardAccess")
	expect(toResultText(await toDashboardHandler(VISITOR)({ dashboardKind: "podcasts" }))).toBe(CONNECT_ACCOUNT_TEXT)
	expect(accessSpy).not.toHaveBeenCalled()
})

test("the caller's podcasts return their Podcast Dashboard strip, Carl's fenced paragraph, and the page url", async () => {
	const accessSpy = spyOn(dashboards, "loadDashboardAccess").mockResolvedValue({
		readAccess: "full",
		subject: CALLER_SUBJECT,
	})
	const dashboardSpy = spyOn(dashboards, "loadDashboard").mockResolvedValue({
		day: "2026-11-10",
		summary: PODCAST_SUMMARY,
		paragraph: "The week ran on LLM tooling.",
		imageUrl: null,
		series: null,
	})
	const toolResult = await toDashboardHandler(USER)({ dashboardKind: "podcasts" })

	// the caller's own Podcast Dashboard at the full level, on the podcast page's first format
	expect(accessSpy).toHaveBeenCalledWith({ userId: "user-1", dashboardKind: "podcastDashboard", subjectId: "user-1" })
	expect(dashboardSpy).toHaveBeenCalledWith({
		dashboardKind: "podcastDashboard",
		subjectId: "user-1",
		selection: "both",
		readAccess: "full",
	})

	// the strip, the paragraph inside the fence, the day, and the page url
	const structuredContent = toolResult.structuredContent as Record<string, unknown>
	expect(structuredContent.pageName).toBe("Podcast Specials")
	expect(structuredContent.day).toBe("2026-11-10")
	expect(structuredContent.summary).toEqual(PODCAST_SUMMARY)
	expect(structuredContent.paragraph).toContain(UNTRUSTED_DATA_TAG)
	expect(structuredContent.paragraph).toContain("The week ran on LLM tooling.")
	expect(structuredContent.url).toEndWith("/profiles/user-1/specials/podcasts")

	// the MCP view reads the whole read at the caller's access
	const mcpViewData = toolResult._meta?.[MCP_VIEW_META_KEY] as McpViewData
	expect(mcpViewData.dashboard).toMatchObject({
		dashboardKind: "podcastDashboard",
		subjectId: "user-1",
		hasFullAccess: true,
		dashboard: { subject: CALLER_SUBJECT, summary: PODCAST_SUMMARY },
	})
})

test("someone not on a team reads its summary strip and no paragraph, and the view shows no charts", async () => {
	spyOn(dashboards, "loadDashboardAccess").mockResolvedValue({ readAccess: "summaryOnly", subject: TEAM_SUBJECT })
	spyOn(dashboards, "loadDashboard").mockResolvedValue({
		day: "2026-11-10",
		summary: TEAM_SUMMARY,
		paragraph: null,
		imageUrl: null,
		series: null,
	})
	const toolResult = await toDashboardHandler(USER)({ dashboardKind: "team", teamId: "team-1" })

	// the strip with no paragraph, and a view that shows the strip alone
	const structuredContent = toolResult.structuredContent as Record<string, unknown>
	expect(structuredContent.pageName).toBe("Team Specials")
	expect(structuredContent.paragraph).toBeNull()
	expect(structuredContent.url).toEndWith("/teams/team-1/specials")
	const mcpViewData = toolResult._meta?.[MCP_VIEW_META_KEY] as McpViewData
	expect(mcpViewData.dashboard).toMatchObject({ hasFullAccess: false })
})

test("a Dashboard the caller cannot open returns an error and reads no snapshot", async () => {
	spyOn(dashboards, "loadDashboardAccess").mockResolvedValue(null)
	const dashboardSpy = spyOn(dashboards, "loadDashboard")
	const toolResult = await toDashboardHandler(USER)({ dashboardKind: "team", teamId: "team-private" })
	expect(toolResult.isError).toBe(true)
	expect(dashboardSpy).not.toHaveBeenCalled()
})
