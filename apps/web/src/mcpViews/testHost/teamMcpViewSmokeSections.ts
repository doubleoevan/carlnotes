// the team MCP view through the test host: the header and sections, the room's load earlier through read_team with the
// cursor, and the link to the team page on the site
import { expect, test } from "bun:test"
import type { McpViewTeam } from "@carlnotes/contracts/mcpViews"
import { toTeamPath } from "@carlnotes/contracts/seo"
import { toTestTeamPage } from "@carlnotes/contracts/teamTestFixtures"
import { toTestChatRoomMessage } from "@/components/chat/chatRoomTestFixtures"
import { toMcpViewToolResult, USER_MCP_VIEW_DATA, VISITOR_MCP_VIEW_DATA } from "./mcpViewFixtures"
import { waitForRecord, withMcpView } from "./mcpViewTestHarness"
import { type McpViewToolResult, type OpenMcpViewOptions, TEST_SITE_URL } from "./mcpViewTestHost"

// the team the view reads, as a member reads it
const TEAM_PAGE = toTestTeamPage()

// the room's newest message with older ones above it, and the message of the page the cursor reads
const NEWEST_MESSAGE = toTestChatRoomMessage({ id: 42, content: "Who has the new burrs?" })
const EARLIER_MESSAGE = toTestChatRoomMessage({ id: 17, content: "The grinder arrived today." })

/**
 * Returns a read_team result: a member's team page with its notes and the room's newest messages, or a visitor's
 * without the room.
 */
export function toTeamToolResult({ isMember = true }: { isMember?: boolean } = {}): McpViewToolResult {
	// a visitor has no role and no room
	const team: McpViewTeam = {
		teamPage: isMember ? TEAM_PAGE : { ...TEAM_PAGE, role: null },
		notesResponse: { pageName: TEAM_PAGE.name, creatableVisibilities: [], notes: [] },
		chatMessagePage: isMember
			? { chatMessages: [NEWEST_MESSAGE], hasEarlierChatMessages: true, isVoiceChatConfigured: false }
			: null,
	}
	// the caller's session beside the team
	const mcpViewData = isMember ? USER_MCP_VIEW_DATA : VISITOR_MCP_VIEW_DATA
	return toMcpViewToolResult({ mcpViewData: { ...mcpViewData, team } })
}

// the result of the load earlier's call: the page above the cursor, with nothing older
const EARLIER_TOOL_RESULT = toMcpViewToolResult({
	mcpViewData: {
		...USER_MCP_VIEW_DATA,
		team: {
			teamPage: TEAM_PAGE,
			notesResponse: null,
			chatMessagePage: { chatMessages: [EARLIER_MESSAGE], hasEarlierChatMessages: false, isVoiceChatConfigured: false },
		},
	},
})

test("the team MCP view shows the header, the sections, and a member's room, and calls no tool on load", async () => {
	await withMcpView({ mcpView: "team" }, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toTeamToolResult())
		await frame.getByRole("heading", { level: 1, name: TEAM_PAGE.name }).waitFor()

		// the page's sections, then the room's newest message, read with no tool call
		await frame.getByText("Team members").waitFor()
		await frame.getByText("All Topics").waitFor()
		await frame.getByText("Team notes").waitFor()
		await frame.getByText(NEWEST_MESSAGE.content).waitFor()
		expect(toolCalls).toEqual([])
	})
})

test("load earlier calls read_team with the oldest message's cursor and shows the older page above", async () => {
	const options: OpenMcpViewOptions = { mcpView: "team", respondToToolCall: () => EARLIER_TOOL_RESULT }
	await withMcpView(options, async ({ frame, toolCalls, sendToolResult }) => {
		await sendToolResult(toTeamToolResult())
		await frame.getByRole("button", { name: "Load earlier messages" }).click()

		// the older message shows, and with nothing older the button leaves
		await frame.getByText(EARLIER_MESSAGE.content).waitFor()
		expect(toolCalls).toEqual([
			{ name: "read_team", arguments: { team_id: TEAM_PAGE.teamId, cursor: String(NEWEST_MESSAGE.id) } },
		])
		expect(await frame.getByRole("button", { name: "Load earlier messages" }).count()).toBe(0)
	})
})

test("a visitor's team MCP view has no room, and its link opens the team page on the site", async () => {
	await withMcpView({ mcpView: "team" }, async ({ frame, links, sendToolResult }) => {
		await sendToolResult(toTeamToolResult({ isMember: false }))
		await frame.getByRole("heading", { level: 1, name: TEAM_PAGE.name }).waitFor()
		expect(await frame.getByText("Team chat").count()).toBe(0)

		// the link opens the team page through the host
		await frame.getByRole("link", { name: "Open on CarlNotes" }).click()
		await waitForRecord(links)
		expect(links[0]).toBe(`${TEST_SITE_URL}${toTeamPath(TEAM_PAGE.teamId)}`)
	})
})
