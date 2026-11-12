// the Dashboard paths: a team's Team Dashboard and the path that opens the user's first team both read as Team
// Dashboard, and a profile page's and a team page's viewer count line link to their Dashboards
import { expect, test } from "bun:test"
import { isTeamDashboardPath, toDashboardLinks, toDashboardPageLinks, toDashboardPath } from "./dashboards"

test("a team's Team Dashboard and the first team's path read as Team Dashboard, and other team pages do not", () => {
	expect(isTeamDashboardPath(toDashboardPath({ dashboardKind: "teamDashboard", subjectId: "team-1" }))).toBe(true)
	expect(isTeamDashboardPath("/teams/specials")).toBe(true)

	// a team's own page, the Teams page, and a person's Topic Dashboard
	expect(isTeamDashboardPath("/teams/team-1")).toBe(false)
	expect(isTeamDashboardPath("/teams")).toBe(false)
	expect(isTeamDashboardPath(toDashboardPath({ dashboardKind: "topicDashboard", subjectId: "user-1" }))).toBe(false)
})

test("a person's Dashboard pages list their Topic and Podcast Dashboards, then the path to their first team's", () => {
	expect(toDashboardPageLinks("user-1")).toEqual([
		{ dashboardKind: "topicDashboard", label: "Topic Specials", path: "/profiles/user-1/specials/topics" },
		{ dashboardKind: "podcastDashboard", label: "Podcast Specials", path: "/profiles/user-1/specials/podcasts" },
		{ dashboardKind: "teamDashboard", label: "Team Specials", path: "/teams/specials" },
	])
})

test("the viewer count line links a profile to its Topic and Podcast Dashboards and a team to its Team Dashboard", () => {
	expect(toDashboardLinks({ kind: "profile", id: "user-vienna" })).toEqual([
		{ label: "Topic Specials", path: "/profiles/user-vienna/specials/topics" },
		{ label: "Podcast Specials", path: "/profiles/user-vienna/specials/podcasts" },
	])

	// a team page links its Team Dashboard, and a Topic Post page links none
	expect(toDashboardLinks({ kind: "team", id: "team-1", isPublic: true })).toEqual([
		{ label: "Team Specials", path: "/teams/team-1/specials" },
	])
	expect(toDashboardLinks({ kind: "topicPost", id: "post-1", isPublic: true })).toEqual([])
})
