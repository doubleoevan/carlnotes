// the profile MCP view through the test host: the header and the sections with no tool call, the news's See all, a
// table's links, and the user's own Café with no owner control
import { expect, test } from "bun:test"
import type { McpViewData } from "@carlnotes/contracts/mcpViews"
import { toProfilePageTitle } from "@carlnotes/contracts/profilePage"
import { toTestProfile } from "@carlnotes/contracts/profileTestFixtures"
import { toProfilePath, toTeamPath } from "@carlnotes/contracts/seo"
import { toNewsStoryPage } from "@carlnotes/core/lib/newsStories"
import { toMcpViewToolResult, USER_MCP_VIEW_DATA, VISITOR_MCP_VIEW_DATA } from "./mcpViewFixtures"
import { waitForRecord, withMcpView } from "./mcpViewTestHarness"
import { type McpViewToolResult, TEST_SITE_URL } from "./mcpViewTestHost"

// the person whose Café the view shows, and its heading
const PROFILE = toTestProfile()
const PROFILE_TITLE = toProfilePageTitle(PROFILE.username)

/**
 * Returns a read_profile result: the Café with the week's first page of news, which has more pages after it, as a
 * visitor reads it or as its own person does.
 */
export function toProfileToolResult({ isOwnProfile = false }: { isOwnProfile?: boolean } = {}): McpViewToolResult {
	const mcpViewData: McpViewData = isOwnProfile ? USER_MCP_VIEW_DATA : VISITOR_MCP_VIEW_DATA
	return toMcpViewToolResult({
		mcpViewData: { ...mcpViewData, profile: { profile: PROFILE, newsPage: toNewsStoryPage(1), isOwnProfile } },
	})
}

test("the profile MCP view shows the header, the news, and the sections, and calls no tool on load", async () => {
	await withMcpView({ mcpView: "profile" }, async ({ frame, links, toolCalls, sendToolResult }) => {
		// the header, then the tables' sections
		await sendToolResult(toProfileToolResult())
		await frame.getByRole("heading", { level: 1, name: PROFILE_TITLE }).waitFor()
		await frame.getByRole("button", { name: /All Topics/ }).waitFor()
		await frame.getByRole("button", { name: /All Teams/ }).waitFor()

		// the news has no window picker, no table has a switch, and no tool reads anything
		expect(await frame.getByRole("button", { name: "Week", exact: true }).count()).toBe(0)
		expect(await frame.getByRole("switch").count()).toBe(0)
		expect(toolCalls).toEqual([])

		// the news's later pages are on the profile page
		await frame.getByRole("link", { name: "See all on CarlNotes" }).click()
		await waitForRecord(links)
		expect(links[0]).toBe(`${TEST_SITE_URL}${toProfilePath(PROFILE.userId)}`)
	})
})

test("a topic's and a team's links open their pages through the host", async () => {
	await withMcpView({ mcpView: "profile" }, async ({ frame, links, toolCalls, sendToolResult }) => {
		await sendToolResult(toProfileToolResult())

		// a topic's name in the topics table
		const [topic] = PROFILE.topics
		await frame.getByRole("link", { name: topic?.name }).first().click()
		await waitForRecord(links)
		expect(links[0]).toStartWith(`${TEST_SITE_URL}/topics/${topic?.id}`)

		// a team's name in the teams table, whose counts open no subtable
		const [team] = PROFILE.teams
		await frame.getByRole("link", { name: team?.name }).first().click()
		await waitForRecord(links, 2)
		expect(links[1]).toBe(`${TEST_SITE_URL}${toTeamPath(team?.teamId ?? "")}`)
		expect(toolCalls).toEqual([])
	})
})

test("the user's own Café links its heading to the account page and shows no topics loading", async () => {
	await withMcpView({ mcpView: "profile" }, async ({ frame, links, sendToolResult }) => {
		// the own topics show as the profile holds them, with no load
		await sendToolResult(toProfileToolResult({ isOwnProfile: true }))
		expect(await frame.getByRole("button", { name: "Retry loading topics" }).count()).toBe(0)

		// the heading opens the account page on the site
		await frame.getByRole("link", { name: PROFILE_TITLE }).click()
		await waitForRecord(links)
		expect(links[0]).toBe(`${TEST_SITE_URL}/account`)
	})
})
