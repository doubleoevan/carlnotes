// read_activity: the topic and team invites waiting for the caller come back with the ids respond_to_invite takes,
// fenced, and a visitor is asked to connect an account
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { ActivityResponse } from "@carlnotes/contracts/activity"
import { MCP_VIEW_META_KEY } from "@carlnotes/contracts/mcpViews"
import type { TeamsPageResponse } from "@carlnotes/contracts/teams"
import { UNTRUSTED_DATA_TAG } from "@carlnotes/models/prompts/write"
import * as activity from "../activity"
import * as receivedInvites from "../invite/receivedInvites"
import * as teamsPage from "../team/teamsPage"
import * as mcpViewData from "./mcpViewData"
import { CONNECT_ACCOUNT_TEXT } from "./results"
import { toResultText, toToolHandler, VISITOR } from "./toolTestFixtures"

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

// a received invite as read_activity lists it
type McpReceivedInvite = { inviteId: string; kind: string; pageName: string }

// the sender both invites name
const SENDER = { userId: "user-2", username: "vienna", avatarSource: null, avatarVersion: null }

test("respond_to_invite accepts a team invite by the id read_activity lists", async () => {
	// a topic invite waiting on the activity page, and a team invite waiting on the teams page
	spyOn(activity, "loadActivity").mockResolvedValue({
		topics: [],
		subscriptions: [{ topicId: "topic-1", name: "Espresso", owner: SENDER, inviteId: "invite-1" }],
		invites: [],
	} as unknown as ActivityResponse)
	spyOn(teamsPage, "loadTeamsPage").mockResolvedValue({
		receivedInvites: [{ inviteId: "invite-2", teamId: "team-1", name: "Roasters", sender: SENDER }],
		sentInvites: [],
	} as unknown as TeamsPageResponse)
	spyOn(mcpViewData, "loadMcpViewSession").mockResolvedValue(null)
	const toolResult = await toToolHandler("read_activity")({})
	const receivedInviteItems = (toolResult.structuredContent as { receivedInvites: { items: McpReceivedInvite[] } })
		.receivedInvites.items

	// both invites, each with its id and its fenced name
	expect(receivedInviteItems.map((receivedInvite) => [receivedInvite.kind, receivedInvite.inviteId])).toEqual([
		["topic", "invite-1"],
		["team", "invite-2"],
	])
	expect(receivedInviteItems[1]?.pageName).toContain(UNTRUSTED_DATA_TAG)

	// the activity MCP view reads the activity as the Activity page reads it, unfenced
	expect(toolResult._meta?.[MCP_VIEW_META_KEY]).toMatchObject({
		activity: { activity: { subscriptions: [{ topicId: "topic-1", name: "Espresso" }] } },
	})

	// the listed team invite's id accepts it
	const acceptSpy = spyOn(receivedInvites, "acceptInvite").mockResolvedValue({
		status: "joinedTeam",
		teamId: "team-1",
		teamName: "Roasters",
	})
	const acceptResult = await toToolHandler("respond_to_invite")({ invite_id: "invite-2", is_accepted: true })
	expect(acceptSpy.mock.calls[0]?.slice(0, 2)).toEqual(["user-1", "invite-2"])
	expect(acceptResult.structuredContent).toMatchObject({ status: "joinedTeam", teamId: "team-1" })
})

test("a visitor is asked to connect an account", async () => {
	expect(toResultText(await toToolHandler("read_activity", VISITOR)({}))).toBe(CONNECT_ACCOUNT_TEXT)
})
